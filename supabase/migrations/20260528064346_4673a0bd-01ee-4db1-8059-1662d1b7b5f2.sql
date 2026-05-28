INSERT INTO public.capabilities (key, label, description, category, sort_order)
VALUES ('heures.export.admin_formats', 'Exports heures formats admin', 'Accès aux formats d''export avancés sur /heures/analyse (autres que SILAE)', 'heures', 0)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_capabilities (role, capability, granted, scope)
VALUES ('admin', 'heures.export.admin_formats', true, 'all')
ON CONFLICT (role, capability) DO UPDATE SET granted = EXCLUDED.granted, scope = EXCLUDED.scope;