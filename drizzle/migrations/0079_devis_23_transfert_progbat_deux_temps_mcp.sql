-- Lot 3b : transfert ProGBat en deux temps (import brouillon S…, puis numéro définitif D-…) et outil MCP devis_enregistrer_transfert (conversation uniquement).
ALTER TABLE public.devis
  ADD COLUMN IF NOT EXISTS numero_progbat_provisoire text,
  ADD COLUMN IF NOT EXISTS progbat_finalise_le timestamptz,
  ADD COLUMN IF NOT EXISTS progbat_finalise_par uuid;
ALTER TABLE public.devis DROP CONSTRAINT IF EXISTS devis_numero_progbat_format;
ALTER TABLE public.devis ADD CONSTRAINT devis_numero_progbat_format CHECK (numero_progbat IS NULL OR numero_progbat ~ '^(S\d{6}|D-\d{6}-\d{4})$') NOT VALID;

CREATE OR REPLACE FUNCTION public.devis_enregistrer_transfert(_devis_id uuid, _numero text, _total_progbat numeric, _motif text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE d record; v_net numeric; v_ecart numeric; v_num text := upper(trim(coalesce(_numero,''))); v_def boolean; v_etape text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  PERFORM mcp_assert_legacy_oauth_write('devis_enregistrer_transfert');
  SELECT * INTO d FROM devis WHERE id=_devis_id AND redige_dans_staffing AND NOT est_modele AND supprime_le IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Devis introuvable'; END IF;
  IF NOT devis_peut_valider(_devis_id) THEN RAISE EXCEPTION 'Transfert réservé au chargé d''affaires de l''affaire ou à un admin' USING ERRCODE='42501'; END IF;
  v_def := v_num ~ '^D-\d{6}-\d{4}$';
  IF NOT v_def AND v_num !~ '^S\d{6}$' THEN
    RAISE EXCEPTION 'Numéro ProGBat invalide : S + 6 chiffres (brouillon ProGBat) ou D-AAAAMM-NNNN (devis finalisé)'; END IF;
  IF d.statut_redaction='valide' THEN v_etape := CASE WHEN v_def THEN 'definitif' ELSE 'import' END;
  ELSIF d.statut_redaction='transfere' AND d.numero_progbat ~ '^S\d{6}$' THEN
    IF NOT v_def THEN RAISE EXCEPTION 'Import déjà enregistré (%) : saisir le numéro définitif D-AAAAMM-NNNN attribué à la finalisation', d.numero_progbat; END IF;
    v_etape := 'finalisation';
  ELSIF d.statut_redaction='transfere' AND d.numero_progbat IS NOT NULL THEN RAISE EXCEPTION 'Transfert déjà enregistré (%)', d.numero_progbat;
  ELSE RAISE EXCEPTION 'Seul un devis validé peut être transféré dans ProGBat'; END IF;
  IF EXISTS (SELECT 1 FROM devis WHERE numero_progbat=v_num AND id<>_devis_id AND redige_dans_staffing AND supprime_le IS NULL) THEN
    RAISE EXCEPTION 'Ce numéro ProGBat est déjà attribué à un autre devis'; END IF;
  IF _total_progbat IS NULL OR _total_progbat < 0 THEN RAISE EXCEPTION 'Total HT ProGBat obligatoire'; END IF;
  v_net := coalesce((d.totaux_snapshot->>'net_ht')::numeric, (devis_calculer_interne(_devis_id)->>'net_ht')::numeric);
  v_ecart := round(_total_progbat,2) - round(v_net,2);
  IF v_ecart <> 0 AND nullif(trim(coalesce(_motif,'')),'') IS NULL THEN
    RAISE EXCEPTION 'Écart de % € entre ProGBat et Staffing : motif obligatoire', replace(to_char(v_ecart,'FM999999990.00'),'.',','); END IF;
  PERFORM set_config('app.devis_rpc','on',true);
  UPDATE devis SET statut_redaction='transfere', numero_progbat=v_num,
         numero_progbat_provisoire=CASE v_etape WHEN 'import' THEN v_num WHEN 'finalisation' THEN d.numero_progbat ELSE numero_progbat_provisoire END,
         total_progbat=round(_total_progbat,2), ecart_progbat_motif=CASE WHEN v_ecart<>0 THEN trim(_motif) END,
         transfere_progbat_le=CASE WHEN v_etape='finalisation' THEN transfere_progbat_le ELSE now() END,
         transfere_progbat_par=CASE WHEN v_etape='finalisation' THEN transfere_progbat_par ELSE auth.uid() END,
         progbat_finalise_le=CASE WHEN v_def THEN now() END, progbat_finalise_par=CASE WHEN v_def THEN auth.uid() END,
         updated_at=now()
   WHERE id=_devis_id;
  RETURN jsonb_build_object('devis_id',_devis_id,'etape',v_etape,'numero_progbat',v_num,'definitif',v_def,'net_ht_staffing',round(v_net,2),'total_progbat',round(_total_progbat,2),'ecart',v_ecart);
END $function$;
REVOKE EXECUTE ON FUNCTION public.devis_enregistrer_transfert(uuid,text,numeric,text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.devis_enregistrer_transfert(uuid,text,numeric,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mcp_assert_write(_tool text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE c text:=auth.jwt()->>'client_id'; cap text; BEGIN IF auth.uid() IS NULL OR c IS NULL OR NOT user_has_cap('api.mcp') OR NOT user_has_cap('api.mcp.write') OR NOT is_feature_flag_enabled('mcp_v1') OR NOT is_feature_flag_enabled('mcp_v2_write') OR NOT EXISTS(SELECT 1 FROM mcp_connections WHERE user_id=auth.uid() AND client_id=c AND revoked_at IS NULL) THEN RAISE EXCEPTION 'Écriture MCP refusée'; END IF; cap:=CASE WHEN _tool='creer_opportunite' THEN 'action.create_opportunite' WHEN _tool IN ('ajouter_action_opportunite','mettre_a_jour_opportunite','traiter_demande') THEN 'action.edit_opportunite' WHEN _tool IN ('modifier_chantier','ajouter_note_chantier') THEN 'section.affaires' WHEN _tool IN ('creer_etape_logistique','modifier_etape_logistique','deplacer_etape_logistique','annuler_etape_logistique') THEN 'logistique.etape.edit' WHEN _tool='affecter_role_projet' THEN 'affaires.edit' WHEN _tool IN ('devis_creer_brouillon','devis_remplir','devis_modifier_entete','devis_ajouter_photo','devis_nouvelle_version','devis_soumettre','devis_enregistrer_transfert') THEN 'devis.rediger' END; IF cap='devis.rediger' AND NOT is_feature_flag_enabled('devis_staffing_v1') THEN RAISE EXCEPTION 'Module devis non activé'; END IF; IF cap IS NULL OR NOT user_has_cap(cap) THEN RAISE EXCEPTION 'Outil ou droit métier refusé'; END IF; RETURN cap; END $function$;

CREATE OR REPLACE FUNCTION public.mcp_dispatch_write(_tool text, _p jsonb, _affaire_id uuid, _etape_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE result jsonb; k text; patch jsonb; allowed text[]; a public.affaires; BEGIN PERFORM mcp_assert_write(_tool); IF _tool IN ('ajouter_action_opportunite','mettre_a_jour_opportunite') THEN SELECT * INTO a FROM affaires WHERE id=_affaire_id AND phase='opportunite' AND archived_at IS NULL; IF NOT FOUND THEN RAISE EXCEPTION 'Opportunité non signée requise'; END IF; END IF; IF _tool='creer_opportunite' THEN result:=app_creer_opportunite_client(_p-'email_ids'); IF jsonb_array_length(COALESCE(_p->'email_ids','[]'::jsonb))>0 THEN result:=result || jsonb_build_object('demandes',app_traiter_demande(ARRAY(SELECT jsonb_array_elements_text(_p->'email_ids')::uuid),'rattacher',(result->>'affaire_id')::uuid,NULL,false)); END IF; ELSIF _tool='traiter_demande' THEN result:=app_traiter_demande(ARRAY(SELECT jsonb_array_elements_text(_p->'email_ids_resolus')::uuid),_p->>'action',NULLIF(_p->>'opportunite_id','')::uuid,NULLIF(trim(_p->>'motif'),''),false); ELSIF _tool='ajouter_action_opportunite' THEN result:=app_ajouter_action_opportunite(_affaire_id,(_p->>'type')::public.opp_action_type,_p->>'note',(_p->>'echeance')::date); ELSIF _tool='ajouter_note_chantier' THEN result:=app_ajouter_note_chantier(_affaire_id,_p->>'texte'); ELSIF _tool IN ('modifier_chantier','mettre_a_jour_opportunite') THEN patch:=_p->'patch'; allowed:=CASE WHEN _tool='modifier_chantier' THEN ARRAY['date_montage','date_demontage','lieu','contact_site_nom','contact_site_tel','chef_projet_id','charge_affaires_id','dessinateur_id','statut','montage_nb_techniciens','montage_travail_nuit','montage_nb_semi','montage_nb_20m3','montage_nature_prestation','montage_notes','notes'] ELSE ARRAY['nom','notes','lieu','date_montage','date_demontage','date_evenement_debut','date_evenement_fin','date_pat','date_visite_technique','typologie_future','ca_estime_ht','charge_affaires_id','statut_opportunite'] END; FOR k IN SELECT jsonb_object_keys(patch) LOOP IF NOT k=ANY(allowed) THEN RAISE EXCEPTION 'Champ interdit'; END IF; END LOOP; IF _tool='mettre_a_jour_opportunite' AND patch ? 'statut_opportunite' AND patch->>'statut_opportunite' NOT IN ('a_faire','envoye','a_l_etude','presque_gagne') THEN RAISE EXCEPTION 'Statut gagné/perdu réservé à l''application'; END IF; IF patch<>'{}'::jsonb THEN result:=app_modifier_affaire(_affaire_id,patch); ELSE result:=jsonb_build_object('id',_affaire_id); END IF; IF _tool='mettre_a_jour_opportunite' THEN IF _p->>'prochaine_action' IS NOT NULL THEN PERFORM app_ajouter_action_opportunite(_affaire_id,'note_interne',_p->>'prochaine_action',(_p->>'echeance')::date); END IF; IF _p->>'motif' IS NOT NULL THEN PERFORM app_ajouter_action_opportunite(_affaire_id,'note_interne',_p->>'motif',NULL); END IF; IF _p->>'jalon' IS NOT NULL THEN IF _p->>'jalon' NOT IN ('qualification','devis_envoye','negociation') THEN RAISE EXCEPTION 'Jalon signature interdit'; END IF; UPDATE opportunite_jalons SET date_prevue=(_p->>'echeance')::date WHERE affaire_id=_affaire_id AND etape::text=_p->>'jalon'; IF NOT FOUND THEN RAISE EXCEPTION 'Jalon absent: initialiser dans l’UI'; END IF; END IF; END IF; ELSIF _tool='creer_etape_logistique' THEN result:=app_creer_etape_logistique(_p-'cle_externe'); ELSIF _tool='modifier_etape_logistique' THEN patch:=_p->'patch'; IF patch ? 'statut' AND patch->>'statut' NOT IN ('propose','valide','fait') THEN RAISE EXCEPTION 'Annulation nécessite motif'; END IF; result:=app_modifier_etape_logistique(_etape_id,patch); ELSIF _tool='deplacer_etape_logistique' THEN result:=deplacer_etape_logistique(_etape_id,(_p->>'nouveau_debut')::date,(_p->>'nouvelle_fin')::date); ELSIF _tool='annuler_etape_logistique' THEN IF length(trim(_p->>'motif')) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Motif obligatoire'; END IF; result:=app_modifier_etape_logistique(_etape_id,jsonb_build_object('statut','annule','commentaire_equipe',_p->>'motif')); ELSIF _tool='affecter_role_projet' THEN result:=app_affecter_role_projet(_affaire_id,(_p->>'role')::public.projet_role,(_p->>'employe_id')::uuid,(_p->>'date_debut')::date,(_p->>'date_fin')::date,NULL,COALESCE((_p->>'remplacer_dates')::boolean,false)); ELSIF _tool IN ('devis_creer_brouillon','devis_remplir','devis_modifier_entete','devis_ajouter_photo','devis_nouvelle_version','devis_soumettre','devis_enregistrer_transfert') THEN result:=devis_mcp_appliquer(_tool,_p,_affaire_id); ELSE RAISE EXCEPTION 'Outil interdit'; END IF; RETURN result || jsonb_build_object('affaire_id',COALESCE(_affaire_id,(result->>'affaire_id')::uuid)); END $function$;

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
             'visible_client',coalesce((_p->>'visible_client')::boolean,false)));
    RETURN jsonb_build_object('devis_id',etat->>'id','photo_id',v_id);
  ELSIF _tool='devis_soumettre' THEN
    RETURN devis_soumettre((etat->>'id')::uuid, _p->>'note');
  END IF;
  RAISE EXCEPTION 'Outil devis interdit';
END $function$;

CREATE OR REPLACE FUNCTION public.mcp_execute_write_locked(_confirmation_id uuid, _tool text, _arguments_hash text, _payload jsonb, _diff jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE c public.mcp_write_confirmations; cap text; output jsonb; kh text; a public.affaires; current_snapshot text; existing public.mcp_write_external_keys;
BEGIN BEGIN
cap:=mcp_assert_write(_tool);
IF user_cap_scope(cap) IS DISTINCT FROM 'all' THEN RAISE EXCEPTION 'Périmètre global requis pour les écritures MCP'; END IF;
SELECT * INTO c FROM mcp_write_confirmations WHERE id=_confirmation_id AND user_id=auth.uid() AND client_id=auth.jwt()->>'client_id' FOR UPDATE;
IF NOT FOUND OR c.tool<>_tool OR c.arguments_hash<>_arguments_hash OR c.payload_hash<>encode(extensions.digest(_payload::text,'sha256'),'hex') THEN RAISE EXCEPTION 'Confirmation invalide ou arguments modifiés'; END IF;
IF _tool='creer_opportunite' THEN IF c.affaire_id IS NOT NULL OR c.etape_id IS NOT NULL THEN RAISE EXCEPTION 'Cible création incohérente'; END IF;
ELSIF _tool='traiter_demande' THEN
IF c.etape_id IS NOT NULL OR c.snapshot IS NULL OR jsonb_array_length(COALESCE(_payload->'email_ids_resolus','[]'::jsonb))=0 THEN RAISE EXCEPTION 'Cible et état initial obligatoires'; END IF;
IF _payload->>'action'='rattacher' THEN
IF c.affaire_id IS NULL OR c.affaire_id IS DISTINCT FROM NULLIF(_payload->>'opportunite_id','')::uuid THEN RAISE EXCEPTION 'Opportunité cible incohérente'; END IF;
SELECT * INTO a FROM affaires WHERE id=c.affaire_id AND archived_at IS NULL FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Accès affaire refusé'; END IF;
ELSIF c.affaire_id IS NOT NULL THEN RAISE EXCEPTION 'Cible écart incohérente'; END IF;
current_snapshot:=mcp_demandes_empreinte(ARRAY(SELECT jsonb_array_elements_text(_payload->'email_ids_resolus')::uuid),true);
ELSE
IF c.affaire_id IS NULL OR c.snapshot IS NULL THEN RAISE EXCEPTION 'Cible et état initial obligatoires'; END IF;
SELECT * INTO a FROM affaires WHERE id=c.affaire_id AND archived_at IS NULL FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Accès affaire refusé'; END IF;
IF _tool='creer_etape_logistique' AND (_payload->>'affaire_id')::uuid IS DISTINCT FROM c.affaire_id THEN RAISE EXCEPTION 'Chantier de création incohérent'; END IF;
IF _tool IN ('devis_remplir','devis_modifier_entete','devis_ajouter_photo','devis_nouvelle_version','devis_soumettre','devis_enregistrer_transfert') THEN
IF c.etape_id IS NOT NULL THEN RAISE EXCEPTION 'Étape inattendue'; END IF;
SELECT updated_at::text INTO current_snapshot FROM devis WHERE id=NULLIF(_payload->>'devis_id','')::uuid AND affaire_id=c.affaire_id AND supprime_le IS NULL FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Devis et affaire incohérents'; END IF;
ELSIF _tool IN ('modifier_etape_logistique','deplacer_etape_logistique','annuler_etape_logistique') THEN
IF c.etape_id IS NULL THEN RAISE EXCEPTION 'Étape obligatoire'; END IF;
SELECT updated_at::text INTO current_snapshot FROM affaire_etapes_logistiques WHERE id=c.etape_id AND affaire_id=c.affaire_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Étape et chantier incohérents'; END IF;
ELSE IF c.etape_id IS NOT NULL THEN RAISE EXCEPTION 'Étape inattendue'; END IF; current_snapshot:=a.updated_at::text; END IF;
END IF;
IF c.executed_at IS NOT NULL THEN RETURN c.result || jsonb_build_object('idempotent',true); END IF;
IF c.expires_at<=now() THEN RAISE EXCEPTION 'Confirmation expirée'; END IF;
IF c.snapshot IS NOT NULL AND (CASE WHEN _tool='traiter_demande' THEN c.snapshot IS DISTINCT FROM current_snapshot ELSE c.snapshot::timestamptz IS DISTINCT FROM current_snapshot::timestamptz END) THEN RAISE EXCEPTION 'Données changées: demander un nouvel aperçu'; END IF;
IF _payload->>'cle_externe' IS NOT NULL THEN
kh:=encode(extensions.digest(auth.uid()::text||':'||(auth.jwt()->>'client_id')||':'||(_payload->>'cle_externe'),'sha256'),'hex');
PERFORM pg_advisory_xact_lock(hashtextextended(_tool||kh,0));
SELECT * INTO existing FROM mcp_write_external_keys WHERE tool=_tool AND key_hash=kh;
IF FOUND THEN IF existing.request_hash IS DISTINCT FROM _arguments_hash OR (_tool<>'creer_opportunite' AND existing.affaire_id IS DISTINCT FROM c.affaire_id) THEN RAISE EXCEPTION 'Clé externe déjà utilisée avec un contenu différent'; END IF; output:=existing.result||jsonb_build_object('doublon_cle_externe',true); END IF;
END IF;
IF output IS NULL THEN
  INSERT INTO public.mcp_write_dispatch_context(txid,tool,user_id,client_id) VALUES(txid_current(),_tool,auth.uid(),auth.jwt()->>'client_id');
  output:=mcp_dispatch_write(_tool,_payload,c.affaire_id,c.etape_id);
  DELETE FROM public.mcp_write_dispatch_context WHERE txid=txid_current();
END IF;
IF kh IS NOT NULL THEN INSERT INTO mcp_write_external_keys(tool,key_hash,affaire_id,etape_id,result,request_hash) VALUES(_tool,kh,(output->>'affaire_id')::uuid,CASE WHEN _tool='creer_etape_logistique' THEN (output->>'id')::uuid END,output,_arguments_hash) ON CONFLICT DO NOTHING; END IF;
UPDATE mcp_write_confirmations SET executed_at=now(),result=output WHERE id=c.id;
INSERT INTO mcp_audit_log(user_id,client_id,tool,statut,confirmation_id,affaire_id,etape_id,diff,nb_lignes) VALUES(auth.uid(),auth.jwt()->>'client_id',_tool,'executed',c.id,COALESCE(c.affaire_id,(output->>'affaire_id')::uuid),COALESCE(c.etape_id,CASE WHEN _tool='creer_etape_logistique' THEN (output->>'id')::uuid END),COALESCE(mcp_safe_diff(_diff),'{}'::jsonb)||CASE WHEN _tool='traiter_demande' THEN jsonb_build_object('action',_payload->>'action','email_ids',_payload->'email_ids_resolus') ELSE '{}'::jsonb END,CASE WHEN _tool='traiter_demande' THEN jsonb_array_length(_payload->'email_ids_resolus') ELSE 1 END);
IF _tool LIKE 'devis\_%' THEN INSERT INTO devis_mcp_journal(devis_id,affaire_id,outil,mode,arguments,apercu,resultat,statut,auteur,client_id) VALUES(COALESCE(NULLIF(output->>'devis_id','')::uuid,NULLIF(_payload->>'devis_id','')::uuid),COALESCE(c.affaire_id,(output->>'affaire_id')::uuid),_tool,_payload->>'mode',_payload,COALESCE(_diff,'{}'::jsonb),output,'execute',auth.uid(),auth.jwt()->>'client_id'); END IF;
RETURN output||jsonb_build_object('statut','executed');
EXCEPTION WHEN OTHERS THEN IF _tool LIKE 'devis\_%' THEN INSERT INTO devis_mcp_journal(devis_id,affaire_id,outil,mode,arguments,apercu,resultat,statut,auteur,client_id) VALUES(NULLIF(_payload->>'devis_id','')::uuid,c.affaire_id,_tool,_payload->>'mode',_payload,COALESCE(_diff,'{}'::jsonb),jsonb_build_object('error',SQLERRM),'refuse',auth.uid(),auth.jwt()->>'client_id'); END IF; INSERT INTO mcp_audit_log(user_id,client_id,tool,statut,confirmation_id,affaire_id,etape_id) VALUES(auth.uid(),auth.jwt()->>'client_id',_tool,'refused',_confirmation_id,c.affaire_id,c.etape_id); RETURN jsonb_build_object('error',SQLERRM,'statut','refused'); END; END $function$;

CREATE OR REPLACE FUNCTION public.devis_mcp_simuler(_tool text, _payload jsonb, _affaire_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE cap text; a public.affaires; v_devis uuid := NULLIF(_payload->>'devis_id','')::uuid; v_after uuid; avant jsonb; apres jsonb; res jsonb;
        snap text; c_av jsonb; c_ap jsonb; ecarts jsonb; msg text; det text;
BEGIN
  IF _tool NOT IN ('devis_creer_brouillon','devis_remplir','devis_modifier_entete','devis_ajouter_photo','devis_nouvelle_version','devis_soumettre','devis_enregistrer_transfert') THEN RAISE EXCEPTION 'Outil devis interdit'; END IF;
  cap := mcp_assert_write(_tool);
  SELECT * INTO a FROM affaires WHERE id=_affaire_id AND archived_at IS NULL;
  IF NOT FOUND OR NOT (user_cap_scope(cap)='all' OR user_has_affaire_access(_affaire_id)) THEN RAISE EXCEPTION 'Accès affaire refusé'; END IF;
  IF v_devis IS NOT NULL THEN
    SELECT updated_at::text INTO snap FROM devis WHERE id=v_devis AND affaire_id=_affaire_id AND supprime_le IS NULL;
    IF NOT FOUND OR NOT devis_peut_lire(v_devis) THEN RAISE EXCEPTION 'Devis et affaire incohérents'; END IF;
    avant := devis_calculer(v_devis);
    SELECT jsonb_build_object('lignes',(SELECT count(*) FROM devis_lignes WHERE devis_id=v_devis AND supprime_le IS NULL),
      'heures',(SELECT count(*) FROM devis_heures h JOIN devis_lignes l ON l.id=h.ligne_id WHERE l.devis_id=v_devis AND l.supprime_le IS NULL AND h.supprime_le IS NULL),
      'materiaux',(SELECT count(*) FROM devis_materiaux m JOIN devis_lignes l ON l.id=m.ligne_id WHERE l.devis_id=v_devis AND l.supprime_le IS NULL AND m.supprime_le IS NULL),
      'libres',(SELECT count(*) FROM devis_lignes_libres f JOIN devis_lignes l ON l.id=f.ligne_id WHERE l.devis_id=v_devis AND l.supprime_le IS NULL AND f.supprime_le IS NULL),
      'photos',(SELECT count(*) FROM devis_photos WHERE devis_id=v_devis AND deleted_at IS NULL)) INTO c_av;
  ELSE
    snap := a.updated_at::text;
  END IF;
  BEGIN
    INSERT INTO mcp_write_dispatch_context(txid,tool,user_id,client_id) VALUES(txid_current(),_tool,auth.uid(),auth.jwt()->>'client_id');
    res := mcp_dispatch_write(_tool,_payload,_affaire_id,NULL);
    v_after := coalesce(NULLIF(res->>'devis_id','')::uuid, v_devis);
    apres := devis_calculer(v_after);
    SELECT jsonb_build_object('lignes',(SELECT count(*) FROM devis_lignes WHERE devis_id=v_after AND supprime_le IS NULL),
      'heures',(SELECT count(*) FROM devis_heures h JOIN devis_lignes l ON l.id=h.ligne_id WHERE l.devis_id=v_after AND l.supprime_le IS NULL AND h.supprime_le IS NULL),
      'materiaux',(SELECT count(*) FROM devis_materiaux m JOIN devis_lignes l ON l.id=m.ligne_id WHERE l.devis_id=v_after AND l.supprime_le IS NULL AND m.supprime_le IS NULL),
      'libres',(SELECT count(*) FROM devis_lignes_libres f JOIN devis_lignes l ON l.id=f.ligne_id WHERE l.devis_id=v_after AND l.supprime_le IS NULL AND f.supprime_le IS NULL),
      'photos',(SELECT count(*) FROM devis_photos WHERE devis_id=v_after AND deleted_at IS NULL)) INTO c_ap;
    SELECT coalesce(jsonb_agg(jsonb_build_object('objet',l.libelle,'poste',p.code,'niveau',h.niveau,'taux_saisi',h.taux_vente,'taux_grille',h.taux_grille,'montant_force',h.montant_force)),'[]'::jsonb)
      INTO ecarts FROM devis_heures h JOIN devis_lignes l ON l.id=h.ligne_id JOIN devis_postes_ref p ON p.id=h.poste_id
     WHERE l.devis_id=v_after AND l.supprime_le IS NULL AND h.supprime_le IS NULL AND (h.taux_vente IS DISTINCT FROM h.taux_grille OR h.montant_force IS NOT NULL);
    RAISE EXCEPTION 'DEVIS_MCP_SIMULATION' USING DETAIL = jsonb_build_object('resultat',res-'calcul','apres',apres,'compte_apres',c_ap,'ecarts_taux',ecarts)::text;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT, det = PG_EXCEPTION_DETAIL;
    IF msg <> 'DEVIS_MCP_SIMULATION' THEN RETURN jsonb_build_object('error', msg); END IF;
  END;
  RETURN jsonb_build_object('snapshot',snap,'avant',avant,'compte_avant',c_av) || det::jsonb;
END $function$;