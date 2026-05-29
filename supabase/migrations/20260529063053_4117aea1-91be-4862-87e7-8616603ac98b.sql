INSERT INTO public.role_capabilities (role, capability) VALUES
  ('chef_pose', 'mes_missions.view'),
  ('chef_pose', 'mes_chantiers.view'),
  ('chef_pose', 'mes_heures.view'),
  ('chef_pose', 'mes_contrats.view'),
  ('chef_pose', 'mes_swaps.view'),
  ('chef_pose', 'mes_propositions.view'),
  ('chef_pose', 'heures.personnelles.saisir'),
  ('chef_pose', 'contrats.view_own')
ON CONFLICT (role, capability) DO NOTHING;