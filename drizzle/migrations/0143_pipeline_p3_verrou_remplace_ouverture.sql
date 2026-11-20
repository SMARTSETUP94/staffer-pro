CREATE OR REPLACE FUNCTION public.guard_devis_staffing_direct_write()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
 IF TG_OP='UPDATE' AND OLD.redige_dans_staffing AND OLD.statut_redaction='remplace' AND NEW IS DISTINCT FROM OLD THEN
  RAISE EXCEPTION 'Devis remplacé : lecture seule, ouvrez la version en cours' USING ERRCODE='42501';
 END IF;
 IF (TG_OP='DELETE' AND OLD.redige_dans_staffing) OR (TG_OP<>'DELETE' AND (NEW.redige_dans_staffing OR (TG_OP='UPDATE' AND OLD.redige_dans_staffing))) THEN
  IF coalesce(current_setting('app.devis_rpc',true),'')<>'on' THEN
   RAISE EXCEPTION 'Devis Staffing : écriture directe interdite, passez par l''éditeur' USING ERRCODE='42501';
  END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $function$;
CREATE OR REPLACE FUNCTION public.devis_assert_ecriture(_devis_id uuid,_brouillon boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
 PERFORM mcp_assert_legacy_oauth_write('devis');
 IF NOT devis_peut_ecrire(_devis_id) THEN RAISE EXCEPTION 'Droits insuffisants sur ce devis' USING ERRCODE='42501'; END IF;
 IF _brouillon THEN PERFORM devis_assert_brouillon(_devis_id); END IF;
 PERFORM set_config('app.devis_rpc','on',true);
END $function$;
CREATE OR REPLACE FUNCTION public.devis_creer_depuis_pipeline(_affaire_id uuid,_modele_id uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_id uuid;
BEGIN
 IF NOT user_can_write_affaire(_affaire_id,'devis.rediger') THEN RAISE EXCEPTION 'Droits insuffisants' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('devis_version:'||_affaire_id::text));
 SELECT devis_id INTO v_id FROM devis_retenu_pipeline(ARRAY[_affaire_id]);
 IF v_id IS NULL THEN
  SELECT id INTO v_id FROM devis WHERE affaire_id=_affaire_id AND redige_dans_staffing AND NOT est_modele AND supprime_le IS NULL ORDER BY version DESC LIMIT 1;
 END IF;
 IF v_id IS NOT NULL THEN RETURN jsonb_build_object('devis_id',v_id,'existant',true); END IF;
 RETURN jsonb_build_object('devis_id',devis_creer(_affaire_id,_modele_id),'existant',false);
END $function$;
CREATE OR REPLACE FUNCTION public.devis_nouvelle_version(_devis_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE s record; v_version int; v_id uuid;
BEGIN
 PERFORM devis_assert_ecriture(_devis_id,false);
 SELECT * INTO s FROM devis WHERE id=_devis_id;
 IF s.est_modele THEN RAISE EXCEPTION 'Un modèle ne se versionne pas'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('devis_version:'||s.affaire_id::text));
 SELECT * INTO s FROM devis WHERE id=_devis_id FOR UPDATE;
 IF s.supprime_le IS NOT NULL THEN RAISE EXCEPTION 'Devis supprimé : restaurez-le avant d''en créer une version'; END IF;
 SELECT coalesce(max(version),0)+1 INTO v_version FROM devis WHERE affaire_id=s.affaire_id AND redige_dans_staffing AND NOT est_modele;
 INSERT INTO devis(affaire_id,numero,libelle,statut,redige_dans_staffing,version,version_precedente_id,statut_redaction,client_id,contact_id,client_final_id,date_devis,validite_jours,tva_pct,coef_materiaux_defaut,modele_origine_id,auteur_id,remise_mode,remise_valeur)
 VALUES(s.affaire_id,regexp_replace(s.numero,'-R\d+$','')||'-R'||v_version,s.libelle,'brouillon',true,v_version,s.id,'brouillon',s.client_id,s.contact_id,s.client_final_id,current_date,s.validite_jours,s.tva_pct,s.coef_materiaux_defaut,s.modele_origine_id,auth.uid(),s.remise_mode,s.remise_valeur) RETURNING id INTO v_id;
 PERFORM devis_copier_sous_arbre(_devis_id,v_id,NULL,NULL,false);
 IF s.statut_redaction NOT IN ('signe','remplace') THEN
  UPDATE devis SET statut_redaction='remplace',updated_at=now() WHERE id=_devis_id;
 END IF;
 RETURN v_id;
END $function$;