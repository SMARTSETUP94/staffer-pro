-- ============================================================================
-- LOT 8.1 — FONDATIONS DATA FICHE OBJET
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Index partiel sur heures_saisies pour accélérer l'agrégation par objet
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_heures_saisies_objet_metier_valide
  ON public.heures_saisies (fabrication_objet_id, metier_id)
  WHERE statut = 'valide' AND fabrication_objet_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Vue matérialisée : RÉEL UNIQUEMENT (heures validées par objet × métier)
--    Prévu (fabrication_objets) et planifié (staffing_plan_step) restent
--    lus en live par les hooks UI — pas besoin de pré-agréger.
-- ---------------------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS public.v_objet_heures_consolidees CASCADE;

CREATE MATERIALIZED VIEW public.v_objet_heures_consolidees AS
SELECT
  fo.id          AS objet_id,
  fo.affaire_id  AS affaire_id,
  m.id           AS metier_id,
  m.code         AS metier_code,
  COALESCE(SUM(hs.heures_reelles), 0)::numeric AS heures_reelles,
  COUNT(hs.id)::integer                        AS nb_saisies,
  MAX(hs.valide_le)                            AS derniere_validation_le
FROM public.fabrication_objets fo
CROSS JOIN public.metiers m
LEFT JOIN public.heures_saisies hs
  ON hs.fabrication_objet_id = fo.id
 AND hs.metier_id = m.id
 AND hs.statut = 'valide'
GROUP BY fo.id, fo.affaire_id, m.id, m.code;

-- Unique index requis pour REFRESH CONCURRENTLY
CREATE UNIQUE INDEX uq_v_objet_heures_consolidees
  ON public.v_objet_heures_consolidees (objet_id, metier_id);

CREATE INDEX idx_v_objet_heures_consolidees_affaire
  ON public.v_objet_heures_consolidees (affaire_id);

COMMENT ON MATERIALIZED VIEW public.v_objet_heures_consolidees IS
  'Lot 8.1 — Heures réelles validées agrégées par objet × métier. Refresh quotidien à 03h UTC via pg_cron. Prévu/planifié restent lus en live.';

-- ---------------------------------------------------------------------------
-- 3. Rafraîchissement initial (non-concurrent car premier remplissage)
-- ---------------------------------------------------------------------------
REFRESH MATERIALIZED VIEW public.v_objet_heures_consolidees;

-- ---------------------------------------------------------------------------
-- 4. pg_cron — refresh quotidien à 03h UTC
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Unschedule si déjà présent (idempotence)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-objet-heures-consolidees') THEN
    PERFORM cron.unschedule('refresh-objet-heures-consolidees');
  END IF;
END $$;

SELECT cron.schedule(
  'refresh-objet-heures-consolidees',
  '0 3 * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY public.v_objet_heures_consolidees;$$
);

-- ---------------------------------------------------------------------------
-- 5. Colonne fabrication_objet_id sur affaire_documents
--    (renforce l'existante objet_id qui n'a pas de FK explicite)
-- ---------------------------------------------------------------------------
ALTER TABLE public.affaire_documents
  ADD COLUMN IF NOT EXISTS fabrication_objet_id uuid
    REFERENCES public.fabrication_objets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_affaire_documents_fabrication_objet
  ON public.affaire_documents (fabrication_objet_id)
  WHERE fabrication_objet_id IS NOT NULL;

COMMENT ON COLUMN public.affaire_documents.fabrication_objet_id IS
  'Lot 8.1 — Rattachement direct d''un document/photo à un objet de fabrication. NULL = document affaire global.';

-- Backfill depuis objet_id existant (si la colonne legacy contient des UUIDs valides)
UPDATE public.affaire_documents ad
SET fabrication_objet_id = ad.objet_id
WHERE ad.objet_id IS NOT NULL
  AND ad.fabrication_objet_id IS NULL
  AND EXISTS (SELECT 1 FROM public.fabrication_objets fo WHERE fo.id = ad.objet_id);

-- ---------------------------------------------------------------------------
-- 6. Nouvelles capabilities Fiche Objet
-- ---------------------------------------------------------------------------
INSERT INTO public.capabilities (key, label, description, category, sort_order) VALUES
  ('objet.view',         'Voir une fiche objet',          'Consulter la fiche détaillée d''un objet de fabrication (identité, heures, étapes, équipe, photos).', 'fabrication', 10),
  ('objet.edit',         'Modifier une fiche objet',      'Modifier l''identité d''un objet (référence, nom, quantité, finition, plans CAD, etc.).',           'fabrication', 20),
  ('objet.team.manage',  'Gérer l''équipe d''un objet',   'Ajouter/retirer des personnes sur les métiers d''un objet, déclencher l''auto-remplissage.',         'fabrication', 30),
  ('objet.photo.upload', 'Téléverser une photo d''objet', 'Ajouter des photos sur un objet de fabrication, auto-taggées par étape en cours.',                    'fabrication', 40)
