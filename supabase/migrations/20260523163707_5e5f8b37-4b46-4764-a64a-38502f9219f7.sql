INSERT INTO public.feature_flags (flag_key, description, enabled_globally, enabled_for_user_ids, enabled_for_roles)
VALUES (
  'vocab_metier_v1',
  'Vocabulaire métier 2026 : Staffer → Assigner, Auto-staffing → Auto-remplir, Plan staffing → Plan de fab, Validation heures → Valider heures. Express conservé. Rollback en désactivant le flag.',
  false,
  '{}'::uuid[],
  '{}'::text[]
)
ON CONFLICT (flag_key) DO NOTHING;