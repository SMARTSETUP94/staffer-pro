CREATE OR REPLACE FUNCTION public.mcp_document_affaire_ajouter(_affaire_id uuid, _p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid; v_ex uuid; v_sha text := _p->>'empreinte_sha256'; v_cat text := NULLIF(_p->>'categorie','');
BEGIN
  IF NOT mcp_dispatch_actif() THEN RAISE EXCEPTION 'Écriture MCP hors confirmation refusée'; END IF;
  IF NOT user_can_write_affaire(_affaire_id, 'section.affaires') THEN RAISE EXCEPTION 'Droits insuffisants sur cette affaire' USING ERRCODE='42501'; END IF;
  IF v_sha IS NULL OR v_sha !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Empreinte obligatoire'; END IF;
  IF coalesce(_p->>'mime','') NOT IN ('image/jpeg','image/png','application/pdf') THEN RAISE EXCEPTION 'Type refusé (JPG, PNG ou PDF)'; END IF;
  IF coalesce((_p->>'size_bytes')::bigint,0) NOT BETWEEN 1 AND 10485760 THEN RAISE EXCEPTION 'Taille refusée (10 Mo maximum)'; END IF;
  IF (_p->>'storage_path') IS DISTINCT FROM (_affaire_id::text||'/mcp/'||v_sha||'.'||CASE _p->>'mime' WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/png' THEN 'png' ELSE 'pdf' END) THEN RAISE EXCEPTION 'Chemin de dépôt incohérent'; END IF;
  SELECT id INTO v_ex FROM affaire_documents WHERE affaire_id=_affaire_id AND empreinte_sha256=v_sha AND deleted_at IS NULL AND document_parent_id IS NULL ORDER BY uploaded_at LIMIT 1;
  IF v_ex IS NOT NULL THEN RETURN jsonb_build_object('document_id',v_ex,'doublon',true); END IF;
  INSERT INTO affaire_documents(affaire_id,storage_path,filename,nom_lisible,mime_type,taille_bytes,description,uploaded_by,categorie,categorie_source,empreinte_sha256)
  VALUES (_affaire_id, _p->>'storage_path', left(coalesce(NULLIF(trim(_p->>'nom'),''), v_sha),255),
          left(NULLIF(trim(_p->>'nom'),''),120), _p->>'mime', (_p->>'size_bytes')::bigint,
          left('Déposé par Claude — Source : '||coalesce(NULLIF(trim(_p->>'source'),''),'Claude'),500), auth.uid(), v_cat, CASE WHEN v_cat IS NULL THEN NULL ELSE 'ia' END, v_sha)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('document_id',v_id,'doublon',false);
END $function$;
REVOKE EXECUTE ON FUNCTION public.mcp_document_affaire_ajouter(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mcp_document_affaire_ajouter(uuid, jsonb) TO authenticated, service_role;