ON CONFLICT (key) DO UPDATE
  SET label = EXCLUDED.label,
      description = EXCLUDED.description,
      category = EXCLUDED.category,
      sort_order = EXCLUDED.sort_order;

-- ---------------------------------------------------------------------------
-- 7. Matrice rôles × caps Fiche Objet (arbitrages validés Gabin)
--    objet.view : tout le monde sauf rh (scoping data-layer via RLS)
--    objet.edit : admin + chefs + bureau_etude + atelier_chef
--    objet.team.manage : admin + chefs + atelier_chef (PAS bureau_etude)
--    objet.photo.upload : admin + chefs + atelier_chef + atelier_metier + bureau_etude
-- ---------------------------------------------------------------------------
INSERT INTO public.role_capabilities (role, capability, granted) VALUES
  -- objet.view
  ('admin'::app_role,              'objet.view', true),
  ('chef_chantier'::app_role,      'objet.view', true),
  ('chef_metier_scoped'::app_role, 'objet.view', true),
  ('bureau_etude'::app_role,       'objet.view', true),
  ('atelier_chef'::app_role,       'objet.view', true),
  ('atelier_metier'::app_role,     'objet.view', true),
  ('poseur'::app_role,             'objet.view', true),
  ('employe'::app_role,            'objet.view', true),
  ('commercial'::app_role,         'objet.view', true),
  ('logistique'::app_role,         'objet.view', true),
  ('rh'::app_role,                 'objet.view', false),
  -- objet.edit
  ('admin'::app_role,              'objet.edit', true),
  ('chef_chantier'::app_role,      'objet.edit', true),
  ('chef_metier_scoped'::app_role, 'objet.edit', true),
  ('bureau_etude'::app_role,       'objet.edit', true),
  ('atelier_chef'::app_role,       'objet.edit', true),
  ('atelier_metier'::app_role,     'objet.edit', false),
  ('poseur'::app_role,             'objet.edit', false),
  ('employe'::app_role,            'objet.edit', false),
  ('commercial'::app_role,         'objet.edit', false),
  ('logistique'::app_role,         'objet.edit', false),
  ('rh'::app_role,                 'objet.edit', false),
  -- objet.team.manage
  ('admin'::app_role,              'objet.team.manage', true),
  ('chef_chantier'::app_role,      'objet.team.manage', true),
  ('chef_metier_scoped'::app_role, 'objet.team.manage', true),
  ('bureau_etude'::app_role,       'objet.team.manage', false),
  ('atelier_chef'::app_role,       'objet.team.manage', true),
  ('atelier_metier'::app_role,     'objet.team.manage', false),
  ('poseur'::app_role,             'objet.team.manage', false),
  ('employe'::app_role,            'objet.team.manage', false),
  ('commercial'::app_role,         'objet.team.manage', false),
  ('logistique'::app_role,         'objet.team.manage', false),
  ('rh'::app_role,                 'objet.team.manage', false),
  -- objet.photo.upload
  ('admin'::app_role,              'objet.photo.upload', true),
  ('chef_chantier'::app_role,      'objet.photo.upload', true),
  ('chef_metier_scoped'::app_role, 'objet.photo.upload', true),
  ('bureau_etude'::app_role,       'objet.photo.upload', true),
  ('atelier_chef'::app_role,       'objet.photo.upload', true),
  ('atelier_metier'::app_role,     'objet.photo.upload', true),
  ('poseur'::app_role,             'objet.photo.upload', false),
  ('employe'::app_role,            'objet.photo.upload', false),
  ('commercial'::app_role,         'objet.photo.upload', false),
  ('logistique'::app_role,         'objet.photo.upload', false),
  ('rh'::app_role,                 'objet.photo.upload', false)
ON CONFLICT (role, capability) DO UPDATE
  SET granted = EXCLUDED.granted,
      updated_at = now();

-- ---------------------------------------------------------------------------
-- 8. Feature flag fiche_objet_v1 (désactivé au seed)
-- ---------------------------------------------------------------------------
INSERT INTO public.feature_flags (flag_key, description, enabled_globally, enabled_for_roles, enabled_for_user_ids)
VALUES (
  'fiche_objet_v1',
  'Lot 8 — Fiche Objet intégrée (identité, heures, étapes, équipe, photos). Active la route /affaires/$id/objets/$id et les liens croisés depuis Gantt/Planning/Devis/Kanban.',
  false,
  ARRAY[]::text[],
  ARRAY[]::uuid[]
)
ON CONFLICT (flag_key) DO NOTHING;