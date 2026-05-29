
INSERT INTO public.capabilities (key, label, description, category)
VALUES ('heures.equipe.saisir', 'Saisir les heures de son équipe', 'Permet de saisir les heures pour les membres de son équipe chantier', 'action')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_capabilities (role, capability) VALUES
  ('chef_pose', 'heures.equipe.saisir'),
  ('chef_chantier', 'heures.equipe.saisir'),
  ('admin', 'heures.equipe.saisir')
ON CONFLICT DO NOTHING;

DELETE FROM public.role_capabilities
WHERE role = 'chef_pose'
  AND capability IN (
    'section.affaires',
    'section.devis',
    'section.planning_fab',
    'section.equipes',
    'section.logistique',
    'section.planning_chantier_macro',
    'section.pipeline_opportunites',
    'action.validate_hours'
  );
