-- Durcissement : retirer EXECUTE sur les helpers SECURITY DEFINER
-- Ces fonctions sont utilisées UNIQUEMENT dans les RLS policies et triggers (server-side).
-- Aucune n'est appelée depuis le client (.rpc()).
-- On conserve EXECUTE sur les RPC explicitement appelées côté client.

-- === Helpers RLS (utilisés dans policies USING/WITH CHECK) ===
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_chef_or_admin() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.user_has_affaire_access(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.user_is_mentioned_on_affaire(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_affaire_open(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.can_saisie_on_affaire(uuid, date) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_devis_termine(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_profile_complete(uuid) FROM anon, authenticated, public;

-- === Fonctions de notification (appelées par triggers uniquement) ===
REVOKE EXECUTE ON FUNCTION public.create_notification(uuid, notification_type, text, text, text, jsonb) FROM anon, authenticated, public;

-- === Fonctions internes diverses (triggers / SECURITY DEFINER non exposées) ===
-- Note : les triggers fonctionnent indépendamment des grants EXECUTE (le trigger appelle la fn avec les droits du owner).
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.set_trajet_reference() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.set_fabrication_objet_reference() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.set_assignation_confirmation_status() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.set_saisie_authorship() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.guard_assignation_confirmation() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.guard_fabrication_etape_transition() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.check_affaire_open_for_assignation() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.sync_fabrication_etapes_on_flags_change() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.create_fabrication_etapes_for_objet() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.log_fabrication_etape_change() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.log_heures_saisies_transition() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_absence_change() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_assignation_change() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_assignation_confirmation() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_mention() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_feedback_created() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_affaire_signee() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_affaire_pret_livraison() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_fabrication_etape_assignation() FROM anon, authenticated, public;

-- === RPC appelées explicitement côté client : on RÉTABLIT EXECUTE pour authenticated uniquement ===
-- (REVOKE FROM PUBLIC retire le grant par défaut, puis GRANT TO authenticated cible le bon rôle)

-- Imports devis (appelé via supabase.rpc depuis /devis/import)
REVOKE EXECUTE ON FUNCTION public.import_devis_atomique(uuid, jsonb, date, date, jsonb, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.import_devis_atomique(uuid, jsonb, date, date, jsonb, jsonb, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.import_devis_atomique_v3(uuid, jsonb, date, date, jsonb, jsonb, jsonb, numeric, numeric, text, jsonb) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.import_devis_atomique(uuid, jsonb, date, date, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_devis_atomique(uuid, jsonb, date, date, jsonb, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_devis_atomique_v3(uuid, jsonb, date, date, jsonb, jsonb, jsonb, numeric, numeric, text, jsonb) TO authenticated;

-- Création opportunité (appelée depuis /opportunites)
REVOKE EXECUTE ON FUNCTION public.create_opportunite(text, text, text, uuid, opportunite_taille, date, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_opportunite(text, text, text, uuid, opportunite_taille, date, text) TO authenticated;

-- Numérotation auto (appelée pour générer un numéro)
REVOKE EXECUTE ON FUNCTION public.next_affaire_numero(integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.next_affaire_numero(integer) TO authenticated;

-- Audit auth admin (admin only — vérif intégrée via is_admin() dans le corps)
REVOKE EXECUTE ON FUNCTION public.admin_get_auth_events(text[], timestamptz, timestamptz, integer, integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_get_invitations() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_get_auth_events(text[], timestamptz, timestamptz, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_invitations() TO authenticated;