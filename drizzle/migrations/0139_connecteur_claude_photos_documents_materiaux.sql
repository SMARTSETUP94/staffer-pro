-- Connecteur Claude (devis) : envoi groupé d'images, dépôt de documents d'affaire, propositions de matériaux. Redéfinitions explicites depuis les définitions actuelles.

-- Documents d'affaire déposés par Claude : fonction appelée seulement dans le contexte de dispatch MCP, sous les droits de l'appelant (RLS).
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
  INSERT INTO affaire_documents(affaire_id,storage_path,filename,nom_fichier,nom_lisible,mime_type,taille_bytes,description,uploaded_by,categorie,categorie_source,empreinte_sha256)
  VALUES (_affaire_id, _p->>'storage_path', left(coalesce(NULLIF(trim(_p->>'nom'),''), v_sha),255), left(coalesce(NULLIF(trim(_p->>'nom'),''), v_sha),255),
          left(NULLIF(trim(_p->>'nom'),''),120), _p->>'mime', (_p->>'size_bytes')::bigint,
          left('Déposé par Claude — Source : '||coalesce(NULLIF(trim(_p->>'source'),''),'Claude'),500), auth.uid(), v_cat, CASE WHEN v_cat IS NULL THEN NULL ELSE 'ia' END, v_sha)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('document_id',v_id,'doublon',false);
