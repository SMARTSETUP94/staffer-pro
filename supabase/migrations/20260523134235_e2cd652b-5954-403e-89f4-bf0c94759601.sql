-- ============================================================================
-- Lot 7.0a — Caps manquantes + rôles futurs + seed
-- ============================================================================

-- 1. Ajouter les rôles futurs à l'enum app_role (non utilisés tant qu'aucun
--    user_roles n'y est attaché — purement pour pouvoir seeder la matrice
--    par défaut dès maintenant. Activable au prochain bloc sans nouvelle migration.)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'commercial';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'bureau_etude';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'atelier_chef';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'atelier_metier';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'logistique';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'poseur';

COMMIT;

-- 2. Nouvelles capabilities (ferment les 2 fuites identifiées au Lot 7.0)
INSERT INTO public.capabilities (key, label, description, category, sort_order) VALUES
  ('inbox.view',          'Voir son inbox',                     'Items en attente d''action regroupés',                'planning',   5),
  ('rh.hub.view',         'Accéder au hub RH',                  'Page /rh : KPI effectif, absences, contrats',         'rh',         5),
  ('affaire.equipe.view', 'Voir onglet Équipe d''une affaire',  'Historique personnes mobilisées + chefs',             'affaires',  45),
  ('affaire.kpi.view',    'Voir le bandeau KPI 360°',           'Heures prévues/staffées/consommées en haut de fiche', 'affaires',  46),
  -- Defense-in-depth : durcissement gates admin (les RoleGuard existants restent)
  ('admin.permissions.manage',  'Modifier la matrice de permissions', 'Toggle granted sur role_capabilities',   'admin', 31),
  ('admin.feature_flags.manage','Modifier les feature flags',         'CRUD sur feature_flags',                  'admin', 11)
ON CONFLICT (key) DO UPDATE
  SET label = EXCLUDED.label,
      description = EXCLUDED.description,
      category = EXCLUDED.category,
      sort_order = EXCLUDED.sort_order;

-- 3. Seed pour rôles existants
-- Admin : tout granted
INSERT INTO public.role_capabilities (role, capability, granted)
SELECT 'admin'::app_role, key, true
FROM public.capabilities
WHERE key IN ('inbox.view','rh.hub.view','affaire.equipe.view','affaire.kpi.view',
              'admin.permissions.manage','admin.feature_flags.manage')
ON CONFLICT (role, capability) DO NOTHING;

-- chef_chantier
INSERT INTO public.role_capabilities (role, capability, granted) VALUES
  ('chef_chantier'::app_role, 'inbox.view',          true),
  ('chef_chantier'::app_role, 'rh.hub.view',         false),
  ('chef_chantier'::app_role, 'affaire.equipe.view', true),
  ('chef_chantier'::app_role, 'affaire.kpi.view',    true),
  ('chef_chantier'::app_role, 'admin.permissions.manage',   false),
  ('chef_chantier'::app_role, 'admin.feature_flags.manage', false)
ON CONFLICT (role, capability) DO NOTHING;

-- chef_metier_scoped (équivalent chef_chantier sur ces caps, scope RLS appliqué côté data)
INSERT INTO public.role_capabilities (role, capability, granted) VALUES
  ('chef_metier_scoped'::app_role, 'inbox.view',          true),
  ('chef_metier_scoped'::app_role, 'rh.hub.view',         false),
  ('chef_metier_scoped'::app_role, 'affaire.equipe.view', true),
  ('chef_metier_scoped'::app_role, 'affaire.kpi.view',    true),
  ('chef_metier_scoped'::app_role, 'admin.permissions.manage',   false),
  ('chef_metier_scoped'::app_role, 'admin.feature_flags.manage', false)
ON CONFLICT (role, capability) DO NOTHING;

-- rh : accès hub RH + équipe d'une affaire (pas KPI fab atelier)
INSERT INTO public.role_capabilities (role, capability, granted) VALUES
  ('rh'::app_role, 'inbox.view',          true),
  ('rh'::app_role, 'rh.hub.view',         true),
  ('rh'::app_role, 'affaire.equipe.view', true),
  ('rh'::app_role, 'affaire.kpi.view',    false),
  ('rh'::app_role, 'admin.permissions.manage',   false),
  ('rh'::app_role, 'admin.feature_flags.manage', false)
ON CONFLICT (role, capability) DO NOTHING;

