-- v0.44.3 Sprint correctif — Action #2 triggers métier + Action #3 audit trail soft-delete

-- ============================================================================
-- ACTION #2 : Triggers de validation métier
-- ============================================================================

-- 2.1 heures_saisies : heures_reelles entre 0 et 24
CREATE OR REPLACE FUNCTION public.validate_heures_saisies_bounds()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.heures_reelles IS NOT NULL AND (NEW.heures_reelles < 0 OR NEW.heures_reelles > 24) THEN
    RAISE EXCEPTION 'HEURES_INVALIDES: heures_reelles doit être entre 0 et 24 (reçu %)', NEW.heures_reelles
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.heures_nuit IS NOT NULL AND (NEW.heures_nuit < 0 OR NEW.heures_nuit > 24) THEN
    RAISE EXCEPTION 'HEURES_INVALIDES: heures_nuit doit être entre 0 et 24 (reçu %)', NEW.heures_nuit
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.heures_reelles IS NOT NULL AND NEW.heures_nuit IS NOT NULL
     AND NEW.heures_nuit > NEW.heures_reelles THEN
    RAISE EXCEPTION 'HEURES_INVALIDES: heures_nuit (%) ne peut excéder heures_reelles (%)',
      NEW.heures_nuit, NEW.heures_reelles
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_heures_saisies_bounds ON public.heures_saisies;
CREATE TRIGGER trg_heures_saisies_bounds
  BEFORE INSERT OR UPDATE OF heures_reelles, heures_nuit ON public.heures_saisies
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_heures_saisies_bounds();

-- 2.2 contrats_intermittents : dates cohérentes + taux > 0
CREATE OR REPLACE FUNCTION public.validate_contrat_intermittent()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.date_fin < NEW.date_debut THEN
    RAISE EXCEPTION 'DATES_CONTRAT_INVALIDES: date_fin (%) doit être >= date_debut (%)',
      NEW.date_fin, NEW.date_debut
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.date_debut < (CURRENT_DATE - INTERVAL '2 years')::date THEN
    RAISE EXCEPTION 'DATES_CONTRAT_INVALIDES: date_debut trop ancienne (% < %)',
      NEW.date_debut, (CURRENT_DATE - INTERVAL '2 years')::date
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.taux_horaire_brut IS NOT NULL AND NEW.taux_horaire_brut <= 0 THEN
    RAISE EXCEPTION 'TAUX_INVALIDE: taux_horaire_brut doit être > 0 (reçu %)',
      NEW.taux_horaire_brut
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.heures_estimees IS NOT NULL AND NEW.heures_estimees < 0 THEN
    RAISE EXCEPTION 'HEURES_INVALIDES: heures_estimees doit être >= 0 (reçu %)',
      NEW.heures_estimees
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contrat_intermittent_validate ON public.contrats_intermittents;
CREATE TRIGGER trg_contrat_intermittent_validate
  BEFORE INSERT OR UPDATE OF date_debut, date_fin, taux_horaire_brut, heures_estimees
  ON public.contrats_intermittents
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_contrat_intermittent();

-- 2.3 assignations : heures entre 0 et 24
CREATE OR REPLACE FUNCTION public.validate_assignation_heures()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.heures < 0 OR NEW.heures > 24 THEN
    RAISE EXCEPTION 'HEURES_INVALIDES: assignation.heures doit être entre 0 et 24 (reçu %)', NEW.heures
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assignations_heures_bounds ON public.assignations;
CREATE TRIGGER trg_assignations_heures_bounds
  BEFORE INSERT OR UPDATE OF heures ON public.assignations
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_assignation_heures();

-- ============================================================================
-- ACTION #3 : Audit trail soft-delete documents + photos fabrication
-- ============================================================================

-- 3.1 affaire_documents : ajout deleted_by (deleted_at existe déjà)
ALTER TABLE public.affaire_documents
  ADD COLUMN IF NOT EXISTS deleted_by uuid NULL;

-- 3.2 fabrication_objets_photos : ajout deleted_at + deleted_by
ALTER TABLE public.fabrication_objets_photos
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS deleted_by uuid NULL;

CREATE INDEX IF NOT EXISTS idx_fab_photos_active
  ON public.fabrication_objets_photos (objet_id, uploaded_at DESC)
  WHERE deleted_at IS NULL;

