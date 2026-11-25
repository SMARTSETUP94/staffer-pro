-- PROPOSITION (non appliquée) — Lot « Suivi des devis » 25/11/2026
-- Aucune ligne réelle n'est réécrite. Définitions actuelles : suivi-devis-actuel-*.sql

-- 1) Marquer envoyé avec canal et note (nouvelle surcharge ; l'ancienne à 2 arguments reste inchangée)
CREATE OR REPLACE FUNCTION public.devis_marquer_envoye(_devis_id uuid, _date date, _canal text, _note text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE d record; v_ht numeric; v_avance boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Utilisateur requis' USING ERRCODE='42501'; END IF;
  IF auth.jwt()->>'client_id' IS NOT NULL THEN RAISE EXCEPTION 'Envoi réservé à l''application' USING ERRCODE='42501'; END IF;
  IF _canal IS NULL OR _canal NOT IN ('mail','main_propre','progbat','autre') THEN RAISE EXCEPTION 'Canal d''envoi invalide'; END IF;
  SELECT * INTO d FROM devis WHERE id=_devis_id AND redige_dans_staffing AND NOT est_modele AND supprime_le IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Devis introuvable'; END IF;
  IF NOT devis_peut_valider(_devis_id) THEN RAISE EXCEPTION 'Envoi réservé au chargé d''affaires de l''affaire ou à un admin' USING ERRCODE='42501'; END IF;
  IF d.statut_redaction NOT IN ('valide','transfere') THEN RAISE EXCEPTION 'Finalisez d''abord le devis (contrôles « Avant de valider »), puis marquez-le envoyé'; END IF;
  IF _date IS NULL OR _date > current_date THEN RAISE EXCEPTION 'La date d''envoi ne peut pas être dans le futur'; END IF;
  v_ht := coalesce((d.totaux_snapshot->>'net_ht')::numeric, (d.totaux_snapshot->>'total_ht')::numeric, d.montant_ht);
  PERFORM set_config('app.devis_rpc','on',true);
  UPDATE devis SET statut_redaction='transfere', date_envoi=_date, updated_at=now() WHERE id=_devis_id;
  IF EXISTS (SELECT 1 FROM affaires WHERE id=d.affaire_id AND phase='opportunite') THEN
    v_avance := devis_opp_avancer(d.affaire_id,'envoye',
      format('Devis %s (R%s) envoyé le %s — %s net HT', coalesce(d.numero_progbat||' / ','')||d.numero, d.version, to_char(_date,'DD/MM/YYYY'), devis_eur_fr(v_ht)));
    UPDATE affaires SET ca_estime_ht=v_ht, updated_at=now() WHERE id=d.affaire_id;
    INSERT INTO opportunite_jalons(affaire_id,etape,date_atteinte,ordre) VALUES(d.affaire_id,'devis_envoye',_date,2)
      ON CONFLICT (affaire_id,etape) DO UPDATE SET date_atteinte=EXCLUDED.date_atteinte, updated_at=now();
  END IF;
  INSERT INTO opportunite_actions(affaire_id,type,date,texte,auteur_id)
  VALUES(d.affaire_id,'devis_envoye',_date::timestamptz,
    format('Devis %s (R%s) envoyé — canal : %s%s', d.numero, d.version,
      CASE _canal WHEN 'mail' THEN 'mail' WHEN 'main_propre' THEN 'remis en main propre' WHEN 'progbat' THEN 'ProGBat' ELSE 'autre' END,
      CASE WHEN nullif(trim(_note),'') IS NULL THEN '' ELSE ' — '||left(trim(_note),500) END), auth.uid());
  RETURN jsonb_build_object('devis_id',_devis_id,'statut_avance',v_avance,'ca_estime_ht',v_ht);
END $function$;

-- 2) Signer une version choisie, avec date et gel des heures BE identique à devis_marquer_signe
--    (devis_marquer_signe reste inchangé ; il passe les autres versions en « Refusé »).
CREATE OR REPLACE FUNCTION public.devis_signer_version(_devis_id uuid, _date date, _remplacer_autres boolean DEFAULT true)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE d record; n int := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Utilisateur requis' USING ERRCODE='42501'; END IF;
  IF auth.jwt()->>'client_id' IS NOT NULL THEN RAISE EXCEPTION 'Signature réservée à l''application' USING ERRCODE='42501'; END IF;
  SELECT * INTO d FROM devis WHERE id=_devis_id AND redige_dans_staffing AND NOT est_modele AND supprime_le IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Devis introuvable'; END IF;
  IF NOT devis_peut_valider(_devis_id) THEN RAISE EXCEPTION 'Droits insuffisants' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM affaires WHERE id=d.affaire_id AND (statut_opportunite='gagne' OR phase='signe')) THEN
    RAISE EXCEPTION 'Passez d''abord l''opportunité en « Gagné »'; END IF;
  IF d.statut_redaction NOT IN ('valide','transfere') THEN RAISE EXCEPTION 'Finalisez d''abord cette version (contrôles « Avant de valider »)'; END IF;
  IF _date IS NULL OR _date > current_date THEN RAISE EXCEPTION 'La date de signature ne peut pas être dans le futur'; END IF;
  PERFORM set_config('app.devis_rpc','on',true);
  UPDATE devis SET statut_redaction='signe', date_signature=_date, heures_be_fige=devis_heures_be(_devis_id), updated_at=now() WHERE id=_devis_id;
  IF _remplacer_autres THEN
    UPDATE devis SET statut_redaction='remplace', updated_at=now()
     WHERE affaire_id=d.affaire_id AND id<>_devis_id AND redige_dans_staffing AND NOT est_modele AND supprime_le IS NULL
       AND statut_redaction IN ('brouillon','a_valider','valide','transfere');
    GET DIAGNOSTICS n = ROW_COUNT;
  END IF;
  INSERT INTO opportunite_actions(affaire_id,type,texte,auteur_id)
  VALUES(d.affaire_id,'note_interne',format('Devis %s (R%s) signé le %s ; %s autre(s) version(s) remplacée(s)', d.numero, d.version, to_char(_date,'DD/MM/YYYY'), n), auth.uid());
  RETURN jsonb_build_object('devis_id',_devis_id,'remplaces',n);
