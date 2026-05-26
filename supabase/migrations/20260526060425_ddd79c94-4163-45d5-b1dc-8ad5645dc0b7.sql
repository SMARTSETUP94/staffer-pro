-- ============================================================================
-- Bloc 9 Lot 9.1 — Fondations DB cartes mission pose
-- ============================================================================

-- 1) Colonnes infos terrain sur affaires --------------------------------------
ALTER TABLE public.affaires
  ADD COLUMN IF NOT EXISTS acces_livraison   text,
  ADD COLUMN IF NOT EXISTS code_acces        text,
  ADD COLUMN IF NOT EXISTS consignes_tenue   text,
  ADD COLUMN IF NOT EXISTS contact_site_nom  text,
  ADD COLUMN IF NOT EXISTS contact_site_tel  text;

-- 2) Enum + table mission_events ---------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.mission_event_type AS ENUM
    ('arrivee','depart','probleme','photo','message');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.mission_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affaire_id    uuid NOT NULL REFERENCES public.affaires(id) ON DELETE CASCADE,
  employe_id    uuid NOT NULL REFERENCES public.employes(id) ON DELETE CASCADE,
  phase         text NOT NULL CHECK (phase IN ('montage','demontage')),
  type          public.mission_event_type NOT NULL,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  latitude      numeric,
  longitude     numeric,
  note          text,
  photo_doc_id  uuid REFERENCES public.affaire_documents(id) ON DELETE SET NULL,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mission_events_affaire_employe_idx
  ON public.mission_events (affaire_id, employe_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS mission_events_employe_idx
  ON public.mission_events (employe_id, occurred_at DESC);

ALTER TABLE public.mission_events ENABLE ROW LEVEL SECURITY;

-- SELECT : admin/chef OU l'employé concerné (employes.profile_id = auth.uid())
DROP POLICY IF EXISTS mission_events_select ON public.mission_events;
CREATE POLICY mission_events_select ON public.mission_events
  FOR SELECT TO authenticated
  USING (
    public.is_chef_or_admin()
    OR employe_id IN (
      SELECT e.id FROM public.employes e WHERE e.profile_id = auth.uid()
    )
  );

-- INSERT : UNIQUEMENT l'employé concerné (Q2 — pas de chef INSERT)
DROP POLICY IF EXISTS mission_events_insert_self ON public.mission_events;
CREATE POLICY mission_events_insert_self ON public.mission_events
  FOR INSERT TO authenticated
  WITH CHECK (
    employe_id IN (
      SELECT e.id FROM public.employes e WHERE e.profile_id = auth.uid()
    )
  );

-- Pas de policy UPDATE/DELETE : journal immutable.

-- 3) Notification mission_probleme -------------------------------------------
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'mission_probleme';

-- 4) Capabilities + matrice ---------------------------------------------------
INSERT INTO public.capabilities (key, label, category, description, sort_order)
VALUES
  ('mon-poste.mission.record_event',
   'Enregistrer un événement mission',
   'mon-poste',
   'Arrivée, départ, photo, message depuis la carte mission',
   10),
  ('mon-poste.mission.signal_probleme',
   'Signaler un problème mission',
   'mon-poste',
   'Alerte transmise au chef d''équipe',
   11)
ON CONFLICT (key) DO NOTHING;

-- Matrice : admin + poseur + employe = TRUE ; les autres = FALSE
INSERT INTO public.role_capabilities (role, capability, granted)
SELECT r.role, c.cap, r.granted
FROM (
  VALUES
    ('admin'::app_role, true),
    ('chef_chantier'::app_role, false),
    ('chef_metier_scoped'::app_role, false),
    ('rh'::app_role, false),
    ('commercial'::app_role, false),
    ('bureau_etude'::app_role, false),
    ('atelier_chef'::app_role, false),
    ('atelier_metier'::app_role, false),
    ('logistique'::app_role, false),
    ('poseur'::app_role, true),
    ('employe'::app_role, true)
) AS r(role, granted)
CROSS JOIN (
  VALUES
    ('mon-poste.mission.record_event'),
    ('mon-poste.mission.signal_probleme')
) AS c(cap)
ON CONFLICT (role, capability) DO NOTHING;