-- employe : inbox uniquement (ses propres items via RPC), pas de RH/équipe/KPI
INSERT INTO public.role_capabilities (role, capability, granted) VALUES
  ('employe'::app_role, 'inbox.view',          true),
  ('employe'::app_role, 'rh.hub.view',         false),
  ('employe'::app_role, 'affaire.equipe.view', false),
  ('employe'::app_role, 'affaire.kpi.view',    false),
  ('employe'::app_role, 'admin.permissions.manage',   false),
  ('employe'::app_role, 'admin.feature_flags.manage', false)
ON CONFLICT (role, capability) DO NOTHING;

-- ============================================================================
-- 4. Seed défaut pour les 6 rôles FUTURS (matrice documentée, activable plus tard)
--    On seed sur l'ENSEMBLE des capabilities existantes : false par défaut,
--    true uniquement sur le scope métier du rôle.
-- ============================================================================

-- commercial : pipeline opportunités + lecture affaires/devis/planning, pas de mutation
INSERT INTO public.role_capabilities (role, capability, granted)
SELECT 'commercial'::app_role, key,
  CASE WHEN key IN (
    'inbox.view',
    'planning.view',
    'affaires.view', 'affaire.kpi.view',
    'devis.view',
    'parametres.view'
  ) THEN true ELSE false END
FROM public.capabilities
ON CONFLICT (role, capability) DO NOTHING;

-- bureau_etude : devis (import + view) + planning view + parametres view
INSERT INTO public.role_capabilities (role, capability, granted)
SELECT 'bureau_etude'::app_role, key,
  CASE WHEN key IN (
    'inbox.view',
    'planning.view',
    'affaires.view', 'affaire.kpi.view',
    'devis.view', 'devis.import',
    'parametres.view'
  ) THEN true ELSE false END
FROM public.capabilities
ON CONFLICT (role, capability) DO NOTHING;

-- atelier_chef : staffing fab + planning edit + valider heures équipe atelier
INSERT INTO public.role_capabilities (role, capability, granted)
SELECT 'atelier_chef'::app_role, key,
  CASE WHEN key IN (
    'inbox.view',
    'planning.view', 'planning.edit',
    'staffing.plan.create', 'staffing.plan.publish', 'staffing.assignations.edit',
    'affaires.view', 'affaire.kpi.view', 'affaire.equipe.view',
    'devis.view',
    'heures.personnelles.saisir', 'heures.equipe.saisir', 'heures.valider',
    'employes.view',
    'parametres.view'
  ) THEN true ELSE false END
FROM public.capabilities
ON CONFLICT (role, capability) DO NOTHING;

-- atelier_metier : planning view + ses propres heures + saisie équipe scopée métier (RLS data)
INSERT INTO public.role_capabilities (role, capability, granted)
SELECT 'atelier_metier'::app_role, key,
  CASE WHEN key IN (
    'inbox.view',
    'planning.view',
    'affaires.view',
    'heures.personnelles.saisir', 'heures.equipe.saisir',
    'employes.view'
  ) THEN true ELSE false END
FROM public.capabilities
ON CONFLICT (role, capability) DO NOTHING;

-- logistique : planning + affaires view (préparation transport)
INSERT INTO public.role_capabilities (role, capability, granted)
SELECT 'logistique'::app_role, key,
  CASE WHEN key IN (
    'inbox.view',
    'planning.view',
    'affaires.view',
    'parametres.view'
  ) THEN true ELSE false END
FROM public.capabilities
ON CONFLICT (role, capability) DO NOTHING;

-- poseur : strict perso (équivalent employé + contrat perso)
INSERT INTO public.role_capabilities (role, capability, granted)
SELECT 'poseur'::app_role, key,
  CASE WHEN key IN (
    'inbox.view',
    'heures.personnelles.saisir',
    'contrats.view_own'
  ) THEN true ELSE false END
FROM public.capabilities
ON CONFLICT (role, capability) DO NOTHING;

COMMENT ON FUNCTION public.user_has_capability(uuid, text) IS
  'Bloc 1 + Lot 7.0 — Retourne true si l''utilisateur possède au moins un rôle qui accorde cette capability. Inclut désormais les rôles futurs (commercial, bureau_etude, atelier_chef, atelier_metier, logistique, poseur) seedés en matrice par défaut, activables sans nouvelle migration. SECURITY DEFINER — ne pas REVOKE EXECUTE.';