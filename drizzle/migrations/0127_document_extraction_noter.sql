-- État d'extraction d'un PDF (pages/images) : seule écriture sur la colonne extraction, schéma borné.
CREATE FUNCTION public.affaire_document_extraction_noter(_id uuid, _etat jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.current_user_has_capability('section.affaires') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(_etat) <> 'object'
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(_etat) k WHERE k NOT IN ('etat','pages','images','motif','le'))
     OR coalesce(_etat->>'etat','') NOT IN ('fait','echec','partiel')
     OR length(coalesce(_etat->>'motif','')) > 200 THEN
    RAISE EXCEPTION 'État d''extraction invalide';
  END IF;
  UPDATE affaire_documents SET extraction = _etat
   WHERE id = _id AND deleted_at IS NULL AND document_parent_id IS NULL AND mime_type = 'application/pdf';
  IF NOT FOUND THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND'; END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.affaire_document_extraction_noter(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.affaire_document_extraction_noter(uuid, jsonb) TO authenticated, service_role;