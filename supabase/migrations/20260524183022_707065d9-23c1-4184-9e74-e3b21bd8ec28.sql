-- Sprint B / B7 : feature flag equipes_3_niveaux_lecture
INSERT INTO public.feature_flags (flag_key, description, enabled_globally, enabled_for_roles, enabled_for_user_ids)
VALUES (
  'equipes_3_niveaux_lecture',
  'Sprint B — Active la lecture du nouveau modèle staffing 3 niveaux (Casting affaire + Équipe objet) pour les testeurs internes.',
  false,
  ARRAY[]::text[],
  ARRAY[]::uuid[]
)
ON CONFLICT (flag_key) DO NOTHING;
