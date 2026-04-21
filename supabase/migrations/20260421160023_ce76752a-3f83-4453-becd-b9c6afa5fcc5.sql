-- v0.15.1 — Étape 2 (corrigée) : init, backfill, RLS, triggers

-- 1. Init statuts (toutes les nouvelles valeurs enum sont déjà committées)
UPDATE public.devis SET statut = 'signe' WHERE statut <> 'termine';

-- 2. Backfill assignations : affaires mono-devis (1 seul devis actif)
WITH affaires_mono_devis AS (
  SELECT d.affaire_id, d.id AS devis_id
  FROM public.devis d
  WHERE d.statut IN ('signe', 'termine')
    AND d.affaire_id IN (
      SELECT affaire_id FROM public.devis
      WHERE statut IN ('signe', 'termine')
      GROUP BY affaire_id
      HAVING COUNT(*) = 1
    )
)
UPDATE public.assignations a
   SET devis_id = amd.devis_id,
       updated_at = now()
  FROM affaires_mono_devis amd
 WHERE a.affaire_id = amd.affaire_id
   AND a.devis_id IS NULL;

-- 3. Backfill heures depuis assignation
UPDATE public.heures_saisies hs
   SET devis_id = a.devis_id
  FROM public.assignations a
 WHERE hs.assignation_id = a.id
   AND hs.devis_id IS NULL
   AND a.devis_id IS NOT NULL;

-- 4. Backfill heures sans assignation : mono-devis
WITH affaires_mono_devis AS (
  SELECT d.affaire_id, d.id AS devis_id
  FROM public.devis d
  WHERE d.statut IN ('signe', 'termine')
    AND d.affaire_id IN (
      SELECT affaire_id FROM public.devis
      WHERE statut IN ('signe', 'termine')
      GROUP BY affaire_id
      HAVING COUNT(*) = 1
    )
)
UPDATE public.heures_saisies hs
   SET devis_id = amd.devis_id
  FROM affaires_mono_devis amd
 WHERE hs.affaire_id = amd.affaire_id
   AND hs.devis_id IS NULL;

-- 5. Helper : devis terminé ?
CREATE OR REPLACE FUNCTION public.is_devis_termine(_devis_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.devis WHERE id = _devis_id AND statut = 'termine'
  );
$$;

-- 6. RLS assignations : split policy ALL
DROP POLICY IF EXISTS assignations_admin_chef_modify ON public.assignations;

CREATE POLICY assignations_insert_chef_admin
  ON public.assignations FOR INSERT TO authenticated
  WITH CHECK (
    is_chef_or_admin()
    AND (devis_id IS NULL OR NOT public.is_devis_termine(devis_id) OR is_admin())
  );

CREATE POLICY assignations_update_chef_admin
  ON public.assignations FOR UPDATE TO authenticated
  USING (
    is_chef_or_admin()
    AND (is_admin() OR devis_id IS NULL OR NOT public.is_devis_termine(devis_id))
  )
  WITH CHECK (
    is_chef_or_admin()
    AND (is_admin() OR devis_id IS NULL OR NOT public.is_devis_termine(devis_id))
  );

CREATE POLICY assignations_delete_chef_admin
  ON public.assignations FOR DELETE TO authenticated
  USING (
    is_chef_or_admin()
    AND (is_admin() OR devis_id IS NULL OR NOT public.is_devis_termine(devis_id))
  );

-- 7. RLS heures_saisies : verrouillage post-livraison
DROP POLICY IF EXISTS heures_saisies_self_update ON public.heures_saisies;

CREATE POLICY heures_saisies_self_update
  ON public.heures_saisies FOR UPDATE TO authenticated
  USING (
    is_admin()
    OR (
      is_chef_or_admin()
      AND (devis_id IS NULL OR NOT public.is_devis_termine(devis_id))
    )
    OR (
      employe_id IN (SELECT id FROM employes WHERE profile_id = auth.uid())
      AND statut = 'brouillon'::heures_statut
      AND (devis_id IS NULL OR NOT public.is_devis_termine(devis_id))
    )
  )
  WITH CHECK (
    is_admin()
    OR (
      is_chef_or_admin()
      AND (devis_id IS NULL OR NOT public.is_devis_termine(devis_id))
    )
    OR (
      employe_id IN (SELECT id FROM employes WHERE profile_id = auth.uid())
      AND statut = ANY (ARRAY['brouillon'::heures_statut, 'soumis'::heures_statut])
      AND (devis_id IS NULL OR NOT public.is_devis_termine(devis_id))
    )
  );

DROP POLICY IF EXISTS heures_saisies_admin_chef_delete ON public.heures_saisies;

CREATE POLICY heures_saisies_admin_chef_delete
  ON public.heures_saisies FOR DELETE TO authenticated
  USING (
    is_admin()
    OR (
      is_chef_or_admin()
      AND (devis_id IS NULL OR NOT public.is_devis_termine(devis_id))
    )
  );

-- 8. Trigger d'audit : log éditions admin post-livraison
CREATE OR REPLACE FUNCTION public.log_admin_edit_post_livraison()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_admin boolean;
  _admin_email text;
BEGIN
  IF NEW.devis_id IS NULL OR NOT public.is_devis_termine(NEW.devis_id) THEN
    RETURN NEW;
  END IF;

  SELECT public.is_admin() INTO _is_admin;
  IF NOT _is_admin THEN RETURN NEW; END IF;

  SELECT email INTO _admin_email FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.heures_saisies_historique (
    heure_saisie_id, user_id, ancien_statut, nouveau_statut, commentaire
  )
  VALUES (
    NEW.id, auth.uid(), OLD.statut, NEW.statut,
    format('⚠️ Édition post-livraison par admin %s', COALESCE(_admin_email, auth.uid()::text))
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_admin_edit_post_livraison ON public.heures_saisies;
CREATE TRIGGER trg_log_admin_edit_post_livraison
  AFTER UPDATE ON public.heures_saisies
  FOR EACH ROW
  EXECUTE FUNCTION public.log_admin_edit_post_livraison();

-- 9. Trigger devis : auto-fill livre_le / livre_par
CREATE OR REPLACE FUNCTION public.guard_devis_livraison()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.statut IS DISTINCT FROM NEW.statut THEN
    IF NEW.statut = 'termine' AND OLD.statut <> 'termine' THEN
      NEW.livre_le := COALESCE(NEW.livre_le, now());
      NEW.livre_par := COALESCE(NEW.livre_par, auth.uid());
    ELSIF NEW.statut <> 'termine' AND OLD.statut = 'termine' THEN
      NEW.livre_le := NULL;
      NEW.livre_par := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_devis_livraison ON public.devis;
CREATE TRIGGER trg_guard_devis_livraison
  BEFORE UPDATE ON public.devis
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_devis_livraison();

-- 10. Ré-ouverture : admin only
CREATE OR REPLACE FUNCTION public.guard_devis_reouverture()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.statut = 'termine'
     AND NEW.statut <> 'termine'
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Seul un administrateur peut ré-ouvrir un devis livré.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_devis_reouverture ON public.devis;
CREATE TRIGGER trg_guard_devis_reouverture
  BEFORE UPDATE ON public.devis
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_devis_reouverture();
