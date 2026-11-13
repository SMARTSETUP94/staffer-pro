ALTER TABLE public.affaire_documents
  ADD COLUMN document_parent_id uuid REFERENCES public.affaire_documents(id) ON DELETE SET NULL,
  ADD COLUMN page integer CHECK (page IS NULL OR page BETWEEN 1 AND 30),
  ADD COLUMN derive_type text CHECK (derive_type IS NULL OR derive_type IN ('page','image')),
  ADD COLUMN texte_page text CHECK (texte_page IS NULL OR length(texte_page) <= 4000),
  ADD COLUMN empreinte_sha256 text CHECK (empreinte_sha256 IS NULL OR empreinte_sha256 ~ '^[0-9a-f]{64}$'),
  ADD COLUMN nom_lisible text CHECK (nom_lisible IS NULL OR length(nom_lisible) <= 120),
  ADD COLUMN categorie_source text CHECK (categorie_source IS NULL OR categorie_source IN ('ia','humain','regle')),
  ADD COLUMN extraction jsonb CHECK (extraction IS NULL OR jsonb_typeof(extraction) = 'object');

-- Catégories : tri de la boîte + valeurs déjà écrites par l'app (photos de mission, demandes logistiques) + moodboard/esquisse (bloc 10.7).
ALTER TABLE public.affaire_documents ADD CONSTRAINT affaire_documents_categorie_chk CHECK (categorie IS NULL OR categorie IN (
  'brief','plan','visuel','reperage','offre_fournisseur','devis_setup','autre',
  'moodboard','esquisse_commerciale','logistique',
  'avant_montage','pendant_montage','apres_montage','avant_demontage','pendant_demontage','apres_demontage','incident'));

-- Un dérivé a toujours un type ET une empreinte (sinon l'unicité ne bloque pas les doublons).
ALTER TABLE public.affaire_documents ADD CONSTRAINT affaire_documents_derive_chk CHECK (
  (document_parent_id IS NULL AND derive_type IS NULL)
  OR (document_parent_id IS NOT NULL AND derive_type IS NOT NULL AND page IS NOT NULL AND empreinte_sha256 IS NOT NULL));

CREATE UNIQUE INDEX affaire_documents_derive_uniq ON public.affaire_documents (document_parent_id, derive_type, page, empreinte_sha256)
  WHERE document_parent_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX affaire_documents_empreinte_idx ON public.affaire_documents (affaire_id, empreinte_sha256) WHERE deleted_at IS NULL;
CREATE INDEX affaire_documents_parent_idx ON public.affaire_documents (document_parent_id) WHERE document_parent_id IS NOT NULL;

CREATE FUNCTION public.affaire_documents_derive_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.document_parent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM affaire_documents p
     WHERE p.id = NEW.document_parent_id AND p.affaire_id = NEW.affaire_id AND p.document_parent_id IS NULL
       AND p.mime_type = 'application/pdf' AND p.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Document parent invalide';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_affaire_documents_derive_guard BEFORE INSERT OR UPDATE OF document_parent_id, affaire_id
  ON public.affaire_documents FOR EACH ROW EXECUTE FUNCTION public.affaire_documents_derive_guard();

CREATE FUNCTION public.affaire_documents_retrait_derives() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    UPDATE affaire_documents SET deleted_at = NEW.deleted_at, deleted_by = NEW.deleted_by
     WHERE document_parent_id = NEW.id AND deleted_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_affaire_documents_retrait_derives AFTER UPDATE OF deleted_at ON public.affaire_documents
  FOR EACH ROW EXECUTE FUNCTION public.affaire_documents_retrait_derives();

-- Catégorie / nom lisible : seule écriture permise à toute personne ayant section.affaires ; l'IA ne réécrit jamais un choix humain.
CREATE FUNCTION public.affaire_document_categoriser(_id uuid, _categorie text, _nom_lisible text, _source text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_src text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.current_user_has_capability('section.affaires') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _source NOT IN ('ia','humain','regle') THEN RAISE EXCEPTION 'Source invalide'; END IF;
  IF _categorie IS NOT NULL AND _categorie NOT IN ('brief','plan','visuel','reperage','offre_fournisseur','devis_setup','autre','moodboard','esquisse_commerciale') THEN
    RAISE EXCEPTION 'Catégorie invalide';
  END IF;
  SELECT categorie_source INTO v_src FROM affaire_documents WHERE id = _id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND'; END IF;
  IF _source <> 'humain' AND v_src = 'humain' THEN RETURN false; END IF;
  UPDATE affaire_documents SET categorie = _categorie,
    nom_lisible = CASE WHEN _nom_lisible IS NULL THEN nom_lisible ELSE left(btrim(_nom_lisible), 120) END,
    categorie_source = _source
   WHERE id = _id;
  RETURN true;
END $$;
REVOKE EXECUTE ON FUNCTION public.affaire_document_categoriser(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.affaire_document_categoriser(uuid, text, text, text) TO authenticated, service_role;