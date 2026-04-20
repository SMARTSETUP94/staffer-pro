-- 1. Durcir la policy UPDATE employé : brouillon uniquement, et autoriser la transition brouillon -> soumis
DROP POLICY IF EXISTS heures_saisies_self_update ON public.heures_saisies;

CREATE POLICY heures_saisies_self_update
ON public.heures_saisies
FOR UPDATE
TO authenticated
USING (
  is_chef_or_admin()
  OR (
    employe_id IN (SELECT id FROM public.employes WHERE profile_id = auth.uid())
    AND statut = 'brouillon'::heures_statut
  )
)
WITH CHECK (
  is_chef_or_admin()
  OR (
    employe_id IN (SELECT id FROM public.employes WHERE profile_id = auth.uid())
    AND statut IN ('brouillon'::heures_statut, 'soumis'::heures_statut)
  )
);

-- 2. RPC sécurisée pour acquitter un rejet et repasser la saisie en brouillon
CREATE OR REPLACE FUNCTION public.acknowledge_heures_rejet(_saisie_id uuid)
RETURNS public.heures_saisies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.heures_saisies;
  _is_owner BOOLEAN;
BEGIN
  -- Vérifier que la saisie existe et appartient bien à l'employé connecté (ou chef/admin)
  SELECT * INTO _row FROM public.heures_saisies WHERE id = _saisie_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Saisie introuvable.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.employes e
    WHERE e.id = _row.employe_id AND e.profile_id = auth.uid()
  ) INTO _is_owner;

  IF NOT (_is_owner OR public.is_chef_or_admin()) THEN
    RAISE EXCEPTION 'Action non autorisée.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _row.statut <> 'rejete'::heures_statut THEN
    RAISE EXCEPTION 'Cette saisie n''est pas en statut rejeté.' USING ERRCODE = 'check_violation';
  END IF;

  -- Acquitter et repasser en brouillon
  UPDATE public.heures_saisies
     SET motif_rejet_lu_le = COALESCE(motif_rejet_lu_le, now()),
         statut = 'brouillon'::heures_statut,
         updated_at = now()
   WHERE id = _saisie_id
   RETURNING * INTO _row;

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.acknowledge_heures_rejet(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acknowledge_heures_rejet(uuid) TO authenticated;