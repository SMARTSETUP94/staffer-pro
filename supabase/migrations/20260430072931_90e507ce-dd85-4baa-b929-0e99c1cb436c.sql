
-- v0.27.3 fix : restaure EXECUTE sur les 4 helpers RLS oubliés lors du
-- REVOKE trop large de v0.24.1 (S2.1). Sans ces grants, toute requête sur
-- affaires / assignations / heures_saisies / commentaires renvoie 403
-- "permission denied for function ...", ce qui casse Planning, Affaires,
-- Chantiers, Saisie heures, et fait échouer silencieusement plein de forms.

GRANT EXECUTE ON FUNCTION public.user_has_affaire_access(_affaire_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_devis_termine(_devis_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_saisie_on_affaire(_affaire_id uuid, _date date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_is_mentioned_on_affaire(_affaire_id uuid) TO authenticated;
