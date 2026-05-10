
-- ============================================================================
-- Sprint 1 Hub Chef Mobile — Phase 0 DB foundations
-- ============================================================================

-- 0.1 Vue agrégée des chefs par affaire (security_invoker pour respecter RLS affaires)
CREATE OR REPLACE VIEW public.v_chefs_par_affaire
WITH (security_invoker = on) AS
SELECT id AS affaire_id, chef_projet_id        AS employe_id, 'chef_projet'::text           AS role FROM public.affaires WHERE chef_projet_id        IS NOT NULL
UNION ALL
SELECT id, chef_chantier_id,         'chef_chantier'         FROM public.affaires WHERE chef_chantier_id         IS NOT NULL
UNION ALL
SELECT id, responsable_montage_id,   'responsable_montage'   FROM public.affaires WHERE responsable_montage_id   IS NOT NULL
UNION ALL
SELECT id, responsable_demontage_id, 'responsable_demontage' FROM public.affaires WHERE responsable_demontage_id IS NOT NULL
UNION ALL
SELECT id, charge_affaires_id,       'charge_affaires'       FROM public.affaires WHERE charge_affaires_id       IS NOT NULL
UNION ALL
SELECT affaire_id, respo_fab_id,     'respo_fab'             FROM public.fabrication_objets WHERE respo_fab_id IS NOT NULL AND archive = false;

COMMENT ON VIEW public.v_chefs_par_affaire IS 'Sprint 1 Hub Chef — agrège tous les rôles chef/responsable par affaire en lignes (affaire_id, employe_id, role).';

-- 0.2 RPC is_chef_on_affaire (générique, par employe_id)
CREATE OR REPLACE FUNCTION public.is_chef_on_affaire(_employe_id uuid, _affaire_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.v_chefs_par_affaire
    WHERE affaire_id = _affaire_id AND employe_id = _employe_id
  )
$$;

-- Helper compagnon : utilise auth.uid() → employes.profile_id
CREATE OR REPLACE FUNCTION public.current_user_is_chef_on_affaire(_affaire_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.v_chefs_par_affaire v
    JOIN public.employes e ON e.id = v.employe_id
    WHERE v.affaire_id = _affaire_id
      AND e.profile_id = auth.uid()
  )
$$;

-- 0.3 RPC mes_affaires_chef — retourne affaires + rôles agrégés
CREATE OR REPLACE FUNCTION public.mes_affaires_chef(_employe_id uuid)
RETURNS TABLE (
  affaire public.affaires,
  mes_roles text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a, ARRAY_AGG(DISTINCT v.role ORDER BY v.role) AS mes_roles
  FROM public.affaires a
  JOIN public.v_chefs_par_affaire v ON v.affaire_id = a.id
  WHERE v.employe_id = _employe_id
  GROUP BY a.id, a.*
  ORDER BY (a).date_debut DESC NULLS LAST;
$$;

-- 0.4 Table d'audit heures_validations
CREATE TABLE IF NOT EXISTS public.heures_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  heure_saisie_id uuid NOT NULL REFERENCES public.heures_saisies(id) ON DELETE CASCADE,
  valide_par_chef_id uuid NOT NULL REFERENCES public.employes(id) ON DELETE RESTRICT,
  valide_at timestamptz NOT NULL DEFAULT now(),
  action text NOT NULL CHECK (action IN ('validate','correct','reject')),
  valeur_avant numeric,
  valeur_apres numeric NOT NULL,
  commentaire text,
  role_au_moment text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_heures_validations_heure ON public.heures_validations(heure_saisie_id);
CREATE INDEX IF NOT EXISTS idx_heures_validations_chef  ON public.heures_validations(valide_par_chef_id, valide_at DESC);

ALTER TABLE public.heures_validations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "heures_validations_select_admin_chef_self"
ON public.heures_validations FOR SELECT TO authenticated
USING (
  is_admin()
  OR is_chef_or_admin()
  OR (heure_saisie_id IN (
    SELECT hs.id FROM public.heures_saisies hs
    JOIN public.employes e ON e.id = hs.employe_id
    WHERE e.profile_id = auth.uid()
  ))
);

CREATE POLICY "heures_validations_insert_chef_on_affaire"
ON public.heures_validations FOR INSERT TO authenticated
WITH CHECK (
  is_admin()
  OR (
    is_chef_or_admin()
    AND current_user_is_chef_on_affaire(
      (SELECT affaire_id FROM public.heures_saisies WHERE id = heure_saisie_id)
    )
  )
);

-- 0.6 Trigger d'audit auto sur heures_saisies
CREATE OR REPLACE FUNCTION public.audit_heures_validation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chef_employe_id uuid;
  v_role text;
  v_action text;
BEGIN
  -- Skip si rien de pertinent n'a changé
  IF (NEW.statut = OLD.statut)
     AND (COALESCE(NEW.heures_reelles, -1) = COALESCE(OLD.heures_reelles, -1)) THEN
    RETURN NEW;
  END IF;

  -- Identifie l'auteur de la validation
  SELECT id INTO v_chef_employe_id FROM public.employes WHERE profile_id = auth.uid() LIMIT 1;

  IF is_admin() THEN
    v_role := 'admin';
  ELSIF v_chef_employe_id IS NOT NULL AND is_chef_on_affaire(v_chef_employe_id, NEW.affaire_id) THEN
    SELECT string_agg(role, ',' ORDER BY role)
      INTO v_role
      FROM public.v_chefs_par_affaire
      WHERE affaire_id = NEW.affaire_id AND employe_id = v_chef_employe_id;
  ELSE
    -- Pas un chef ni admin → pas d'audit (saisie self employé classique)
    RETURN NEW;
  END IF;

  -- Détermine l'action
  IF OLD.statut <> 'valide' AND NEW.statut = 'valide' THEN
    v_action := 'validate';
  ELSIF NEW.statut = 'rejete' AND OLD.statut <> 'rejete' THEN
    v_action := 'reject';
  ELSE
    v_action := 'correct';
  END IF;

  INSERT INTO public.heures_validations (
    heure_saisie_id, valide_par_chef_id, action,
    valeur_avant, valeur_apres, commentaire, role_au_moment
  ) VALUES (
    NEW.id,
    COALESCE(v_chef_employe_id, NEW.valide_par, NEW.saisi_par),
    v_action,
    OLD.heures_reelles,
    COALESCE(NEW.heures_reelles, 0),
    NEW.commentaire,
    v_role
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS t_audit_validation_heures ON public.heures_saisies;
CREATE TRIGGER t_audit_validation_heures
AFTER UPDATE ON public.heures_saisies
FOR EACH ROW
EXECUTE FUNCTION public.audit_heures_validation();