-- 3.3 RPC soft-delete (atomique : set deleted_at + deleted_by)
CREATE OR REPLACE FUNCTION public.soft_delete_affaire_document(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_doc public.affaire_documents%ROWTYPE;
BEGIN
  SELECT * INTO v_doc FROM public.affaire_documents WHERE id = _id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DOCUMENT_NOT_FOUND: %', _id USING ERRCODE = 'no_data_found';
  END IF;
  -- Garde-fou : admin OU auteur uniquement
  IF NOT (public.is_admin() OR v_doc.uploaded_by = auth.uid()) THEN
    RAISE EXCEPTION 'FORBIDDEN: seul l''auteur ou un admin peut supprimer ce document'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE public.affaire_documents
    SET deleted_at = now(), deleted_by = auth.uid()
    WHERE id = _id AND deleted_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.soft_delete_affaire_document(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.soft_delete_objet_photo(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_photo public.fabrication_objets_photos%ROWTYPE;
BEGIN
  SELECT * INTO v_photo FROM public.fabrication_objets_photos WHERE id = _id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PHOTO_NOT_FOUND: %', _id USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT (public.is_admin() OR public.is_chef_or_admin()) THEN
    RAISE EXCEPTION 'FORBIDDEN: seul un chef ou admin peut supprimer cette photo'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE public.fabrication_objets_photos
    SET deleted_at = now(), deleted_by = auth.uid()
    WHERE id = _id AND deleted_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.soft_delete_objet_photo(uuid) TO authenticated;

-- 3.4 Vue admin : 30 derniers documents supprimés (audit trail)
CREATE OR REPLACE VIEW public.v_documents_supprimes_30j
WITH (security_invoker = true)
AS
SELECT
  'affaire_document'::text AS source,
  d.id,
  d.affaire_id,
  d.filename,
  d.deleted_at,
  d.deleted_by,
  prof.email AS deleted_by_email,
  d.uploaded_by,
  d.uploaded_at
FROM public.affaire_documents d
LEFT JOIN auth.users prof ON prof.id = d.deleted_by
WHERE d.deleted_at IS NOT NULL
  AND d.deleted_at >= (now() - INTERVAL '30 days')
UNION ALL
SELECT
  'fabrication_photo'::text AS source,
  p.id,
  fo.affaire_id,
  ('photo objet ' || COALESCE(fo.reference, fo.nom))::text AS filename,
  p.deleted_at,
  p.deleted_by,
  prof.email AS deleted_by_email,
  p.uploaded_by,
  p.uploaded_at
FROM public.fabrication_objets_photos p
JOIN public.fabrication_objets fo ON fo.id = p.objet_id
LEFT JOIN auth.users prof ON prof.id = p.deleted_by
WHERE p.deleted_at IS NOT NULL
  AND p.deleted_at >= (now() - INTERVAL '30 days')
ORDER BY deleted_at DESC;

GRANT SELECT ON public.v_documents_supprimes_30j TO authenticated;

-- 3.5 Update RLS fabrication_objets_photos pour masquer supprimées (sauf admin)
DROP POLICY IF EXISTS fab_photos_select_chef_admin_or_assigned ON public.fabrication_objets_photos;
CREATE POLICY fab_photos_select_chef_admin_or_assigned
  ON public.fabrication_objets_photos
  FOR SELECT
  TO authenticated
  USING (
    (deleted_at IS NULL OR public.is_admin())
    AND (
      public.is_chef_or_admin()
      OR EXISTS (
        SELECT 1 FROM public.fabrication_objets fo
        WHERE fo.id = fabrication_objets_photos.objet_id
          AND public.user_has_affaire_access(fo.affaire_id)
      )
    )
  );

COMMENT ON FUNCTION public.soft_delete_affaire_document(uuid) IS
  'v0.44.3 — Soft delete avec audit trail (deleted_by). Garde-fou : admin OU auteur.';
COMMENT ON FUNCTION public.soft_delete_objet_photo(uuid) IS
  'v0.44.3 — Soft delete avec audit trail (deleted_by). Garde-fou : chef ou admin.';
COMMENT ON VIEW public.v_documents_supprimes_30j IS
  'v0.44.3 — Vue admin des 30 derniers jours de suppressions documents/photos.';