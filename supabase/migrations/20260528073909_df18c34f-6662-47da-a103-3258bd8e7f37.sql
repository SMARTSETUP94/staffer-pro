-- L6-B : caps mes_*.view avec scope (own/team/all) pour 6 domaines perso
INSERT INTO public.capabilities (key, label, description, category, sort_order) VALUES
  ('mes_missions.view',     'Voir les missions',     'Voir les missions (scope défini par rôle)',     'mes', 10),
  ('mes_chantiers.view',    'Voir les chantiers',    'Voir les équipes chantiers (scope défini par rôle)', 'mes', 20),
  ('mes_heures.view',       'Voir les heures',       'Voir les heures (scope défini par rôle)',       'mes', 30),
  ('mes_contrats.view',     'Voir les contrats',     'Voir les contrats (scope défini par rôle)',     'mes', 40),
  ('mes_propositions.view', 'Voir les propositions', 'Voir les propositions (scope défini par rôle)', 'mes', 50),
  ('mes_swaps.view',        'Voir les échanges',     'Voir les échanges (scope défini par rôle)',     'mes', 60)
ON CONFLICT (key) DO NOTHING;

-- Grants : own pour tous les rôles employés ; team pour chef_chantier ; all pour admin/rh
-- (rh seulement pour contrats; admin pour tout)
WITH grants(role, cap, sc) AS (VALUES
  -- admin : all sur tout
  ('admin'::app_role, 'mes_missions.view', 'all'),
  ('admin'::app_role, 'mes_chantiers.view', 'all'),
  ('admin'::app_role, 'mes_heures.view', 'all'),
  ('admin'::app_role, 'mes_contrats.view', 'all'),
  ('admin'::app_role, 'mes_propositions.view', 'all'),
  ('admin'::app_role, 'mes_swaps.view', 'all'),
  -- chef_chantier : team sur missions/chantiers/heures/propositions/swaps ; own contrats
  ('chef_chantier'::app_role, 'mes_missions.view', 'team'),
  ('chef_chantier'::app_role, 'mes_chantiers.view', 'team'),
  ('chef_chantier'::app_role, 'mes_heures.view', 'team'),
  ('chef_chantier'::app_role, 'mes_contrats.view', 'own'),
  ('chef_chantier'::app_role, 'mes_propositions.view', 'team'),
  ('chef_chantier'::app_role, 'mes_swaps.view', 'team'),
  -- rh : all sur contrats, own sur le reste
  ('rh'::app_role, 'mes_contrats.view', 'all'),
  ('rh'::app_role, 'mes_heures.view', 'all'),
  -- employés : own
  ('employe'::app_role, 'mes_missions.view', 'own'),
  ('employe'::app_role, 'mes_chantiers.view', 'own'),
  ('employe'::app_role, 'mes_heures.view', 'own'),
  ('employe'::app_role, 'mes_contrats.view', 'own'),
  ('employe'::app_role, 'mes_propositions.view', 'own'),
  ('employe'::app_role, 'mes_swaps.view', 'own'),
  ('poseur'::app_role, 'mes_missions.view', 'own'),
  ('poseur'::app_role, 'mes_chantiers.view', 'own'),
  ('poseur'::app_role, 'mes_heures.view', 'own'),
  ('poseur'::app_role, 'mes_contrats.view', 'own'),
  ('poseur'::app_role, 'mes_propositions.view', 'own'),
  ('poseur'::app_role, 'mes_swaps.view', 'own')
)
INSERT INTO public.role_capabilities (role, capability, granted, scope)
SELECT role, cap, true, sc FROM grants
ON CONFLICT (role, capability) DO UPDATE
  SET granted = EXCLUDED.granted, scope = EXCLUDED.scope, updated_at = now();