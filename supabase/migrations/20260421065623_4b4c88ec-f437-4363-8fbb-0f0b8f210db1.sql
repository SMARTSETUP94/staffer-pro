CREATE OR REPLACE FUNCTION public.set_vehicule_chauffeurs_autorises(
  _vehicule_id uuid,
  _employe_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_chef_or_admin() THEN
    RAISE EXCEPTION 'Action réservée aux chefs de chantier et administrateurs.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _vehicule_id IS NULL THEN
    RAISE EXCEPTION 'vehicule_id est obligatoire.' USING ERRCODE = 'check_violation';
  END IF;

  -- Supprime les autorisations qui ne sont plus dans la nouvelle liste
  DELETE FROM public.vehicule_chauffeurs_autorises
  WHERE vehicule_id = _vehicule_id
    AND (
      _employe_ids IS NULL
      OR array_length(_employe_ids, 1) IS NULL
      OR NOT (employe_id = ANY (_employe_ids))
    );

  -- Insère les nouvelles autorisations (idempotent grâce à ON CONFLICT)
  IF _employe_ids IS NOT NULL AND array_length(_employe_ids, 1) IS NOT NULL THEN
    INSERT INTO public.vehicule_chauffeurs_autorises (vehicule_id, employe_id)
    SELECT _vehicule_id, unnest(_employe_ids)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

-- Contrainte unique pour rendre l'ON CONFLICT efficace (idempotence)
CREATE UNIQUE INDEX IF NOT EXISTS idx_vca_unique_vehicule_employe
  ON public.vehicule_chauffeurs_autorises (vehicule_id, employe_id);