-- 1) Révoquer EXECUTE sur les fonctions trigger (jamais appelées en RPC)
REVOKE EXECUTE ON FUNCTION public.apply_swap_on_validation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_swap_request() FROM PUBLIC, anon, authenticated;

-- 2) Documenter les 7 RPC restantes (faux positifs structurels du linter)
COMMENT ON FUNCTION public.acknowledge_heures_rejet(uuid) IS
  'RPC employé : accuse réception du motif de rejet d''une saisie d''heures. Garde-fou interne is_chef_or_admin() OU propriétaire de la saisie. EXECUTE accordé à authenticated par design.';

COMMENT ON FUNCTION public.admin_get_auth_events(text[], timestamptz, timestamptz, integer, integer) IS
  'RPC admin : lecture du log auth.audit_log_entries (schéma normalement inaccessible). Garde-fou interne is_admin() + RAISE forbidden. EXECUTE accordé à authenticated par design.';

COMMENT ON FUNCTION public.admin_get_invitations() IS
  'RPC admin : lecture des invitations en attente avec jointure auth.users. Garde-fou interne is_admin() + RAISE forbidden. EXECUTE accordé à authenticated par design.';

COMMENT ON FUNCTION public.admin_get_user_connection_stats() IS
  'RPC admin : agrégat des connexions sur 30 jours par utilisateur. Garde-fou interne is_admin() + RAISE forbidden. EXECUTE accordé à authenticated par design.';

COMMENT ON FUNCTION public.create_opportunite(text, text, text, uuid, opportunite_taille, date, text) IS
  'RPC chef/admin : création d''une opportunité avec génération de numéro. Garde-fou interne is_chef_or_admin() + RAISE insufficient_privilege. EXECUTE accordé à authenticated par design.';

COMMENT ON FUNCTION public.next_affaire_numero(integer) IS
  'RPC chef/admin : retourne le prochain numéro disponible pour le préfixe (5XXX/9XXX/etc). Garde-fou interne is_chef_or_admin() + RAISE insufficient_privilege. EXECUTE accordé à authenticated par design.';

COMMENT ON FUNCTION public.sign_opportunite(uuid, text) IS
  'RPC chef/admin : signe une opportunité et la convertit en affaire avec un nouveau code. Garde-fou interne is_chef_or_admin() + RAISE insufficient_privilege. EXECUTE accordé à authenticated par design.';