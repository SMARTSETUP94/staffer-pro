-- Empêcher l'accès direct à la MV via PostgREST (data API)
-- Lecture autorisée uniquement par le service_role (server functions)
REVOKE ALL ON public.v_objet_heures_consolidees FROM anon, authenticated;
GRANT SELECT ON public.v_objet_heures_consolidees TO service_role;