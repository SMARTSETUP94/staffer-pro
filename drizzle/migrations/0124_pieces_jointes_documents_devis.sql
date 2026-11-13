-- Partie B v2 — corrections de relecture 1 à 5 (13/11/2026)
ALTER TABLE public.emails_entrants ADD COLUMN IF NOT EXISTS classement_pj jsonb;
COMMENT ON COLUMN public.emails_entrants.classement_pj IS
  'Bilan du classement des pièces jointes : {etat: classe|partiel|a_reprendre|echec, tentatives, maj_le, affaire_id, rattache_par (auteur des documents), pieces:[{attachment_id, nom, resultat: classee|doublon|refusee|ecartee_logo, motif, document_id}]}';
ALTER TABLE public.devis_photos ADD COLUMN IF NOT EXISTS source_document_id uuid;

CREATE OR REPLACE FUNCTION public.emails_classement_pj_enregistrer(_email_id uuid, _affaire_id uuid, _bilan jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_aff uuid; v_old jsonb; v_service boolean := coalesce(auth.jwt()->>'role','') = 'service_role';
  v_piece jsonb; v_doc uuid;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT (public.current_user_has_capability('section.affaires')
            AND public.current_user_has_capability('demandes_clients.view')) THEN
      RAISE EXCEPTION 'Classement des documents non autorisé';
    END IF;
  ELSIF NOT v_service THEN
    RAISE EXCEPTION 'Classement des documents non autorisé';
  END IF;

  SELECT opportunite_id, classement_pj INTO v_aff, v_old FROM emails_entrants WHERE id = _email_id AND source_boite = 'devis';
  IF v_aff IS NULL OR v_aff <> _affaire_id THEN
    RAISE EXCEPTION 'La demande n''est pas rattachée à cette affaire';
  END IF;

  IF jsonb_typeof(_bilan) <> 'object'
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(_bilan) k WHERE k NOT IN ('etat','tentatives','maj_le','affaire_id','rattache_par','pieces'))
     OR coalesce(_bilan->>'etat','') NOT IN ('classe','partiel','a_reprendre','echec')
     OR jsonb_typeof(_bilan->'tentatives') <> 'number' OR (_bilan->>'tentatives')::numeric NOT BETWEEN 0 AND 10
     OR (_bilan->>'affaire_id') IS DISTINCT FROM _affaire_id::text
     OR jsonb_typeof(_bilan->'pieces') <> 'array' OR jsonb_array_length(_bilan->'pieces') > 50 THEN
    RAISE EXCEPTION 'Bilan invalide';
  END IF;
  IF auth.uid() IS NOT NULL AND (_bilan->>'rattache_par') IS DISTINCT FROM auth.uid()::text THEN
    RAISE EXCEPTION 'Bilan invalide : auteur';
  END IF;
  IF v_service AND (_bilan->>'rattache_par') IS DISTINCT FROM (v_old->>'rattache_par') THEN
    RAISE EXCEPTION 'Bilan invalide : auteur';
  END IF;
  FOR v_piece IN SELECT * FROM jsonb_array_elements(_bilan->'pieces') LOOP
    IF jsonb_typeof(v_piece) <> 'object'
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_piece) k WHERE k NOT IN ('attachment_id','nom','resultat','motif','document_id'))
       OR coalesce(v_piece->>'resultat','') NOT IN ('classee','doublon','refusee','ecartee_logo')
       OR length(coalesce(v_piece->>'attachment_id','')) NOT BETWEEN 1 AND 500
       OR length(coalesce(v_piece->>'nom','')) > 300 OR length(coalesce(v_piece->>'motif','')) > 300 THEN
      RAISE EXCEPTION 'Bilan invalide : pièce';
    END IF;
    IF v_piece->>'resultat' IN ('classee','doublon') THEN
      BEGIN v_doc := (v_piece->>'document_id')::uuid; EXCEPTION WHEN others THEN RAISE EXCEPTION 'Bilan invalide : document'; END;
      IF NOT EXISTS (SELECT 1 FROM affaire_documents d WHERE d.id = v_doc AND d.affaire_id = _affaire_id
                     AND d.source_email_id = _email_id AND d.source_attachment_id = v_piece->>'attachment_id') THEN
        RAISE EXCEPTION 'Bilan invalide : document absent de l''affaire';
      END IF;
    ELSIF v_piece ? 'document_id' AND v_piece->'document_id' <> 'null'::jsonb THEN
      RAISE EXCEPTION 'Bilan invalide : document';
    END IF;
  END LOOP;
  UPDATE emails_entrants SET classement_pj = _bilan || jsonb_build_object('maj_le', now()) WHERE id = _email_id;
