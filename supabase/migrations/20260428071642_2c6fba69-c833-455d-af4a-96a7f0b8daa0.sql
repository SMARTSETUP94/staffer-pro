-- Bloc 1a v0.21.0 — Audit avance des saisies d'heures + marquage saisie chef

-- 1. Colonnes d'audit sur heures_saisies
ALTER TABLE public.heures_saisies
  ADD COLUMN IF NOT EXISTS saisi_par uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS saisi_par_chef boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.heures_saisies.saisi_par IS
  'v0.21 Bloc 1a — auth.uid() au moment de la creation (chef ou employe lui-meme).';
COMMENT ON COLUMN public.heures_saisies.saisi_par_chef IS
  'v0.21 Bloc 1a — true si la saisie a ete creee par un chef/admin pour le compte d''un employe (badge UI).';

-- 2. Trigger BEFORE INSERT : auto-fill saisi_par + detection saisie chef
CREATE OR REPLACE FUNCTION public.set_saisie_authorship()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _emp_profile uuid;
BEGIN
  -- saisi_par = auth.uid() courant (toujours, sauf si deja set explicitement)
  NEW.saisi_par := COALESCE(NEW.saisi_par, auth.uid());

  -- Detection : auth.uid() != profile_id de l'employe ciblé ⇒ saisie chef
  IF auth.uid() IS NOT NULL THEN
    SELECT profile_id INTO _emp_profile FROM public.employes WHERE id = NEW.employe_id;
    IF _emp_profile IS NULL OR _emp_profile <> auth.uid() THEN
      NEW.saisi_par_chef := true;
    ELSE
      NEW.saisi_par_chef := false;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_saisie_authorship ON public.heures_saisies;
CREATE TRIGGER trg_set_saisie_authorship
  BEFORE INSERT ON public.heures_saisies
  FOR EACH ROW
  EXECUTE FUNCTION public.set_saisie_authorship();

-- 3. Enrichissement du log historique : action explicite + pour_compte_de
ALTER TABLE public.heures_saisies_historique
  ADD COLUMN IF NOT EXISTS action_type text,
  ADD COLUMN IF NOT EXISTS pour_compte_de uuid REFERENCES public.employes(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.heures_saisies_historique.action_type IS
  'v0.21 Bloc 1a — creation_self, creation_chef, soumission, validation, rejet, acquittement, edition.';
COMMENT ON COLUMN public.heures_saisies_historique.pour_compte_de IS
  'v0.21 Bloc 1a — employe cible (utile quand l''auteur user_id n''est pas le proprietaire).';

-- 4. Mise a jour du trigger d'historique pour utiliser les nouvelles colonnes
CREATE OR REPLACE FUNCTION public.log_heures_saisies_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _commentaire TEXT;
  _action TEXT;
  _emp_profile uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT profile_id INTO _emp_profile FROM public.employes WHERE id = NEW.employe_id;
    _action := CASE
      WHEN _emp_profile IS NOT NULL AND _emp_profile = auth.uid() THEN 'creation_self'
      ELSE 'creation_chef'
    END;
    INSERT INTO public.heures_saisies_historique
      (heure_saisie_id, user_id, ancien_statut, nouveau_statut, commentaire, action_type, pour_compte_de)
    VALUES
      (NEW.id, auth.uid(), NULL, NEW.statut, NEW.commentaire, _action, NEW.employe_id);
    RETURN NEW;
  END IF;

  -- UPDATE : log si statut change OU si edition de contenu (heures, horaires, commentaire)
  IF OLD.statut IS DISTINCT FROM NEW.statut THEN
    _commentaire := CASE
      WHEN NEW.statut = 'rejete' THEN NEW.motif_rejet
      WHEN NEW.statut = 'valide' THEN 'Validé'
      WHEN NEW.statut = 'soumis' THEN 'Soumis pour validation'
      WHEN NEW.statut = 'brouillon' AND OLD.statut = 'rejete' THEN 'Acquittement du rejet'
      WHEN NEW.statut = 'brouillon' THEN 'Retour en brouillon'
      ELSE NULL
    END;
    _action := CASE NEW.statut::text
      WHEN 'soumis' THEN 'soumission'
      WHEN 'valide' THEN 'validation'
      WHEN 'rejete' THEN 'rejet'
      WHEN 'brouillon' THEN CASE WHEN OLD.statut::text = 'rejete' THEN 'acquittement' ELSE 'retour_brouillon' END
      ELSE 'changement_statut'
    END;
    INSERT INTO public.heures_saisies_historique
      (heure_saisie_id, user_id, ancien_statut, nouveau_statut, commentaire, action_type, pour_compte_de)
    VALUES
      (NEW.id, auth.uid(), OLD.statut, NEW.statut, _commentaire, _action, NEW.employe_id);
  ELSIF OLD.heures_reelles IS DISTINCT FROM NEW.heures_reelles
        OR OLD.heure_debut IS DISTINCT FROM NEW.heure_debut
        OR OLD.heure_fin IS DISTINCT FROM NEW.heure_fin
        OR OLD.duree_pause_minutes IS DISTINCT FROM NEW.duree_pause_minutes
        OR OLD.commentaire IS DISTINCT FROM NEW.commentaire THEN
    INSERT INTO public.heures_saisies_historique
      (heure_saisie_id, user_id, ancien_statut, nouveau_statut, commentaire, action_type, pour_compte_de)
    VALUES
      (NEW.id, auth.uid(), OLD.statut, NEW.statut,
       format('Édition : %sh → %sh', COALESCE(OLD.heures_reelles, 0), COALESCE(NEW.heures_reelles, 0)),
       'edition', NEW.employe_id);
  END IF;

  RETURN NEW;
END;
$$;

-- 5. RLS : admin lit tout l'historique (pour page /audit-heures)
DROP POLICY IF EXISTS hsh_select_admin ON public.heures_saisies_historique;
CREATE POLICY hsh_select_admin ON public.heures_saisies_historique
  FOR SELECT TO authenticated
  USING (is_admin());

-- 6. Index pour la page d'audit (filtrage par date / par employé / par action)
CREATE INDEX IF NOT EXISTS idx_hsh_pour_compte ON public.heures_saisies_historique(pour_compte_de, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hsh_action_type ON public.heures_saisies_historique(action_type);
CREATE INDEX IF NOT EXISTS idx_hs_saisi_par_chef ON public.heures_saisies(saisi_par_chef) WHERE saisi_par_chef = true;
