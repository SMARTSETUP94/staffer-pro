-- ============================================================================
-- LOT 8.4 — JOURNAL & PHOTOS (DB)
-- ============================================================================
-- - Capability objet.photo.delete (admin only)
-- - Enum objet_journal_event_type + table objet_journal_events (immuable)
-- - Table objet_commentaires (pas d'UPDATE, DELETE auteur+admin)
-- - Extension fabrication_objets_photos (affaire_id, etape_id, thumb, dims)
-- - Refonte policies photos : upload élargi, delete admin only
-- - Helper SECURITY DEFINER objet_journal_log
-- - Triggers : étapes / objets (identité) / commentaires / staffing assign / photos / plan publié
-- - Backfill marker 'journal_started' sur objets actifs
-- ============================================================================

-- 1. Capability
INSERT INTO capabilities (key, label, description, category, sort_order)
VALUES ('objet.photo.delete', 'Supprimer une photo d''objet',
        'Supprimer définitivement une photo de fiche objet (admin uniquement)',
        'fabrication', 30)
ON CONFLICT (key) DO NOTHING;

-- 2. Enum événements
DO $$ BEGIN
  CREATE TYPE objet_journal_event_type AS ENUM (
    'journal_started',
    'etape_validee','etape_invalidee','etape_statut_change',
    'personne_assignee','personne_retiree','presence_modifiee',
    'photo_uploaded','photo_supprimee',
    'commentaire','commentaire_supprime',
    'identite_modifiee',
    'plan_republie'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Table journal
CREATE TABLE IF NOT EXISTS public.objet_journal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  objet_id uuid NOT NULL REFERENCES fabrication_objets(id) ON DELETE CASCADE,
  affaire_id uuid NOT NULL,
  event_type objet_journal_event_type NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  actor_label text,
  metier_id integer,
  etape_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ojev_objet_date ON objet_journal_events(objet_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_ojev_affaire_date ON objet_journal_events(affaire_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_ojev_type ON objet_journal_events(event_type);

ALTER TABLE objet_journal_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ojev_select_authorized ON objet_journal_events;
CREATE POLICY ojev_select_authorized ON objet_journal_events
  FOR SELECT TO authenticated
  USING (is_chef_or_admin() OR user_has_affaire_access(affaire_id) OR user_is_mentioned_on_affaire(affaire_id));

-- Insert/Delete admin only (les triggers SECURITY DEFINER passent outre RLS)
DROP POLICY IF EXISTS ojev_insert_admin ON objet_journal_events;
CREATE POLICY ojev_insert_admin ON objet_journal_events
  FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS ojev_delete_admin ON objet_journal_events;
CREATE POLICY ojev_delete_admin ON objet_journal_events
  FOR DELETE TO authenticated USING (is_admin());

-- 4. Table commentaires
CREATE TABLE IF NOT EXISTS public.objet_commentaires (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  objet_id uuid NOT NULL REFERENCES fabrication_objets(id) ON DELETE CASCADE,
  affaire_id uuid NOT NULL,
  etape_id uuid REFERENCES fabrication_etapes(id) ON DELETE SET NULL,
  author_id uuid NOT NULL,
  content text NOT NULL CHECK (length(content) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_objet_comm_objet_date ON objet_commentaires(objet_id, created_at DESC);

ALTER TABLE objet_commentaires ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS objc_select ON objet_commentaires;
CREATE POLICY objc_select ON objet_commentaires
  FOR SELECT TO authenticated
  USING (
    is_chef_or_admin()
    OR user_has_affaire_access(affaire_id)
    OR user_is_mentioned_on_affaire(affaire_id)
  );

DROP POLICY IF EXISTS objc_insert ON objet_commentaires;
CREATE POLICY objc_insert ON objet_commentaires
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND (
      is_chef_or_admin()
      OR user_has_affaire_access(affaire_id)
      OR user_is_mentioned_on_affaire(affaire_id)
    )
  );

-- Pas de policy UPDATE (édition interdite par design)

DROP POLICY IF EXISTS objc_delete_author_or_admin ON objet_commentaires;
CREATE POLICY objc_delete_author_or_admin ON objet_commentaires
  FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR is_admin());

-- 5. Extension fabrication_objets_photos
ALTER TABLE fabrication_objets_photos
  ADD COLUMN IF NOT EXISTS affaire_id uuid,
  ADD COLUMN IF NOT EXISTS etape_id uuid REFERENCES fabrication_etapes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS thumb_path text,
  ADD COLUMN IF NOT EXISTS width integer,
  ADD COLUMN IF NOT EXISTS height integer,
  ADD COLUMN IF NOT EXISTS size_bytes integer;

-- Backfill affaire_id depuis l'objet
UPDATE fabrication_objets_photos p
  SET affaire_id = fo.affaire_id
  FROM fabrication_objets fo
  WHERE p.objet_id = fo.id AND p.affaire_id IS NULL;

ALTER TABLE fabrication_objets_photos
  ALTER COLUMN affaire_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fop_objet_date
  ON fabrication_objets_photos(objet_id, uploaded_at DESC)
  WHERE deleted_at IS NULL;

-- Refonte policies photos
DROP POLICY IF EXISTS fab_photos_insert_chef_admin ON fabrication_objets_photos;
CREATE POLICY fab_photos_insert_authorized ON fabrication_objets_photos
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND (
      is_chef_or_admin()
      OR has_role(auth.uid(), 'atelier_chef'::app_role)
      OR has_role(auth.uid(), 'atelier_metier'::app_role)
      OR has_role(auth.uid(), 'bureau_etude'::app_role)
    )
  );

DROP POLICY IF EXISTS fab_photos_delete_chef_admin ON fabrication_objets_photos;
CREATE POLICY fab_photos_delete_admin ON fabrication_objets_photos
  FOR DELETE TO authenticated
  USING (is_admin());

-- 6. Helper SECURITY DEFINER : log
CREATE OR REPLACE FUNCTION public.objet_journal_log(
  p_objet_id uuid,
  p_event_type objet_journal_event_type,
  p_actor_id uuid,
  p_metier_id integer,
  p_etape_id uuid,
  p_payload jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_affaire_id uuid;
  v_label text;
BEGIN
  SELECT affaire_id INTO v_affaire_id FROM fabrication_objets WHERE id = p_objet_id;
  IF v_affaire_id IS NULL THEN RETURN; END IF;

  IF p_actor_id IS NOT NULL THEN
    SELECT NULLIF(trim(coalesce(e.prenom,'') || ' ' || coalesce(e.nom,'')), '')
      INTO v_label
      FROM employes e
      WHERE e.profile_id = p_actor_id
      LIMIT 1;
  END IF;

  INSERT INTO objet_journal_events(
    objet_id, affaire_id, event_type, actor_id, actor_label, metier_id, etape_id, payload
  )
  VALUES (
    p_objet_id, v_affaire_id, p_event_type, p_actor_id, v_label, p_metier_id, p_etape_id,
    coalesce(p_payload, '{}'::jsonb)
  );
END $$;

-- 7. Triggers

-- 7a. fabrication_etapes : validation / statut
CREATE OR REPLACE FUNCTION public.trg_fab_etapes_journal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_event objet_journal_event_type;
  v_payload jsonb;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.statut IS DISTINCT FROM NEW.statut THEN
    IF NEW.statut = 'fait'::fabrication_etape_statut THEN
      v_event := 'etape_validee';
    ELSIF OLD.statut = 'fait'::fabrication_etape_statut THEN
      v_event := 'etape_invalidee';
    ELSE
      v_event := 'etape_statut_change';
    END IF;
    v_payload := jsonb_build_object(
      'ancien_statut', OLD.statut::text,
      'nouveau_statut', NEW.statut::text,
      'type_etape', NEW.type_etape::text
    );
    PERFORM objet_journal_log(NEW.objet_id, v_event, auth.uid(), NULL, NEW.id, v_payload);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fab_etapes_journal ON fabrication_etapes;
CREATE TRIGGER trg_fab_etapes_journal
  AFTER UPDATE ON fabrication_etapes
  FOR EACH ROW EXECUTE FUNCTION trg_fab_etapes_journal();

-- 7b. fabrication_objets : édit identité (nom/qté/dims/matériaux/finition)
CREATE OR REPLACE FUNCTION public.trg_fab_objets_journal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_diff jsonb := '{}'::jsonb;
BEGIN
  IF OLD.nom IS DISTINCT FROM NEW.nom THEN
    v_diff := v_diff || jsonb_build_object('nom', jsonb_build_object('avant', OLD.nom, 'apres', NEW.nom));
  END IF;
  IF OLD.quantite IS DISTINCT FROM NEW.quantite THEN
    v_diff := v_diff || jsonb_build_object('quantite', jsonb_build_object('avant', OLD.quantite, 'apres', NEW.quantite));
  END IF;
  IF OLD.materiaux IS DISTINCT FROM NEW.materiaux THEN
    v_diff := v_diff || jsonb_build_object('materiaux', jsonb_build_object('avant', OLD.materiaux, 'apres', NEW.materiaux));
  END IF;
  IF OLD.finition_detail IS DISTINCT FROM NEW.finition_detail THEN
    v_diff := v_diff || jsonb_build_object('finition_detail', jsonb_build_object('avant', OLD.finition_detail, 'apres', NEW.finition_detail));
  END IF;
  IF OLD.largeur_mm IS DISTINCT FROM NEW.largeur_mm
     OR OLD.longueur_mm IS DISTINCT FROM NEW.longueur_mm
     OR OLD.hauteur_mm IS DISTINCT FROM NEW.hauteur_mm THEN
    v_diff := v_diff || jsonb_build_object('dimensions', jsonb_build_object(
      'avant', jsonb_build_object('L', OLD.longueur_mm, 'l', OLD.largeur_mm, 'h', OLD.hauteur_mm),
      'apres', jsonb_build_object('L', NEW.longueur_mm, 'l', NEW.largeur_mm, 'h', NEW.hauteur_mm)
    ));
  END IF;

  IF v_diff <> '{}'::jsonb THEN
    PERFORM objet_journal_log(NEW.id, 'identite_modifiee', auth.uid(), NULL, NULL, v_diff);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fab_objets_journal ON fabrication_objets;
CREATE TRIGGER trg_fab_objets_journal
  AFTER UPDATE ON fabrication_objets
  FOR EACH ROW EXECUTE FUNCTION trg_fab_objets_journal();

-- 7c. objet_commentaires : INSERT + DELETE (snapshot)
CREATE OR REPLACE FUNCTION public.trg_objet_commentaires_journal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM objet_journal_log(NEW.objet_id, 'commentaire', NEW.author_id, NULL, NEW.etape_id,
      jsonb_build_object('commentaire_id', NEW.id, 'preview', left(NEW.content, 200)));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM objet_journal_log(OLD.objet_id, 'commentaire_supprime', auth.uid(), NULL, OLD.etape_id,
      jsonb_build_object('commentaire_id', OLD.id, 'snapshot', OLD.content, 'author_id', OLD.author_id));
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_objet_comm_journal ON objet_commentaires;
CREATE TRIGGER trg_objet_comm_journal
  AFTER INSERT OR DELETE ON objet_commentaires
  FOR EACH ROW EXECUTE FUNCTION trg_objet_commentaires_journal();

-- 7d. fabrication_objets_photos : INSERT + soft DELETE (deleted_at)
CREATE OR REPLACE FUNCTION public.trg_fab_photos_journal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_etape_metier integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.etape_id IS NOT NULL THEN
      SELECT NULL::integer INTO v_etape_metier; -- fabrication_etapes n'a pas metier_id direct (type_etape ENUM)
    END IF;
    PERFORM objet_journal_log(NEW.objet_id, 'photo_uploaded', NEW.uploaded_by, NULL, NEW.etape_id,
      jsonb_build_object('photo_id', NEW.id, 'storage_path', NEW.storage_path));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    PERFORM objet_journal_log(NEW.objet_id, 'photo_supprimee', NEW.deleted_by, NULL, NEW.etape_id,
      jsonb_build_object('photo_id', NEW.id, 'storage_path', NEW.storage_path));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM objet_journal_log(OLD.objet_id, 'photo_supprimee', auth.uid(), NULL, OLD.etape_id,
      jsonb_build_object('photo_id', OLD.id, 'storage_path', OLD.storage_path, 'hard_delete', true));
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_fab_photos_journal ON fabrication_objets_photos;
CREATE TRIGGER trg_fab_photos_journal
  AFTER INSERT OR UPDATE OR DELETE ON fabrication_objets_photos
  FOR EACH ROW EXECUTE FUNCTION trg_fab_photos_journal();

-- 7e. staffing_plan_assignment : assign / retrait / présence
CREATE OR REPLACE FUNCTION public.trg_spa_journal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_objet_id uuid;
  v_metier_id integer;
  v_employe_profile uuid;
  v_employe_label text;
  v_step staffing_plan_step%ROWTYPE;
  v_actor uuid := auth.uid();
  v_old_e uuid;
BEGIN
  -- Récupère le step pour avoir objet_id + metier_id
  IF TG_OP IN ('INSERT','UPDATE') THEN
    SELECT * INTO v_step FROM staffing_plan_step WHERE id = NEW.step_id;
  ELSE
    SELECT * INTO v_step FROM staffing_plan_step WHERE id = OLD.step_id;
  END IF;
  v_objet_id := v_step.objet_id;
  v_metier_id := v_step.metier_id;
  IF v_objet_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT prenom || ' ' || nom INTO v_employe_label FROM employes WHERE id = NEW.employe_id;
    PERFORM objet_journal_log(v_objet_id, 'personne_assignee', v_actor, v_metier_id, NULL,
      jsonb_build_object(
        'employe_id', NEW.employe_id,
        'employe_label', v_employe_label,
        'date', NEW.date,
        'presence_pct', NEW.presence_pct,
        'manuel', COALESCE(NEW.manual_assignment_origin, false)
      ));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND OLD.presence_pct IS DISTINCT FROM NEW.presence_pct THEN
    PERFORM objet_journal_log(v_objet_id, 'presence_modifiee', v_actor, v_metier_id, NULL,
      jsonb_build_object(
        'employe_id', NEW.employe_id,
        'date', NEW.date,
        'avant', OLD.presence_pct,
        'apres', NEW.presence_pct
      ));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT prenom || ' ' || nom INTO v_employe_label FROM employes WHERE id = OLD.employe_id;
    PERFORM objet_journal_log(v_objet_id, 'personne_retiree', v_actor, v_metier_id, NULL,
      jsonb_build_object(
        'employe_id', OLD.employe_id,
        'employe_label', v_employe_label,
        'date', OLD.date,
        'presence_pct', OLD.presence_pct
      ));
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_spa_journal ON staffing_plan_assignment;
CREATE TRIGGER trg_spa_journal
  AFTER INSERT OR UPDATE OR DELETE ON staffing_plan_assignment
  FOR EACH ROW EXECUTE FUNCTION trg_spa_journal();

-- 7f. staffing_plan : republie (status passe à published)
CREATE OR REPLACE FUNCTION public.trg_staffing_plan_journal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.status = 'published'::text THEN
    FOR r IN SELECT DISTINCT objet_id FROM staffing_plan_step WHERE plan_id = NEW.id AND objet_id IS NOT NULL LOOP
      PERFORM objet_journal_log(r.objet_id, 'plan_republie', auth.uid(), NULL, NULL,
        jsonb_build_object('plan_id', NEW.id));
    END LOOP;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_staffing_plan_journal ON staffing_plan;
CREATE TRIGGER trg_staffing_plan_journal
  AFTER UPDATE ON staffing_plan
  FOR EACH ROW EXECUTE FUNCTION trg_staffing_plan_journal();

-- 8. Backfill : marker journal_started pour objets actifs
INSERT INTO objet_journal_events (objet_id, affaire_id, event_type, occurred_at, payload)
SELECT fo.id, fo.affaire_id, 'journal_started'::objet_journal_event_type, now(),
       jsonb_build_object('note', 'Démarrage de l''historisation du journal')
FROM fabrication_objets fo
WHERE NOT fo.archive
  AND NOT EXISTS (SELECT 1 FROM objet_journal_events e WHERE e.objet_id = fo.id);
