GRANT EXECUTE ON FUNCTION public.set_vehicule_chauffeurs_autorises(uuid, uuid[]) TO authenticated;

COMMENT ON FUNCTION public.set_vehicule_chauffeurs_autorises(uuid, uuid[]) IS
  'Synchronise les chauffeurs autorisés par véhicule poids lourd. Appelable par les utilisateurs connectés, avec contrôle chef/admin dans la fonction.';