END $function$;

-- 3) app_modifier_affaire : seule différence = refus d'« Envoyé » manuel sans devis envoyé
CREATE OR REPLACE FUNCTION public.app_modifier_affaire(_id uuid, _patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$ DECLARE k text; sets text:=''; result jsonb; BEGIN
  IF _patch ? 'statut_opportunite' AND NOT EXISTS(SELECT 1 FROM affaires WHERE id=_id AND phase='opportunite') THEN RAISE EXCEPTION 'Opportunité déjà signée'; END IF;
  PERFORM public.app_assert_affaire_write(_id,'section.affaires');
  IF _patch ? 'statut_opportunite' THEN
    PERFORM public.app_assert_affaire_write(_id,'action.edit_opportunite');
    IF _patch->>'statut_opportunite' NOT IN ('a_faire','envoye','a_l_etude','presque_gagne','gagne','perdu') THEN RAISE EXCEPTION 'Signature interdite'; END IF;
    IF _patch->>'statut_opportunite'='envoye' AND NOT EXISTS (SELECT 1 FROM devis WHERE affaire_id=_id AND redige_dans_staffing AND NOT est_modele AND supprime_le IS NULL AND date_envoi IS NOT NULL AND statut_redaction IN ('transfere','signe')) THEN
      RAISE EXCEPTION 'Aucun devis envoyé : finalisez le devis puis utilisez « Marquer envoyé le… »'; END IF;
  END IF;
  IF _patch ? 'ca_estime_ht' AND (_patch->>'ca_estime_ht')::numeric<0 THEN RAISE EXCEPTION 'Montant invalide'; END IF;
  IF jsonb_typeof(_patch)<>'object' OR _patch='{}'::jsonb THEN RAISE EXCEPTION 'Modification vide'; END IF;
  FOR k IN SELECT jsonb_object_keys(_patch) LOOP
    IF k NOT IN ('nom','notes','lieu','date_montage','date_demontage','date_evenement_debut','date_evenement_fin','date_pat','date_visite_technique','typologie_future','ca_estime_ht','charge_affaires_id','chef_projet_id','dessinateur_id','statut','statut_opportunite','contact_site_nom','contact_site_tel','montage_nb_techniciens','montage_travail_nuit','montage_nb_semi','montage_nb_20m3','montage_nature_prestation','montage_notes','client_id','opportunite_source','client_contact_id','client','taille') THEN RAISE EXCEPTION 'Champ interdit: %',k; END IF;
    sets:=sets || CASE WHEN sets='' THEN '' ELSE ',' END || format('%I=p.%I',k,k);
  END LOOP;
  EXECUTE format('UPDATE public.affaires t SET %s FROM jsonb_populate_record(NULL::public.affaires,$1) p WHERE t.id=$2 RETURNING jsonb_build_object(''id'',t.id)',sets) INTO result USING _patch,_id;
  IF result IS NULL THEN RAISE EXCEPTION 'Modification refusée par les droits'; END IF;
  RETURN result; END $function$;

-- 4) Numéro ProGBat définitif : aucune nouvelle fonction, l'écran réutilise devis_enregistrer_transfert (règle existante S… puis D-…).

