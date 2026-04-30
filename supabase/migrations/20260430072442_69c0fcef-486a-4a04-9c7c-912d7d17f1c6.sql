-- v0.27.2 fix : restaure le droit d'exécution des fonctions de sécurité RLS
-- pour les utilisateurs authentifiés. Sans ces grants, toutes les requêtes
-- (SELECT/UPDATE) sur profiles renvoient 403 "permission denied for function
-- is_chef_or_admin", ce qui bloque le login (loadUserData échoue silencieusement,
-- profileCompleted=false → boucle onboarding) et tous les formulaires
-- (set-password, onboarding RGPD, etc.).
GRANT EXECUTE ON FUNCTION public.is_chef_or_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- Bonus : autorise aussi anon (utile pour les rares lectures publiques) — sans
-- effet de bord car les fonctions sont SECURITY DEFINER + lisent user_roles
-- sous identité postgres, mais l'appel lui-même reste contraint par les policies
-- des tables qui les invoquent.
GRANT EXECUTE ON FUNCTION public.is_chef_or_admin() TO anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon;