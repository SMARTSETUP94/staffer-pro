-- v0.32.3 — Auto-saisie heures hors planning

-- 1) Colonne metier_id (nullable) pour tracer le métier d'une saisie hors planning
ALTER TABLE public.heures_saisies
  ADD COLUMN IF NOT EXISTS metier_id INTEGER REFERENCES public.metiers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_heures_saisies_metier_id
  ON public.heures_saisies(metier_id)
  WHERE metier_id IS NOT NULL;

COMMENT ON COLUMN public.heures_saisies.metier_id IS
  'v0.32.3 — Métier réellement effectué. NULL pour les saisies legacy avec assignation_id (le métier vient alors de l''assignation). Renseigné obligatoirement pour les saisies hors planning (assignation_id IS NULL).';

-- 2) RPC pour permettre à l'employé de supprimer une saisie hors planning brouillon
--    (la policy DELETE actuelle est restreinte à admin/chef ; on passe par SECURITY DEFINER
--     avec garde-fou : statut='brouillon' AND assignation_id IS NULL AND employe = caller)
CREATE OR REPLACE FUNCTION public.delete_my_hors_planning_saisie(_saisie_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.heures_saisies;
  _caller_employe_id UUID;
BEGIN
  -- Récupère l'employé du caller
  SELECT id INTO _caller_employe_id
  FROM public.employes
  WHERE profile_id = auth.uid()
  LIMIT 1;

  IF _caller_employe_id IS NULL THEN
    RAISE EXCEPTION 'Aucun employé associé à votre compte.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _row FROM public.heures_saisies WHERE id = _saisie_id;
  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Saisie introuvable.' USING ERRCODE = 'no_data_found';
  END IF;

  -- Garde-fous stricts
  IF _row.employe_id <> _caller_employe_id THEN
    RAISE EXCEPTION 'Cette saisie ne vous appartient pas.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _row.assignation_id IS NOT NULL THEN
    RAISE EXCEPTION 'Seules les saisies hors planning peuvent être supprimées par l''employé.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _row.statut <> 'brouillon'::public.heures_statut THEN
    RAISE EXCEPTION 'Seules les saisies en brouillon peuvent être supprimées (statut actuel: %).', _row.statut
      USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM public.heures_saisies WHERE id = _saisie_id;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_hors_planning_saisie(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.delete_my_hors_planning_saisie(UUID) TO authenticated;

COMMENT ON FUNCTION public.delete_my_hors_planning_saisie(UUID) IS
  'v0.32.3 — Permet à l''employé de supprimer une de ses saisies hors planning encore en brouillon. Garde-fous : ownership + assignation_id IS NULL + statut=brouillon.';