END $function$;
REVOKE EXECUTE ON FUNCTION public.emails_classement_pj_enregistrer(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emails_classement_pj_enregistrer(uuid, uuid, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.devis_photo_ajouter(_ligne_id uuid, _p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_d uuid := devis_de_ligne(_ligne_id); v_id uuid; v_src uuid := nullif(_p->>'source_document_id','')::uuid;
BEGIN
  PERFORM devis_assert_ecriture(v_d);
  IF (_p->>'storage_path') NOT LIKE v_d::text||'/%' THEN RAISE EXCEPTION 'Chemin de fichier invalide'; END IF;
  IF v_src IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM affaire_documents ad JOIN devis dv ON dv.id = v_d
       WHERE ad.id = v_src AND ad.affaire_id = dv.affaire_id AND ad.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Document introuvable dans l''affaire de ce devis';
  END IF;
  INSERT INTO devis_photos(devis_id,ligne_id,storage_path,thumb_path,mime,width,height,size_bytes,legende,visible_client,ordre,source_document_id)
  VALUES(v_d,_ligne_id,_p->>'storage_path',_p->>'thumb_path',_p->>'mime',(_p->>'width')::int,(_p->>'height')::int,(_p->>'size_bytes')::int,
         _p->>'legende',coalesce((_p->>'visible_client')::boolean,true),
         coalesce((_p->>'ordre')::numeric,(SELECT coalesce(max(ordre),0)+1 FROM devis_photos WHERE ligne_id=_ligne_id)),
         v_src)
  RETURNING id INTO v_id;
  RETURN v_id;
END $function$;
REVOKE EXECUTE ON FUNCTION public.devis_photo_ajouter(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devis_photo_ajouter(uuid, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.devis_mcp_appliquer(_tool text, _p jsonb, _affaire_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE etat jsonb; ex jsonb; v_id uuid; v_modele uuid; v_mode text := coalesce(_p->>'mode',''); k text; patch jsonb; dates jsonb := '{}'::jsonb; entete jsonb := '{}'::jsonb;
BEGIN
  IF v_mode NOT IN ('autonomie','conversation') THEN RAISE EXCEPTION 'Mode obligatoire : autonomie ou conversation'; END IF;
  IF _tool='devis_creer_brouillon' THEN
    ex := devis_mcp_existants(_affaire_id, NULLIF(_p->>'cle_externe',''));
    IF ex->>'cle' IS NOT NULL THEN RETURN jsonb_build_object('devis_id',ex->>'cle','existant',true); END IF;
    IF ex->'brouillon' IS NOT NULL AND ex->'brouillon'<>'null'::jsonb THEN
      RAISE EXCEPTION 'Un brouillon actif existe déjà sur cette affaire : % (devis_id %)', ex->'brouillon'->>'numero', ex->'brouillon'->>'id'; END IF;
    IF ex->'dernier' IS NOT NULL AND ex->'dernier'<>'null'::jsonb THEN
      RAISE EXCEPTION 'Cette affaire a déjà le devis % (%) : utiliser devis_nouvelle_version (devis_id %)', ex->'dernier'->>'numero', ex->'dernier'->>'statut', ex->'dernier'->>'id'; END IF;
    v_modele := CASE WHEN _p->>'modele_id'='vierge' THEN NULL ELSE coalesce(NULLIF(_p->>'modele_id','')::uuid, devis_modele_defaut_id()) END;
    v_id := (devis_creer_depuis_pipeline(_affaire_id, v_modele)->>'devis_id')::uuid;
    PERFORM devis_mcp_marquer(v_id, NULLIF(_p->>'cle_externe',''), _p->>'note');
    RETURN jsonb_build_object('devis_id',v_id,'existant',false,'modele_id',v_modele,'calcul',devis_calculer(v_id));
  END IF;

  etat := devis_mcp_etat(NULLIF(_p->>'devis_id','')::uuid);
  IF (etat->>'affaire_id')::uuid IS DISTINCT FROM _affaire_id OR etat->>'supprime_le' IS NOT NULL OR (etat->>'est_modele')::boolean THEN
    RAISE EXCEPTION 'Devis et affaire incohérents'; END IF;

  IF _tool='devis_nouvelle_version' THEN
    IF etat->>'statut_redaction'='brouillon' THEN RAISE EXCEPTION 'Ce devis est encore en brouillon : le compléter avec devis_remplir'; END IF;
    v_id := devis_nouvelle_version((etat->>'id')::uuid);
    PERFORM devis_mcp_marquer(v_id, NULL, _p->>'note');
    RETURN jsonb_build_object('devis_id',v_id,'version_precedente_id',etat->>'id','calcul',devis_calculer(v_id));
  END IF;

  IF _tool='devis_enregistrer_transfert' THEN
    IF v_mode<>'conversation' THEN RAISE EXCEPTION 'Transfert ProGBat refusé en autonomie : uniquement en conversation, avec l''accord explicite de l''utilisateur'; END IF;
    RETURN devis_enregistrer_transfert((etat->>'id')::uuid, _p->>'numero_progbat', (_p->>'total_progbat')::numeric, NULLIF(_p->>'motif',''));
  END IF;

  IF coalesce(etat->>'statut_redaction','brouillon') <> 'brouillon' THEN
    RAISE EXCEPTION 'Devis verrouillé (%) : créez une nouvelle version', etat->>'statut_redaction'; END IF;
  IF v_mode='autonomie' AND etat->>'modifie_par_humain_le' IS NOT NULL THEN
    RAISE EXCEPTION 'Brouillon repris par % le % : écriture autonome refusée (passer en mode conversation à la demande explicite de l''utilisateur)',
      coalesce(etat->>'humain','un utilisateur'), to_char((etat->>'modifie_par_humain_le')::timestamptz AT TIME ZONE 'Europe/Paris','DD/MM/YYYY HH24:MI');
  END IF;

  IF _tool='devis_remplir' THEN
    IF v_mode='autonomie' AND NOT coalesce((etat->>'cree_par_mcp')::boolean,false)
       AND (jsonb_array_length(coalesce(_p->'modifications','[]'::jsonb)) > 0 OR jsonb_array_length(coalesce(_p->'suppressions','[]'::jsonb)) > 0
            OR EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(_p->'lignes','[]'::jsonb)) x WHERE x ? 'ligne_id')) THEN
      RAISE EXCEPTION 'En autonomie, Claude ne modifie ni ne supprime que dans un brouillon qu''il a créé : passer en mode conversation à la demande explicite de l''utilisateur';
    END IF;
    RETURN devis_remplir_lot((etat->>'id')::uuid, coalesce(_p->'lignes','[]'::jsonb),
             jsonb_build_object('modifications', coalesce(_p->'modifications','[]'::jsonb), 'suppressions', coalesce(_p->'suppressions','[]'::jsonb)))
           || jsonb_build_object('devis_id',etat->>'id');
  ELSIF _tool='devis_modifier_entete' THEN
    patch := coalesce(_p->'champs','{}'::jsonb);
    FOR k IN SELECT jsonb_object_keys(patch) LOOP
      IF k IN ('client_id','contact_id','client_final_id','date_devis','date_validite','validite_jours','libelle') THEN entete := entete || jsonb_build_object(k, patch->k);
      ELSIF k IN ('date_visite_technique','date_montage','date_evenement_debut','date_evenement_fin','date_demontage') THEN dates := dates || jsonb_build_object(k, patch->k);
      ELSIF k <> 'remise' THEN RAISE EXCEPTION 'Champ interdit : %', k; END IF;
    END LOOP;
    IF entete <> '{}'::jsonb THEN PERFORM devis_entete_modifier((etat->>'id')::uuid, entete, false); END IF;
    IF dates <> '{}'::jsonb THEN PERFORM devis_dates_modifier((etat->>'id')::uuid, dates); END IF;
    IF patch ? 'remise' THEN PERFORM devis_remise_modifier((etat->>'id')::uuid, patch->'remise'->>'mode', coalesce((patch->'remise'->>'valeur')::numeric,0)); END IF;
    RETURN jsonb_build_object('devis_id',etat->>'id','calcul',devis_calculer((etat->>'id')::uuid));
  ELSIF _tool='devis_ajouter_photo' THEN
    IF NOT EXISTS (SELECT 1 FROM devis_mcp_ligne_objet((etat->>'id')::uuid, (_p->>'ligne_id')::uuid)) THEN RAISE EXCEPTION 'La photo doit être rattachée à un objet du devis'; END IF;
    v_id := devis_photo_ajouter((_p->>'ligne_id')::uuid, jsonb_build_object('storage_path',_p->>'storage_path','mime',_p->>'mime','size_bytes',(_p->>'size_bytes')::int,
             'legende',left(concat_ws(' — ', NULLIF(_p->>'legende',''), 'Source : '||coalesce(NULLIF(_p->>'source',''),'Claude')),500),
             'visible_client',coalesce((_p->>'visible_client')::boolean,false),
             'source_document_id',NULLIF(_p->>'source_document_id','')));
    RETURN jsonb_build_object('devis_id',etat->>'id','photo_id',v_id);
  ELSIF _tool='devis_soumettre' THEN
    RETURN devis_soumettre((etat->>'id')::uuid, _p->>'note');
  END IF;
  RAISE EXCEPTION 'Outil devis interdit';
END $function$;