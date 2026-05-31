INSERT INTO public.role_capabilities (role, capability) VALUES
  ('chef_chantier', 'candidatures.view')
ON CONFLICT DO NOTHING;