-- 5) Lecteur des écarts, sous les droits de l'utilisateur (SECURITY INVOKER, aucun coût)
CREATE OR REPLACE FUNCTION public.suivi_ecarts_lire()
 RETURNS TABLE(affaire_id uuid, numero text, nom text, client text, devis_id uuid, devis_numero text, montant_ht numeric, ecart text)
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $function$
  WITH d AS (
    SELECT DISTINCT ON (affaire_id) * FROM devis
    WHERE affaire_id IS NOT NULL AND supprime_le IS NULL AND redige_dans_staffing AND NOT est_modele
    ORDER BY affaire_id, version DESC NULLS LAST, created_at DESC)
  SELECT a.id, a.numero, a.nom, a.client, d.id, d.numero,
         coalesce((d.totaux_snapshot->>'net_ht')::numeric, d.montant_ht),
         x.ecart
  FROM d JOIN affaires a ON a.id=d.affaire_id
  CROSS JOIN LATERAL (VALUES
    (CASE WHEN a.phase='signe' AND NOT EXISTS (SELECT 1 FROM devis s WHERE s.affaire_id=a.id AND s.statut_redaction='signe' AND s.supprime_le IS NULL) THEN 'signe_sans_devis_signe' END),
    (CASE WHEN a.phase='opportunite' AND a.statut_opportunite='envoye' AND d.date_envoi IS NULL THEN 'envoye_sans_date' END),
    (CASE WHEN a.phase='opportunite' AND a.statut_opportunite='gagne' THEN 'gagne_non_signe' END),
    (CASE WHEN a.phase='opportunite' AND a.statut_opportunite NOT IN ('perdu','gagne') AND d.statut_redaction='refuse' THEN 'refuse_opportunite_ouverte' END),
    (CASE WHEN (d.numero_progbat LIKE 'S%' OR d.numero_progbat_provisoire IS NOT NULL) AND coalesce(d.transfere_progbat_le, d.updated_at) < now()-interval '7 days' THEN 'progbat_provisoire' END)
  ) x(ecart)
  WHERE x.ecart IS NOT NULL
$function$;

-- 6) Ancienne colonne : ni suppression ni masquage dans ce lot
COMMENT ON COLUMN public.devis.statut IS 'DEPRECATED pour les devis Staffing : utiliser statut_redaction. Encore lue par les imports ProGBat et les vues de consommation.';

-- Droits
REVOKE EXECUTE ON FUNCTION public.devis_marquer_envoye(uuid,date,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.devis_signer_version(uuid,date,boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.suivi_ecarts_lire() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devis_marquer_envoye(uuid,date,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.devis_signer_version(uuid,date,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.suivi_ecarts_lire() TO authenticated;
