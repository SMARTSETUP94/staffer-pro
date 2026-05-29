
INSERT INTO public.role_capabilities (role, capability, granted, scope) VALUES
  ('chef_pose', 'mes_missions.view', true, 'all'),
  ('chef_pose', 'mes_chantiers.view', true, 'all'),
  ('chef_pose', 'mes_heures.view', true, 'all'),
  ('chef_pose', 'mes_contrats.view', true, 'all'),
  ('chef_pose', 'mes_swaps.view', true, 'all'),
  ('chef_pose', 'mes_propositions.view', true, 'all'),
  ('chef_pose', 'heures.equipe.saisir', true, 'team')
ON CONFLICT (role, capability) DO UPDATE SET granted = true;
