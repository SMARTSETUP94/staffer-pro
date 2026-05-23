-- ============================================================================
-- BLOC 1 — Système de capabilities + rôle RH
-- ============================================================================

-- 1. Ajouter le rôle 'rh' à l'enum app_role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'rh';

COMMIT;

-- ============================================================================
-- 2. Table capabilities (référentiel)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.capabilities (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text,
  category text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.capabilities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "capabilities_select_authenticated" ON public.capabilities;
CREATE POLICY "capabilities_select_authenticated"
  ON public.capabilities FOR SELECT
  TO authenticated
  USING (true);

-- Seed (idempotent)
INSERT INTO public.capabilities (key, label, description, category, sort_order) VALUES
  -- Planning
  ('planning.view',              'Voir le planning',                    'Consulter le hub planning et ses vues',                'planning', 10),
  ('planning.edit',              'Modifier le planning',                'Drag, edits inline, déplacements',                      'planning', 20),
  -- Staffing
  ('staffing.plan.create',       'Créer un plan de staffing',           'Express + Wizard',                                      'staffing', 10),
  ('staffing.plan.publish',      'Publier un plan',                     'Convertit en assignations engagées',                    'staffing', 20),
  ('staffing.plan.delete',       'Supprimer un plan',                   'Supprime plan + versions',                              'staffing', 30),
  ('staffing.assignations.edit', 'Éditer assignations engagées',        'Modifier après publication',                            'staffing', 40),
  -- Affaires
  ('affaires.view',              'Voir toutes les affaires',            'Vue transverse',                                        'affaires', 10),
  ('affaires.edit',              'Modifier une affaire',                'Statut, lieu, dates, etc.',                             'affaires', 20),
  ('affaires.delete',            'Supprimer une affaire',               'Suppression définitive',                                'affaires', 30),
  ('affaires.documents.upload',  'Téléverser documents affaire',        'Visites, échantillons, esquisses',                      'affaires', 40),
  -- Devis
  ('devis.view',                 'Voir les devis',                      'Historique + détail',                                   'devis',    10),
  ('devis.import',               'Importer un devis',                   'Progbat / Excel',                                       'devis',    20),
  ('devis.delete',               'Supprimer un devis',                  'Cascade avec archive',                                  'devis',    30),
  -- Heures
  ('heures.personnelles.saisir', 'Saisir ses propres heures',           '',                                                      'heures',   10),
  ('heures.equipe.saisir',       'Saisir pour son équipe',              'Chef saisit pour ses employés',                         'heures',   20),
  ('heures.valider',             'Valider les heures',                  'Validation hebdo équipe',                               'heures',   30),
  ('heures.audit',               'Auditer les heures',                  'Centre analyse + journal',                              'heures',   40),
  -- Employés / RH
  ('employes.view',              'Voir les employés',                   'Fiches + compétences',                                  'rh',       10),
  ('employes.edit',              'Modifier un employé',                 'Fiche, contrat, poste',                                 'rh',       20),
  ('employes.import',            'Importer employés en lot',            'Excel',                                                 'rh',       30),
  ('contrats.view',              'Voir les contrats',                   'Liste RH transverse',                                   'rh',       40),
  ('contrats.view_own',          'Voir ses propres contrats',           'Employé voit les siens uniquement',                     'rh',       45),
  ('contrats.create',            'Créer un contrat CDDU',               '',                                                      'rh',       50),
  ('contrats.sign_employeur',    'Signer côté employeur',               'Admin/RH uniquement',                                   'rh',       60),
  ('contrats.voir_taux',         'Voir les taux horaires',              'Sensible : RH/admin uniquement',                        'rh',       70),
  -- Paramètres
  ('parametres.view',            'Voir les paramètres',                 'Métiers, postes, lieux, sous-traitants',                'parametres', 10),
  ('parametres.edit',            'Modifier les paramètres',             'Édition catalogues',                                    'parametres', 20),
  ('parametres.utilisateurs',    'Gérer les utilisateurs',              'Invitations, rôles',                                    'parametres', 30),
  -- Admin plateforme
  ('admin.feature_flags',        'Gérer les feature flags',             '',                                                      'admin',    10),
  ('admin.audit',                'Voir audit + incidents auth',         '',                                                      'admin',    20),
  ('admin.permissions',          'Gérer les capabilities',              'Cette page',                                            'admin',    30)
ON CONFLICT (key) DO UPDATE
  SET label = EXCLUDED.label,
      description = EXCLUDED.description,
      category = EXCLUDED.category,
      sort_order = EXCLUDED.sort_order;

-- ============================================================================
-- 3. Table role_capabilities (matrice)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.role_capabilities (
  role        public.app_role NOT NULL,
  capability  text NOT NULL REFERENCES public.capabilities(key) ON DELETE CASCADE,
  granted     boolean NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (role, capability)
);

ALTER TABLE public.role_capabilities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "role_capabilities_select_authenticated" ON public.role_capabilities;
CREATE POLICY "role_capabilities_select_authenticated"
  ON public.role_capabilities FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "role_capabilities_admin_write" ON public.role_capabilities;
CREATE POLICY "role_capabilities_admin_write"
  ON public.role_capabilities FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Trigger updated_at + updated_by
CREATE OR REPLACE FUNCTION public.role_capabilities_set_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_role_capabilities_audit ON public.role_capabilities;
CREATE TRIGGER trg_role_capabilities_audit
  BEFORE INSERT OR UPDATE ON public.role_capabilities
  FOR EACH ROW EXECUTE FUNCTION public.role_capabilities_set_audit();

-- ============================================================================
-- 4. Seed matrice par défaut
-- ============================================================================
-- Admin : tout
INSERT INTO public.role_capabilities (role, capability, granted)
SELECT 'admin'::app_role, key, true FROM public.capabilities
ON CONFLICT (role, capability) DO NOTHING;

-- Chef chantier (global) : tout sauf admin plateforme + paramètres utilisateurs + suppression critique + sign employeur
INSERT INTO public.role_capabilities (role, capability, granted)
SELECT 'chef_chantier'::app_role, key,
  CASE
    WHEN key LIKE 'admin.%' THEN false
    WHEN key IN ('parametres.utilisateurs', 'affaires.delete', 'devis.delete',
                 'contrats.sign_employeur', 'employes.import') THEN false
    ELSE true
  END
FROM public.capabilities
ON CONFLICT (role, capability) DO NOTHING;

-- Chef métier scoped : lecture large + écriture sur son périmètre (la RLS DB borne déjà au périmètre)
INSERT INTO public.role_capabilities (role, capability, granted)
SELECT 'chef_metier_scoped'::app_role, key,
  CASE
    WHEN key LIKE 'admin.%' THEN false
    WHEN key IN ('parametres.utilisateurs', 'parametres.edit',
                 'affaires.delete', 'devis.delete', 'devis.import',
                 'contrats.sign_employeur', 'contrats.create',
                 'employes.import', 'employes.edit',
                 'staffing.plan.delete') THEN false
    WHEN key IN ('planning.view', 'planning.edit',
                 'staffing.plan.create', 'staffing.plan.publish', 'staffing.assignations.edit',
                 'affaires.view', 'affaires.edit', 'affaires.documents.upload',
                 'devis.view',
                 'heures.personnelles.saisir', 'heures.equipe.saisir', 'heures.valider',
                 'employes.view', 'contrats.view', 'contrats.view_own',
                 'parametres.view') THEN true
    ELSE false
  END
FROM public.capabilities
ON CONFLICT (role, capability) DO NOTHING;

-- RH : employés, contrats, taux + lecture planning/heures (pas de staffing/devis)
INSERT INTO public.role_capabilities (role, capability, granted)
SELECT 'rh'::app_role, key,
  CASE
    WHEN key IN ('planning.view',
                 'affaires.view',
                 'heures.audit',
                 'employes.view', 'employes.edit', 'employes.import',
                 'contrats.view', 'contrats.view_own', 'contrats.create',
                 'contrats.sign_employeur', 'contrats.voir_taux',
                 'parametres.view') THEN true
    ELSE false
  END
FROM public.capabilities
ON CONFLICT (role, capability) DO NOTHING;

-- Employé : strict perso
INSERT INTO public.role_capabilities (role, capability, granted)
SELECT 'employe'::app_role, key,
  CASE
    WHEN key IN ('heures.personnelles.saisir', 'contrats.view_own') THEN true
    ELSE false
  END
FROM public.capabilities
ON CONFLICT (role, capability) DO NOTHING;

-- ============================================================================
-- 5. Fonction user_has_capability (utilisée par le hook + future RLS)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.user_has_capability(_user_id uuid, _cap_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_capabilities rc
      ON rc.role = ur.role
    WHERE ur.user_id = _user_id
      AND rc.capability = _cap_key
      AND rc.granted = true
  );
$$;

COMMENT ON FUNCTION public.user_has_capability(uuid, text) IS
  'Bloc 1 capabilities : retourne true si l''utilisateur possède au moins un rôle qui accorde cette capability. SECURITY DEFINER — ne pas REVOKE EXECUTE.';

-- Helper convenience pour appels client (utilise auth.uid())
CREATE OR REPLACE FUNCTION public.current_user_has_capability(_cap_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_has_capability(auth.uid(), _cap_key);
$$;

COMMENT ON FUNCTION public.current_user_has_capability(text) IS
  'Bloc 1 capabilities : version sans paramètre pour usage RLS/RPC depuis le client.';