END $function$;
REVOKE EXECUTE ON FUNCTION public.mcp_document_affaire_ajouter(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mcp_document_affaire_ajouter(uuid, jsonb) TO authenticated, service_role;

-- Proposition d'article au catalogue par Claude, hors ligne de devis : statut « propose » uniquement, validation admin inchangée.
CREATE OR REPLACE FUNCTION public.materiau_proposer_mcp(_affaire_id uuid, _p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_d uuid := NULLIF(_p->>'devis_id','')::uuid; v_id uuid; v_ex uuid; v_couts boolean := current_user_has_capability('devis.couts'); v_prod text := NULLIF(trim(_p->>'produit'),''); v_unite text := coalesce(NULLIF(trim(_p->>'unite'),''),'unité');
BEGIN
  IF NOT mcp_dispatch_actif() THEN RAISE EXCEPTION 'Écriture MCP hors confirmation refusée'; END IF;
  IF NOT current_user_has_capability('devis.rediger') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF v_d IS NULL OR NOT EXISTS (SELECT 1 FROM devis WHERE id=v_d AND affaire_id=_affaire_id AND supprime_le IS NULL) OR NOT devis_peut_lire(v_d) THEN RAISE EXCEPTION 'Devis et affaire incohérents'; END IF;
  IF v_prod IS NULL OR length(v_prod) > 255 THEN RAISE EXCEPTION 'Désignation obligatoire (255 caractères maximum)'; END IF;
  SELECT id INTO v_ex FROM materiaux_catalogue WHERE proposition_statut='propose' AND lower(produit)=lower(v_prod) AND lower(unite)=lower(v_unite) LIMIT 1;
  IF v_ex IS NOT NULL THEN RETURN jsonb_build_object('proposition_id',v_ex,'doublon',true); END IF;
  INSERT INTO materiaux_catalogue(fournisseur_libre,produit,ref,unite,format_texte,epaisseur_mm,prix_achat_net,date_tarif,source,remarque,actif,proposition_statut,propose_par,propose_le,devis_origine_id)
  VALUES (left(NULLIF(trim(_p->>'fournisseur'),''),255), v_prod, left(NULLIF(trim(_p->>'ref'),''),120), left(v_unite,40), left(NULLIF(trim(_p->>'format_texte'),''),255),
          NULLIF(_p->>'epaisseur_mm','')::numeric,
          CASE WHEN v_couts THEN NULLIF(_p->>'prix_achat','')::numeric END,
          current_date, 'saisie_manuelle', left('Proposé par Claude — Source : '||coalesce(NULLIF(trim(_p->>'source'),''),'non précisée'),500),
          false, 'propose', auth.uid(), now(), v_d)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('proposition_id',v_id,'doublon',false,'prix_enregistre',v_couts AND NULLIF(_p->>'prix_achat','') IS NOT NULL);
END $function$;
REVOKE EXECUTE ON FUNCTION public.materiau_proposer_mcp(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.materiau_proposer_mcp(uuid, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mcp_assert_write(_tool text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE c text:=auth.jwt()->>'client_id'; cap text; BEGIN IF auth.uid() IS NULL OR c IS NULL OR NOT user_has_cap('api.mcp') OR NOT user_has_cap('api.mcp.write') OR NOT is_feature_flag_enabled('mcp_v1') OR NOT is_feature_flag_enabled('mcp_v2_write') OR NOT EXISTS(SELECT 1 FROM mcp_connections WHERE user_id=auth.uid() AND client_id=c AND revoked_at IS NULL) THEN RAISE EXCEPTION 'Écriture MCP refusée'; END IF; cap:=CASE WHEN _tool='creer_opportunite' THEN 'action.create_opportunite' WHEN _tool IN ('ajouter_action_opportunite','mettre_a_jour_opportunite','traiter_demande') THEN 'action.edit_opportunite' WHEN _tool IN ('modifier_chantier','ajouter_note_chantier') THEN 'section.affaires' WHEN _tool IN ('creer_etape_logistique','modifier_etape_logistique','deplacer_etape_logistique','annuler_etape_logistique') THEN 'logistique.etape.edit' WHEN _tool='affecter_role_projet' THEN 'affaires.edit' WHEN _tool IN ('devis_creer_brouillon','devis_remplir','devis_modifier_entete','devis_ajouter_photo','devis_nouvelle_version','devis_soumettre','devis_enregistrer_transfert','materiaux_proposer') THEN 'devis.rediger' WHEN _tool='documents_affaire_televerser' THEN 'section.affaires' END; IF cap='devis.rediger' AND NOT is_feature_flag_enabled('devis_staffing_v1') THEN RAISE EXCEPTION 'Module devis non activé'; END IF; IF cap IS NULL OR NOT user_has_cap(cap) THEN RAISE EXCEPTION 'Outil ou droit métier refusé'; END IF; RETURN cap; END $function$;

CREATE OR REPLACE FUNCTION public.mcp_dispatch_write(_tool text, _p jsonb, _affaire_id uuid, _etape_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE result jsonb; k text; patch jsonb; allowed text[]; a public.affaires; BEGIN PERFORM mcp_assert_write(_tool); IF _tool IN ('ajouter_action_opportunite','mettre_a_jour_opportunite') THEN SELECT * INTO a FROM affaires WHERE id=_affaire_id AND phase='opportunite' AND archived_at IS NULL; IF NOT FOUND THEN RAISE EXCEPTION 'Opportunité non signée requise'; END IF; END IF; IF _tool='creer_opportunite' THEN result:=app_creer_opportunite_client(_p-'email_ids'); IF jsonb_array_length(COALESCE(_p->'email_ids','[]'::jsonb))>0 THEN result:=result || jsonb_build_object('demandes',app_traiter_demande(ARRAY(SELECT jsonb_array_elements_text(_p->'email_ids')::uuid),'rattacher',(result->>'affaire_id')::uuid,NULL,false)); END IF; ELSIF _tool='traiter_demande' THEN result:=app_traiter_demande(ARRAY(SELECT jsonb_array_elements_text(_p->'email_ids_resolus')::uuid),_p->>'action',NULLIF(_p->>'opportunite_id','')::uuid,NULLIF(trim(_p->>'motif'),''),false); ELSIF _tool='ajouter_action_opportunite' THEN result:=app_ajouter_action_opportunite(_affaire_id,(_p->>'type')::public.opp_action_type,_p->>'note',(_p->>'echeance')::date); ELSIF _tool='ajouter_note_chantier' THEN result:=app_ajouter_note_chantier(_affaire_id,_p->>'texte'); ELSIF _tool IN ('modifier_chantier','mettre_a_jour_opportunite') THEN patch:=_p->'patch'; allowed:=CASE WHEN _tool='modifier_chantier' THEN ARRAY['date_montage','date_demontage','lieu','contact_site_nom','contact_site_tel','chef_projet_id','charge_affaires_id','dessinateur_id','statut','montage_nb_techniciens','montage_travail_nuit','montage_nb_semi','montage_nb_20m3','montage_nature_prestation','montage_notes','notes'] ELSE ARRAY['nom','notes','lieu','date_montage','date_demontage','date_evenement_debut','date_evenement_fin','date_pat','date_visite_technique','typologie_future','ca_estime_ht','charge_affaires_id','statut_opportunite'] END; FOR k IN SELECT jsonb_object_keys(patch) LOOP IF NOT k=ANY(allowed) THEN RAISE EXCEPTION 'Champ interdit'; END IF; END LOOP; IF _tool='mettre_a_jour_opportunite' AND patch ? 'statut_opportunite' AND patch->>'statut_opportunite' NOT IN ('a_faire','envoye','a_l_etude','presque_gagne') THEN RAISE EXCEPTION 'Statut gagné/perdu réservé à l''application'; END IF; IF patch<>'{}'::jsonb THEN result:=app_modifier_affaire(_affaire_id,patch); ELSE result:=jsonb_build_object('id',_affaire_id); END IF; IF _tool='mettre_a_jour_opportunite' THEN IF _p->>'prochaine_action' IS NOT NULL THEN PERFORM app_ajouter_action_opportunite(_affaire_id,'note_interne',_p->>'prochaine_action',(_p->>'echeance')::date); END IF; IF _p->>'motif' IS NOT NULL THEN PERFORM app_ajouter_action_opportunite(_affaire_id,'note_interne',_p->>'motif',NULL); END IF; IF _p->>'jalon' IS NOT NULL THEN IF _p->>'jalon' NOT IN ('qualification','devis_envoye','negociation') THEN RAISE EXCEPTION 'Jalon signature interdit'; END IF; UPDATE opportunite_jalons SET date_prevue=(_p->>'echeance')::date WHERE affaire_id=_affaire_id AND etape::text=_p->>'jalon'; IF NOT FOUND THEN RAISE EXCEPTION 'Jalon absent: initialiser dans l’UI'; END IF; END IF; END IF; ELSIF _tool='creer_etape_logistique' THEN result:=app_creer_etape_logistique(_p-'cle_externe'); ELSIF _tool='modifier_etape_logistique' THEN patch:=_p->'patch'; IF patch ? 'statut' AND patch->>'statut' NOT IN ('propose','valide','fait') THEN RAISE EXCEPTION 'Annulation nécessite motif'; END IF; result:=app_modifier_etape_logistique(_etape_id,patch); ELSIF _tool='deplacer_etape_logistique' THEN result:=deplacer_etape_logistique(_etape_id,(_p->>'nouveau_debut')::date,(_p->>'nouvelle_fin')::date); ELSIF _tool='annuler_etape_logistique' THEN IF length(trim(_p->>'motif')) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Motif obligatoire'; END IF; result:=app_modifier_etape_logistique(_etape_id,jsonb_build_object('statut','annule','commentaire_equipe',_p->>'motif')); ELSIF _tool='affecter_role_projet' THEN result:=app_affecter_role_projet(_affaire_id,(_p->>'role')::public.projet_role,(_p->>'employe_id')::uuid,(_p->>'date_debut')::date,(_p->>'date_fin')::date,NULL,COALESCE((_p->>'remplacer_dates')::boolean,false)); ELSIF _tool IN ('devis_creer_brouillon','devis_remplir','devis_modifier_entete','devis_ajouter_photo','devis_nouvelle_version','devis_soumettre','devis_enregistrer_transfert') THEN result:=devis_mcp_appliquer(_tool,_p,_affaire_id); ELSIF _tool='documents_affaire_televerser' THEN result:=mcp_document_affaire_ajouter(_affaire_id,_p); ELSIF _tool='materiaux_proposer' THEN result:=materiau_proposer_mcp(_affaire_id,_p); ELSE RAISE EXCEPTION 'Outil interdit'; END IF; RETURN result || jsonb_build_object('affaire_id',COALESCE(_affaire_id,(result->>'affaire_id')::uuid)); END $function$;

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
      ELSIF k NOT IN ('remise','note','note_mcp_coches') THEN RAISE EXCEPTION 'Champ interdit : %', k; END IF;
    END LOOP;
    IF entete <> '{}'::jsonb THEN PERFORM devis_entete_modifier((etat->>'id')::uuid, entete, false); END IF;
    IF dates <> '{}'::jsonb THEN PERFORM devis_dates_modifier((etat->>'id')::uuid, dates); END IF;
    IF patch ? 'remise' THEN PERFORM devis_remise_modifier((etat->>'id')::uuid, patch->'remise'->>'mode', coalesce((patch->'remise'->>'valeur')::numeric,0)); END IF;
    IF patch ? 'note' THEN
      IF jsonb_typeof(patch->'note') <> 'object' OR (SELECT count(*) FROM jsonb_object_keys(patch->'note') x WHERE x NOT IN ('mode','texte')) > 0 THEN
        RAISE EXCEPTION 'Note : { mode, texte } attendu'; END IF;
      PERFORM devis_texte_modifier((etat->>'id')::uuid, 'note', NULL, patch->'note'->>'texte', patch->'note'->>'mode', NULL);
    END IF;
    IF patch ? 'note_mcp_coches' THEN PERFORM devis_note_mcp_cocher((etat->>'id')::uuid, patch->'note_mcp_coches'); END IF;
    RETURN jsonb_build_object('devis_id',etat->>'id','calcul',devis_calculer((etat->>'id')::uuid));
  ELSIF _tool='devis_ajouter_photo' AND _p ? 'photos' THEN
    IF jsonb_typeof(_p->'photos') <> 'array' OR jsonb_array_length(_p->'photos') NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'De 1 à 20 images par appel'; END IF;
    patch := '[]'::jsonb;
    FOR entete IN SELECT x FROM jsonb_array_elements(_p->'photos') x LOOP
      IF NOT EXISTS (SELECT 1 FROM devis_mcp_ligne_objet((etat->>'id')::uuid, (entete->>'ligne_id')::uuid)) THEN RAISE EXCEPTION 'La photo doit être rattachée à un objet du devis (ligne %)', entete->>'ligne_id'; END IF;
      v_id := devis_photo_ajouter((entete->>'ligne_id')::uuid, jsonb_build_object('storage_path',entete->>'storage_path','mime',entete->>'mime','size_bytes',(entete->>'size_bytes')::int,
               'legende',left(concat_ws(' — ', NULLIF(entete->>'legende',''), 'Source : '||coalesce(NULLIF(entete->>'source',''),'Claude')),500),
               'visible_client',coalesce((entete->>'visible_client')::boolean,false),
               'source_document_id',NULLIF(entete->>'source_document_id','')));
      patch := patch || jsonb_build_array(jsonb_build_object('ligne_id',entete->>'ligne_id','photo_id',v_id));
    END LOOP;
    RETURN jsonb_build_object('devis_id',etat->>'id','photos',patch);
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
