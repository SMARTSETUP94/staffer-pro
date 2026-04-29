-- v0.24.1 — S2.1 : REVOKE EXECUTE PUBLIC sur helpers internes (correction syntaxe DO).
DO $$
DECLARE
  _fn text;
  _internal text[] := ARRAY[
    'notify_absence_change',
    'notify_affaire_pret_livraison',
    'notify_affaire_signee',
    'notify_assignation_change',
    'notify_assignation_confirmation',
    'notify_fabrication_etape_assignation',
    'notify_feedback_created',
    'notify_heures_change',
    'notify_mention',
    'notify_saisie_par_chef',
    'notify_swap_change',
    'notify_trajet_change',
    'set_assignation_confirmation_status',
    'set_saisie_authorship',
    'set_vehicule_chauffeurs_autorises',
    'set_trajet_reference',
    'set_fabrication_objet_reference',
    'log_admin_edit_post_livraison',
    'log_fabrication_etape_change',
    'log_heures_saisies_transition',
    'guard_affaire_signature',
    'guard_assignation_confirmation',
    'guard_devis_livraison',
    'guard_devis_reouverture',
    'guard_fabrication_etape_transition',
    'guard_feedback_resolution',
    'guard_heures_saisies_transition',
    'guard_matricule_silae_admin_only',
    'guard_swap_no_double_engagement',
    'guard_trajet_chauffeur_pl',
    'handle_new_user',
    'handle_user_sign_in',
    'sync_fabrication_etapes_on_flags_change',
    'enforce_unique_chef_jour',
    'check_affaire_open_for_assignation',
    'create_fabrication_etapes_for_objet',
    'create_notification',
    'update_updated_at_column'
  ];
BEGIN
  FOREACH _fn IN ARRAY _internal LOOP
    BEGIN
      EXECUTE format(
        'REVOKE EXECUTE ON FUNCTION public.%I FROM PUBLIC, anon, authenticated',
        _fn
      );
    EXCEPTION
      WHEN undefined_function THEN NULL;
      WHEN ambiguous_function THEN NULL;
    END;
  END LOOP;
END $$;