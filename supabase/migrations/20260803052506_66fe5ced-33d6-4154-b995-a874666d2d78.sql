DELETE FROM public.feature_flags
WHERE flag_key IN (
  'fiche_objet_v1',
  'sidebar_capability_v1',
  'equipes_3_niveaux_lecture',
  'equipes_3_niveaux_alertes',
  'vocab_metier_v1'
);

INSERT INTO public.role_capabilities (role, capability, granted, scope)
VALUES ('admin'::app_role, 'objet.photo.delete', true, 'all')
ON CONFLICT (role, capability) DO UPDATE SET granted = true, scope = 'all';