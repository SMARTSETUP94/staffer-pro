
-- 1. Ajouter colonnes rejet + ack sur heures_saisies
ALTER TABLE public.heures_saisies
  ADD COLUMN IF NOT EXISTS rejete_par UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS rejete_le TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS motif_rejet TEXT,
  ADD COLUMN IF NOT EXISTS motif_rejet_lu_le TIMESTAMP WITH TIME ZONE;

-- 2. Table historique
CREATE TABLE IF NOT EXISTS public.heures_saisies_historique (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  heure_saisie_id UUID NOT NULL REFERENCES public.heures_saisies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id),
  ancien_statut public.heures_statut,
  nouveau_statut public.heures_statut NOT NULL,
  commentaire TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hsh_heure_saisie ON public.heures_saisies_historique(heure_saisie_id);
CREATE INDEX IF NOT EXISTS idx_hsh_created_at ON public.heures_saisies_historique(created_at DESC);

ALTER TABLE public.heures_saisies_historique ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hsh_select_self_or_chef ON public.heures_saisies_historique;
CREATE POLICY hsh_select_self_or_chef ON public.heures_saisies_historique
  FOR SELECT TO authenticated
  USING (
    public.is_chef_or_admin()
    OR heure_saisie_id IN (
      SELECT hs.id FROM public.heures_saisies hs
      JOIN public.employes e ON e.id = hs.employe_id
      WHERE e.profile_id = auth.uid()
    )
  );

-- Pas d'INSERT/UPDATE/DELETE direct : seulement via trigger SECURITY DEFINER

-- 3. Trigger log historique
CREATE OR REPLACE FUNCTION public.log_heures_saisies_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _commentaire TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.heures_saisies_historique (heure_saisie_id, user_id, ancien_statut, nouveau_statut, commentaire)
    VALUES (NEW.id, auth.uid(), NULL, NEW.statut, NEW.commentaire);
    RETURN NEW;
  END IF;

  -- UPDATE : log uniquement si statut change
  IF OLD.statut IS DISTINCT FROM NEW.statut THEN
    _commentaire := CASE
      WHEN NEW.statut = 'rejete' THEN NEW.motif_rejet
      WHEN NEW.statut = 'valide' THEN 'Validé'
      WHEN NEW.statut = 'soumis' THEN 'Soumis pour validation'
      WHEN NEW.statut = 'brouillon' THEN 'Retour en brouillon'
      ELSE NULL
    END;
    INSERT INTO public.heures_saisies_historique (heure_saisie_id, user_id, ancien_statut, nouveau_statut, commentaire)
    VALUES (NEW.id, auth.uid(), OLD.statut, NEW.statut, _commentaire);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_heures_transition ON public.heures_saisies;
CREATE TRIGGER trg_log_heures_transition
  AFTER INSERT OR UPDATE ON public.heures_saisies
  FOR EACH ROW EXECUTE FUNCTION public.log_heures_saisies_transition();

-- 4. Trigger blocage re-soumission si rejet non lu + remplissage auto valide_par/rejete_par
CREATE OR REPLACE FUNCTION public.guard_heures_saisies_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Blocage : passage brouillon → soumis si rejet non acquitté
  IF TG_OP = 'UPDATE'
     AND OLD.statut = 'brouillon' AND NEW.statut = 'soumis'
     AND OLD.motif_rejet IS NOT NULL
     AND OLD.motif_rejet_lu_le IS NULL THEN
    RAISE EXCEPTION 'Vous devez prendre connaissance du motif de rejet avant de re-soumettre cette saisie.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Auto-fill valide_par/valide_le
  IF NEW.statut = 'valide' AND (OLD.statut IS DISTINCT FROM 'valide') THEN
    NEW.valide_par := COALESCE(NEW.valide_par, auth.uid());
    NEW.valide_le := COALESCE(NEW.valide_le, now());
    NEW.rejete_par := NULL;
    NEW.rejete_le := NULL;
    NEW.motif_rejet := NULL;
    NEW.motif_rejet_lu_le := NULL;
  END IF;

  -- Auto-fill rejete_par/rejete_le et reset statut
  IF NEW.statut = 'rejete' AND (OLD.statut IS DISTINCT FROM 'rejete') THEN
    IF NEW.motif_rejet IS NULL OR length(trim(NEW.motif_rejet)) = 0 THEN
      RAISE EXCEPTION 'Un motif de rejet est obligatoire.'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.rejete_par := COALESCE(NEW.rejete_par, auth.uid());
    NEW.rejete_le := COALESCE(NEW.rejete_le, now());
    NEW.valide_par := NULL;
    NEW.valide_le := NULL;
  END IF;

  -- Retour à brouillon depuis rejete = re-saisie par l'employé après acquittement
  -- On garde motif_rejet pour historique, mais on enlève rejete_par/le pour signaler que c'est de nouveau ouvert
  IF NEW.statut = 'brouillon' AND OLD.statut = 'rejete' THEN
    -- garde motif_rejet et motif_rejet_lu_le tels quels (déjà acquittés)
    NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_heures_transition ON public.heures_saisies;
CREATE TRIGGER trg_guard_heures_transition
  BEFORE UPDATE ON public.heures_saisies
  FOR EACH ROW EXECUTE FUNCTION public.guard_heures_saisies_transition();

-- 5. Trigger updated_at
DROP TRIGGER IF EXISTS trg_heures_saisies_updated_at ON public.heures_saisies;
CREATE TRIGGER trg_heures_saisies_updated_at
  BEFORE UPDATE ON public.heures_saisies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Trigger notif (déjà existante : notify_heures_change) → s'assurer qu'elle est bien attachée
DROP TRIGGER IF EXISTS trg_notify_heures_change ON public.heures_saisies;
CREATE TRIGGER trg_notify_heures_change
  AFTER INSERT OR UPDATE ON public.heures_saisies
  FOR EACH ROW EXECUTE FUNCTION public.notify_heures_change();

-- 7. Index utiles
CREATE INDEX IF NOT EXISTS idx_heures_saisies_employe_date ON public.heures_saisies(employe_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_heures_saisies_statut ON public.heures_saisies(statut) WHERE statut IN ('soumis', 'rejete');
CREATE INDEX IF NOT EXISTS idx_heures_saisies_affaire_date ON public.heures_saisies(affaire_id, date DESC);
