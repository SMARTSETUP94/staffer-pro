ALTER TABLE public.devis
  ADD COLUMN date_validite date,
  ADD COLUMN date_validite_manuelle boolean NOT NULL DEFAULT false,
  ADD COLUMN date_envoi date,
  ADD COLUMN heures_be_fige numeric;
ALTER TABLE public.devis_postes_ref ADD COLUMN compte_be boolean NOT NULL DEFAULT false;
UPDATE public.devis_postes_ref SET compte_be = true WHERE code = 'plans_bem';
INSERT INTO public.devis_parametres(cle, valeur, unite, date_effet)
  VALUES ('heures_par_jour_be', 8, 'h/j', current_date);

CREATE OR REPLACE FUNCTION public.devis_set_date_validite() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.redige_dans_staffing AND NOT NEW.est_modele AND NOT NEW.date_validite_manuelle
     AND NEW.statut_redaction IN ('brouillon','a_valider') AND NEW.date_devis IS NOT NULL THEN
    NEW.date_validite := NEW.date_devis + coalesce(NEW.validite_jours,30);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_devis_date_validite BEFORE INSERT OR UPDATE OF date_devis, validite_jours, date_validite_manuelle
  ON public.devis FOR EACH ROW EXECUTE FUNCTION public.devis_set_date_validite();

-- backfill (passe par le garde-fou d'écriture directe)
SELECT set_config('app.devis_rpc','on',true);
UPDATE public.devis SET date_validite = date_devis + coalesce(validite_jours,30)
  WHERE redige_dans_staffing AND NOT est_modele AND date_devis IS NOT NULL;

CREATE OR REPLACE FUNCTION public.devis_entete_modifier(_devis_id uuid, _patch jsonb, _maj_affaire_client boolean DEFAULT false)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE d record;
BEGIN
  PERFORM devis_assert_ecriture(_devis_id);
  IF _patch ? 'contact_id' AND NULLIF(_patch->>'contact_id','') IS NOT NULL AND NOT EXISTS (
     SELECT 1 FROM client_contacts WHERE id=(_patch->>'contact_id')::uuid AND client_id=coalesce(NULLIF(_patch->>'client_id','')::uuid,(SELECT client_id FROM devis WHERE id=_devis_id))) THEN
    RAISE EXCEPTION 'Ce contact n''appartient pas au client facturé'; END IF;
  UPDATE devis SET
    client_id = CASE WHEN _patch ? 'client_id' THEN NULLIF(_patch->>'client_id','')::uuid ELSE client_id END,
    contact_id = CASE WHEN _patch ? 'contact_id' THEN NULLIF(_patch->>'contact_id','')::uuid
                      WHEN _patch ? 'client_id' AND NULLIF(_patch->>'client_id','')::uuid IS DISTINCT FROM client_id THEN NULL ELSE contact_id END,
    client_final_id = CASE WHEN _patch ? 'client_final_id' THEN NULLIF(_patch->>'client_final_id','')::uuid ELSE client_final_id END,
    date_devis = CASE WHEN _patch ? 'date_devis' THEN coalesce(NULLIF(_patch->>'date_devis','')::date,current_date) ELSE date_devis END,
    date_validite = CASE WHEN _patch ? 'date_validite' THEN NULLIF(_patch->>'date_validite','')::date ELSE date_validite END,
    date_validite_manuelle = CASE WHEN _patch ? 'date_validite' THEN NULLIF(_patch->>'date_validite','') IS NOT NULL ELSE date_validite_manuelle END,
    numero_progbat = CASE WHEN _patch ? 'numero_progbat' THEN NULLIF(_patch->>'numero_progbat','') ELSE numero_progbat END,
    libelle = CASE WHEN _patch ? 'libelle' THEN _patch->>'libelle' ELSE libelle END,
    coef_materiaux_defaut = CASE WHEN _patch ? 'coef_materiaux_defaut' THEN (_patch->>'coef_materiaux_defaut')::numeric ELSE coef_materiaux_defaut END,
    validite_jours = CASE WHEN _patch ? 'validite_jours' THEN (_patch->>'validite_jours')::int ELSE validite_jours END,
    modele_nom = CASE WHEN est_modele AND _patch ? 'modele_nom' THEN _patch->>'modele_nom' ELSE modele_nom END,
    modele_categorie = CASE WHEN est_modele AND _patch ? 'modele_categorie' THEN _patch->>'modele_categorie' ELSE modele_categorie END,
    modele_description = CASE WHEN est_modele AND _patch ? 'modele_description' THEN _patch->>'modele_description' ELSE modele_description END,
    updated_at = now()
  WHERE id=_devis_id RETURNING * INTO d;
  IF _maj_affaire_client AND d.affaire_id IS NOT NULL THEN
    UPDATE affaires SET client_id=d.client_id, client_contact_id=d.contact_id, updated_at=now() WHERE id=d.affaire_id;
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.devis_opp_avancer(_affaire_id uuid, _cible opportunite_statut, _texte text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cur text; ok boolean := false;
  ordre text[] := ARRAY['a_faire','a_l_etude','envoye','presque_gagne'];
BEGIN
  IF _cible::text NOT IN ('a_l_etude','envoye') THEN RAISE EXCEPTION 'Statut cible interdit'; END IF;
  SELECT coalesce(statut_opportunite::text,'a_faire') INTO cur FROM affaires WHERE id=_affaire_id AND phase='opportunite' FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF cur = ANY(ordre) AND array_position(ordre,cur) < array_position(ordre,_cible::text) THEN
    UPDATE affaires SET statut_opportunite=_cible, updated_at=now() WHERE id=_affaire_id;
    ok := true;
  END IF;
  IF _texte IS NOT NULL THEN
    INSERT INTO opportunite_actions(affaire_id,type,texte,auteur_id)
    VALUES(_affaire_id, CASE WHEN _cible::text='envoye' THEN 'devis_envoye'::opp_action_type ELSE 'note_interne'::opp_action_type END,
           _texte || CASE WHEN ok THEN ' — statut → '||_cible::text ELSE '' END, auth.uid());
  END IF;
  RETURN ok;
END $$;
REVOKE ALL ON FUNCTION public.devis_opp_avancer(uuid, opportunite_statut, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.devis_creer(_affaire_id uuid, _modele_id uuid DEFAULT NULL::uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE a record; v_version int; v_id uuid;
BEGIN
  PERFORM mcp_assert_legacy_oauth_write('devis_creer');
  IF NOT user_can_write_affaire(_affaire_id,'devis.rediger') THEN RAISE EXCEPTION 'Droits insuffisants' USING ERRCODE='42501'; END IF;
  IF _modele_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM devis WHERE id=_modele_id AND est_modele AND modele_actif) THEN
    RAISE EXCEPTION 'Modèle introuvable ou inactif'; END IF;
  SELECT * INTO a FROM affaires WHERE id=_affaire_id;
  PERFORM pg_advisory_xact_lock(hashtext('devis_version:'||_affaire_id::text));
  SELECT coalesce(max(version),0)+1 INTO v_version FROM devis WHERE affaire_id=_affaire_id AND redige_dans_staffing AND NOT est_modele;
  PERFORM set_config('app.devis_rpc','on',true);
  INSERT INTO devis(affaire_id,numero,libelle,statut,redige_dans_staffing,version,statut_redaction,client_id,contact_id,date_devis,
                    validite_jours,tva_pct,coef_materiaux_defaut,modele_origine_id,auteur_id)
  VALUES(_affaire_id, coalesce(a.numero,a.code_opportunite,'?')||'-R'||v_version, a.nom, 'brouillon', true, v_version, 'brouillon',
         a.client_id, a.client_contact_id, current_date,
         (SELECT valeur FROM v_devis_parametres_courants WHERE cle='validite_jours')::int,
         (SELECT valeur FROM v_devis_parametres_courants WHERE cle='tva_pct'),
         coalesce((SELECT valeur FROM v_devis_parametres_courants WHERE cle='coef_materiaux'),1.45),
         _modele_id, auth.uid())
  RETURNING id INTO v_id;
  IF _modele_id IS NOT NULL THEN PERFORM devis_copier_sous_arbre(_modele_id, v_id, NULL, NULL, true); END IF;
  IF v_version = 1 AND a.phase='opportunite' AND coalesce(a.statut_opportunite::text,'a_faire')='a_faire' THEN
    PERFORM devis_opp_avancer(_affaire_id,'a_l_etude','Premier devis créé ('||coalesce(a.numero,a.code_opportunite,'?')||'-R1)');
  END IF;
  RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION public.devis_statut_changer(_devis_id uuid, _statut devis_redaction_statut)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE d record; v_calc jsonb;
BEGIN
  PERFORM devis_assert_ecriture(_devis_id, false);
  SELECT * INTO d FROM devis WHERE id=_devis_id FOR UPDATE;
  IF d.est_modele THEN RAISE EXCEPTION 'Un modèle n''a pas de statut'; END IF;
  IF _statut='a_valider' AND d.statut_redaction='brouillon' THEN
    UPDATE devis SET statut_redaction='a_valider', updated_at=now() WHERE id=_devis_id;
  ELSIF _statut='brouillon' AND d.statut_redaction='a_valider' THEN
    UPDATE devis SET statut_redaction='brouillon', updated_at=now() WHERE id=_devis_id;
  ELSIF _statut='valide' AND d.statut_redaction IN ('brouillon','a_valider') THEN
    IF NOT devis_peut_valider(_devis_id) THEN RAISE EXCEPTION 'Validation réservée au chargé d''affaires de l''affaire ou à un admin' USING ERRCODE='42501'; END IF;
    v_calc := devis_calculer_interne(_devis_id);
    INSERT INTO devis_snapshot_couts(devis_id, cout_total, marge, fige_le)
      VALUES (_devis_id, (v_calc->>'cout_total')::numeric, v_calc->'marge', now())
      ON CONFLICT (devis_id) DO UPDATE SET cout_total=EXCLUDED.cout_total, marge=EXCLUDED.marge, fige_le=EXCLUDED.fige_le;
    UPDATE devis SET statut_redaction='valide', valide_par=auth.uid(), valide_le=now(), totaux_snapshot=v_calc - 'cout_total' - 'marge',
      montant_ht=(v_calc->>'total_ht')::numeric,
      dates_snapshot=(SELECT jsonb_build_object('date_opportunite',a.created_at::date,'date_devis',d.date_devis,'date_validite',d.date_validite,
         'date_visite_technique',a.date_visite_technique,'date_montage',a.date_montage,'date_evenement_debut',a.date_evenement_debut,
         'date_evenement_fin',a.date_evenement_fin,'date_demontage',a.date_demontage) FROM affaires a WHERE a.id=d.affaire_id),
      updated_at=now()
    WHERE id=_devis_id;
  ELSIF _statut='refuse' AND d.statut_redaction IN ('a_valider','valide','transfere') THEN
    IF auth.jwt()->>'client_id' IS NOT NULL THEN RAISE EXCEPTION 'Refus réservé à l''application' USING ERRCODE='42501'; END IF;
    IF NOT devis_peut_valider(_devis_id) THEN RAISE EXCEPTION 'Droits insuffisants' USING ERRCODE='42501'; END IF;
    UPDATE devis SET statut_redaction='refuse', updated_at=now() WHERE id=_devis_id;
  ELSE
    RAISE EXCEPTION 'Transition non autorisée : % → %', d.statut_redaction, _statut;
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.devis_lire_client(_devis_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE d record; v_calc jsonb; v_dates jsonb;
BEGIN
  IF NOT devis_peut_lire(_devis_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO d FROM devis WHERE id=_devis_id;
  v_calc := coalesce(d.totaux_snapshot, devis_calculer_interne(_devis_id));
  v_dates := coalesce(d.dates_snapshot, (SELECT jsonb_build_object('date_opportunite',a.created_at::date,'date_devis',d.date_devis,'date_validite',d.date_validite,
      'date_visite_technique',a.date_visite_technique,'date_montage',a.date_montage,'date_evenement_debut',a.date_evenement_debut,
      'date_evenement_fin',a.date_evenement_fin,'date_demontage',a.date_demontage) FROM affaires a WHERE a.id=d.affaire_id));
  RETURN jsonb_build_object(
    'numero',d.numero,'libelle',d.libelle,'date_devis',d.date_devis,'validite_jours',d.validite_jours,
    'date_validite',coalesce(v_dates->>'date_validite',d.date_validite::text),
    'client',(SELECT jsonb_build_object('nom',nom,'adresse',adresse,'code_postal',code_postal,'ville',ville,'siret',siret,'tva_intracom',tva_intracom) FROM clients WHERE id=d.client_id),
    'client_final',(SELECT nom FROM clients WHERE id=d.client_final_id),
    'contact',(SELECT jsonb_build_object('nom',coalesce(c.prenom||' ','')||coalesce(c.nom,''),'email',c.email) FROM client_contacts c WHERE c.id=d.contact_id),
    'dates', v_dates,
    'lignes',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'parent_id',l.parent_id,'type',l.type,'ordre',l.ordre,'libelle',l.libelle,
        'quantite',l.quantite,'descriptif_client',l.descriptif_client,'longueur_mm',l.longueur_mm,'largeur_mm',l.largeur_mm,'hauteur_mm',l.hauteur_mm,
        'finition',l.finition,'texte',l.texte,'montant',(v_calc->'lignes'->>l.id::text)::numeric,'sous_total',(v_calc->'racines'->>l.id::text)::numeric) ORDER BY l.ordre),'[]')
      FROM devis_lignes l WHERE l.devis_id=_devis_id AND l.supprime_le IS NULL AND NOT (l.type='commentaire' AND l.interne)),
    'photos',(SELECT coalesce(jsonb_agg(jsonb_build_object('ligne_id',p.ligne_id,'storage_path',p.storage_path,'thumb_path',p.thumb_path,'legende',p.legende,'mime',p.mime) ORDER BY p.ordre),'[]')
      FROM devis_photos p WHERE p.devis_id=_devis_id AND p.deleted_at IS NULL AND p.visible_client),
    'total_ht',v_calc->'total_ht','tva',v_calc->'tva','tva_pct',v_calc->'tva_pct','ttc',v_calc->'ttc','options_ht',v_calc->'options_ht');
END $function$;

CREATE OR REPLACE FUNCTION public.devis_heures_be(_devis_id uuid) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH RECURSIVE t AS (
    SELECT l.id, l.quantite, (l.type='option') opt FROM devis_lignes l
     WHERE l.devis_id=_devis_id AND l.parent_id IS NULL AND l.supprime_le IS NULL
    UNION ALL
    SELECT l.id, l.quantite, t.opt OR l.type='option' FROM devis_lignes l JOIN t ON l.parent_id=t.id WHERE l.supprime_le IS NULL)
  SELECT round(coalesce(sum(h.heures * CASE WHEN h.par_unite THEN t.quantite ELSE 1 END),0),2)
  FROM t JOIN devis_heures h ON h.ligne_id=t.id AND h.supprime_le IS NULL
         JOIN devis_postes_ref p ON p.id=h.poste_id AND p.compte_be
  WHERE NOT t.opt $$;
REVOKE ALL ON FUNCTION public.devis_heures_be(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.devis_marquer_envoye(_devis_id uuid, _date date DEFAULT current_date)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d record; v_ht numeric; v_avance boolean := false;
BEGIN
  IF auth.jwt()->>'client_id' IS NOT NULL THEN RAISE EXCEPTION 'Envoi réservé à l''application' USING ERRCODE='42501'; END IF;
  SELECT * INTO d FROM devis WHERE id=_devis_id AND redige_dans_staffing AND NOT est_modele FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Devis introuvable'; END IF;
  IF NOT devis_peut_valider(_devis_id) THEN RAISE EXCEPTION 'Envoi réservé au chargé d''affaires de l''affaire ou à un admin' USING ERRCODE='42501'; END IF;
  IF d.statut_redaction <> 'valide' THEN RAISE EXCEPTION 'Seul un devis validé peut être envoyé'; END IF;
  IF _date IS NULL OR _date > current_date + 1 THEN RAISE EXCEPTION 'Date d''envoi invalide'; END IF;
  v_ht := coalesce((d.totaux_snapshot->>'total_ht')::numeric, d.montant_ht);
  PERFORM set_config('app.devis_rpc','on',true);
  UPDATE devis SET statut_redaction='transfere', date_envoi=_date, updated_at=now() WHERE id=_devis_id;
  IF EXISTS (SELECT 1 FROM affaires WHERE id=d.affaire_id AND phase='opportunite') THEN
    v_avance := devis_opp_avancer(d.affaire_id,'envoye',
      format('Devis %s (R%s) envoyé le %s — %s € HT', d.numero, d.version, to_char(_date,'DD/MM/YYYY'), to_char(v_ht,'FM999G999G990D00')));
    UPDATE affaires SET ca_estime_ht=v_ht, updated_at=now() WHERE id=d.affaire_id;
    INSERT INTO opportunite_jalons(affaire_id,etape,date_atteinte,ordre) VALUES(d.affaire_id,'devis_envoye',_date,2)
      ON CONFLICT (affaire_id,etape) DO UPDATE SET date_atteinte=EXCLUDED.date_atteinte, updated_at=now();
  END IF;
  RETURN jsonb_build_object('devis_id',_devis_id,'statut_avance',v_avance,'ca_estime_ht',v_ht);
END $$;

CREATE OR REPLACE FUNCTION public.devis_marquer_signe(_devis_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d record; n int;
BEGIN
  IF auth.jwt()->>'client_id' IS NOT NULL THEN RAISE EXCEPTION 'Signature réservée à l''application' USING ERRCODE='42501'; END IF;
  SELECT * INTO d FROM devis WHERE id=_devis_id AND redige_dans_staffing AND NOT est_modele FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Devis introuvable'; END IF;
  IF NOT devis_peut_valider(_devis_id) THEN RAISE EXCEPTION 'Droits insuffisants' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM affaires WHERE id=d.affaire_id AND (statut_opportunite='gagne' OR phase='signe')) THEN
    RAISE EXCEPTION 'L''opportunité doit être gagnée'; END IF;
  IF d.statut_redaction NOT IN ('valide','transfere') THEN RAISE EXCEPTION 'Seul un devis validé ou envoyé peut être signé'; END IF;
  PERFORM set_config('app.devis_rpc','on',true);
  UPDATE devis SET statut_redaction='signe', heures_be_fige=devis_heures_be(_devis_id), updated_at=now() WHERE id=_devis_id;
  UPDATE devis SET statut_redaction='refuse', updated_at=now()
   WHERE affaire_id=d.affaire_id AND id<>_devis_id AND redige_dans_staffing AND NOT est_modele
     AND statut_redaction IN ('brouillon','a_valider','valide','transfere');
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO opportunite_actions(affaire_id,type,texte,auteur_id)
  VALUES(d.affaire_id,'note_interne',format('Devis %s désigné comme signé ; %s autre(s) version(s) refusée(s)', d.numero, n), auth.uid());
  RETURN jsonb_build_object('devis_id',_devis_id,'refuses',n);
END $$;

CREATE OR REPLACE FUNCTION public.devis_on_opportunite_perdue() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  PERFORM set_config('app.devis_rpc','on',true);
  UPDATE devis SET statut_redaction='refuse', updated_at=now()
   WHERE affaire_id=NEW.id AND redige_dans_staffing AND NOT est_modele
     AND statut_redaction IN ('brouillon','a_valider','valide','transfere');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 0 THEN
    INSERT INTO opportunite_actions(affaire_id,type,texte,auteur_id)
    VALUES(NEW.id,'note_interne',format('Opportunité perdue : %s devis refusé(s)', n), auth.uid());
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_devis_opportunite_perdue AFTER UPDATE OF statut_opportunite ON public.affaires
  FOR EACH ROW WHEN (NEW.statut_opportunite='perdu' AND OLD.statut_opportunite IS DISTINCT FROM 'perdu')
  EXECUTE FUNCTION public.devis_on_opportunite_perdue();

CREATE OR REPLACE FUNCTION public.devis_charge_be(_affaire_ids uuid[])
 RETURNS TABLE(affaire_id uuid, devis_id uuid, numero text, version int, heures_be numeric, jours_be numeric, etat text, figee boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, r.id, r.numero, r.version, r.h,
         ceil(r.h / nullif((SELECT valeur FROM v_devis_parametres_courants WHERE cle='heures_par_jour_be'),0) * 2) / 2,
         CASE WHEN a.statut_opportunite='gagne' OR a.phase='signe' THEN 'confirme' ELSE 'previsionnel' END,
         r.figee
  FROM affaires a
  CROSS JOIN LATERAL (
    SELECT d.id, d.numero, d.version, coalesce(d.heures_be_fige, devis_heures_be(d.id)) h, d.heures_be_fige IS NOT NULL figee
    FROM devis d WHERE d.affaire_id=a.id AND d.redige_dans_staffing AND NOT d.est_modele
      AND d.statut_redaction IN ('signe','transfere','valide')
    ORDER BY CASE d.statut_redaction WHEN 'signe' THEN 0 WHEN 'transfere' THEN 1 ELSE 2 END, d.version DESC LIMIT 1) r
  WHERE a.id = ANY(_affaire_ids) AND coalesce(array_length(_affaire_ids,1),0) <= 1000
    AND (a.statut_opportunite IN ('presque_gagne','gagne') OR a.phase='signe')
    AND (current_user_has_capability('planning.pilotage') OR user_has_affaire_access(a.id)) $$;
REVOKE ALL ON FUNCTION public.devis_charge_be(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devis_charge_be(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.devis_poste_compte_be(_id uuid, _compte boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old jsonb;
BEGIN
  IF NOT current_user_has_capability('devis.parametres') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT to_jsonb(p) INTO v_old FROM devis_postes_ref p WHERE id=_id;
  UPDATE devis_postes_ref SET compte_be=coalesce(_compte,false), updated_at=now() WHERE id=_id;
  INSERT INTO devis_taux_historique(objet,ref_id,ancien,nouveau) SELECT 'poste',_id,v_old,to_jsonb(p) FROM devis_postes_ref p WHERE id=_id;
END $$;

CREATE OR REPLACE FUNCTION public.devis_signer_vers_fabrication(_devis_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d record; a record; v_prefix text := ''; v_obj uuid; rec record; v_n int := 0; v_photos jsonb := '[]';
BEGIN
  IF auth.jwt()->>'client_id' IS NOT NULL THEN RAISE EXCEPTION 'Signature réservée à l''application' USING ERRCODE='42501'; END IF;
  SELECT * INTO d FROM devis WHERE id=_devis_id AND redige_dans_staffing AND NOT est_modele FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Devis introuvable'; END IF;
  IF NOT devis_peut_valider(_devis_id) THEN RAISE EXCEPTION 'Signature réservée au chargé d''affaires de l''affaire ou à un admin' USING ERRCODE='42501'; END IF;
  IF d.signe_vers_fabrication_le IS NOT NULL THEN
    RETURN jsonb_build_object('deja_fait', true, 'objets', (SELECT count(*) FROM fabrication_objets WHERE devis_id=_devis_id));
  END IF;
  IF d.statut_redaction NOT IN ('valide','transfere','signe') THEN RAISE EXCEPTION 'Seul un devis validé peut être signé'; END IF;
  SELECT * INTO a FROM affaires WHERE id=d.affaire_id;
  IF a.phase <> 'signe' THEN RAISE EXCEPTION 'Signez d''abord l''opportunité'; END IF;
  PERFORM set_config('app.devis_rpc','on',true);

  DROP TABLE IF EXISTS _objs;
  CREATE TEMP TABLE _objs ON COMMIT DROP AS
  WITH RECURSIVE r AS (
    SELECT l.id, l.parent_id, l.type, row_number() OVER (PARTITION BY l.parent_id ORDER BY l.ordre, l.created_at)::int rn
    FROM devis_lignes l WHERE l.devis_id=_devis_id AND l.supprime_le IS NULL AND l.type<>'commentaire'),
  t AS (
    SELECT r.id, r.type, (r.type='option') est_option, ARRAY[r.rn] chemin FROM r WHERE r.parent_id IS NULL
    UNION ALL
    SELECT r.id, r.type, t.est_option OR r.type='option', t.chemin || r.rn FROM r JOIN t ON r.parent_id=t.id)
  SELECT t.id, array_to_string(t.chemin,'.') AS ref FROM t WHERE t.type='objet' AND NOT t.est_option;

  IF EXISTS (SELECT 1 FROM _objs o JOIN fabrication_objets f ON f.affaire_id=d.affaire_id AND f.reference=o.ref) THEN
    v_prefix := 'D-'||d.numero||'-';
  END IF;

  FOR rec IN SELECT o.ref, l.* FROM _objs o JOIN devis_lignes l ON l.id=o.id ORDER BY o.ref LOOP
    INSERT INTO fabrication_objets(affaire_id,devis_id,reference,nom,quantite,commentaire,ordre,created_by,
      largeur_mm,longueur_mm,hauteur_mm,materiaux,finition_detail,budget_materiaux,
      heures_prevues_be,heures_prevues_numerique,heures_prevues_bois,heures_prevues_metal,heures_prevues_peinture,heures_prevues_tapisserie,heures_prevues_manutention)
    SELECT d.affaire_id,_devis_id,v_prefix||rec.ref,coalesce(NULLIF(rec.libelle,''),'Objet '||rec.ref),greatest(1,ceil(rec.quantite))::int,rec.descriptif_client,v_n,auth.uid(),
      NULLIF(rec.largeur_mm,0)::int,NULLIF(rec.longueur_mm,0)::int,NULLIF(rec.hauteur_mm,0)::int,
      (SELECT string_agg(m.designation||' × '||trim_scale(m.quantite)||coalesce(' '||m.unite,''), E'\n' ORDER BY m.ordre) FROM devis_materiaux m WHERE m.ligne_id=rec.id AND m.supprime_le IS NULL),
      rec.finition,
      round(coalesce((SELECT sum(m.quantite*m.prix_achat) FROM devis_materiaux m WHERE m.ligne_id=rec.id AND m.supprime_le IS NULL),0)*rec.quantite
           +coalesce((SELECT sum(f.quantite*coalesce(f.prix_achat,0)*CASE WHEN f.par_unite THEN rec.quantite ELSE 1 END) FROM devis_lignes_libres f WHERE f.ligne_id=rec.id AND f.supprime_le IS NULL AND f.categorie='achat'),0),2),
      coalesce(h.h8,0),coalesce(h.h4,0),coalesce(h.h1,0),coalesce(h.h2,0),coalesce(h.h3,0),coalesce(h.h5,0),coalesce(h.h7,0)
    FROM (SELECT
        sum(x.hh) FILTER (WHERE x.metier_id=8) h8, sum(x.hh) FILTER (WHERE x.metier_id=4) h4, sum(x.hh) FILTER (WHERE x.metier_id=1) h1,
        sum(x.hh) FILTER (WHERE x.metier_id=2) h2, sum(x.hh) FILTER (WHERE x.metier_id=3) h3, sum(x.hh) FILTER (WHERE x.metier_id=5) h5,
        sum(x.hh) FILTER (WHERE x.metier_id=7) h7
      FROM (SELECT p.metier_id, hr.heures*CASE WHEN hr.par_unite THEN rec.quantite ELSE 1 END hh
            FROM devis_heures hr JOIN devis_postes_ref p ON p.id=hr.poste_id WHERE hr.ligne_id=rec.id AND hr.supprime_le IS NULL) x) h
    RETURNING id INTO v_obj;

    INSERT INTO objet_heures_metier(objet_id,metier_id,heures_prevues,origine,note,created_by)
    SELECT v_obj, p.metier_id, round(sum(hr.heures*CASE WHEN hr.par_unite THEN rec.quantite ELSE 1 END),2), 'devis', 'Devis '||d.numero, auth.uid()
    FROM devis_heures hr JOIN devis_postes_ref p ON p.id=hr.poste_id
    WHERE hr.ligne_id=rec.id AND hr.supprime_le IS NULL AND p.metier_id IS NOT NULL
    GROUP BY p.metier_id
    ON CONFLICT (objet_id, metier_id) DO UPDATE SET heures_prevues=EXCLUDED.heures_prevues;

    v_photos := v_photos || coalesce((SELECT jsonb_agg(jsonb_build_object('objet_id',v_obj,'affaire_id',d.affaire_id,'storage_path',p.storage_path,'legende',p.legende,'mime',p.mime))
       FROM devis_photos p WHERE p.ligne_id=rec.id AND p.deleted_at IS NULL AND p.visible_client AND coalesce(p.mime,'') LIKE 'image/%'),'[]');
    v_n := v_n + 1;
  END LOOP;

  INSERT INTO devis_postes(devis_id,metier_id,heures_prevues,libelle_source,notes)
  SELECT _devis_id, key::int, value::numeric, 'Devis Staffing', 'Généré à la signature'
  FROM jsonb_each_text(d.totaux_snapshot->'heures_metier') WHERE key ~ '^[0-9]+$'
  ON CONFLICT (devis_id, metier_id) DO UPDATE SET heures_prevues=EXCLUDED.heures_prevues;

  UPDATE devis SET statut_redaction='signe', statut='signe', date_signature=coalesce(date_signature,current_date),
    signe_vers_fabrication_le=now(), montant_ht=coalesce((totaux_snapshot->>'total_ht')::numeric,montant_ht),
    heures_be_fige=coalesce(heures_be_fige, devis_heures_be(_devis_id)), updated_at=now()
  WHERE id=_devis_id;

  RETURN jsonb_build_object('deja_fait', false, 'objets', v_n, 'prefixe', NULLIF(v_prefix,''), 'photos', v_photos);
END $$;

CREATE OR REPLACE FUNCTION public.devis_creer_depuis_pipeline(_affaire_id uuid, _modele_id uuid DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT user_can_write_affaire(_affaire_id,'devis.rediger') THEN RAISE EXCEPTION 'Droits insuffisants' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('devis_version:'||_affaire_id::text));
  SELECT id INTO v_id FROM devis WHERE affaire_id=_affaire_id AND redige_dans_staffing AND NOT est_modele ORDER BY version DESC LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN jsonb_build_object('devis_id',v_id,'existant',true); END IF;
  RETURN jsonb_build_object('devis_id',devis_creer(_affaire_id,_modele_id),'existant',false);
END $$;

CREATE OR REPLACE FUNCTION public.devis_derniers_par_affaire(_affaire_ids uuid[])
 RETURNS TABLE(affaire_id uuid, devis_id uuid, version int, statut_redaction devis_redaction_statut)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ON (d.affaire_id) d.affaire_id, d.id, d.version, d.statut_redaction
  FROM devis d WHERE d.affaire_id = ANY(_affaire_ids) AND coalesce(array_length(_affaire_ids,1),0) <= 1000
    AND d.redige_dans_staffing AND NOT d.est_modele
    AND current_user_has_capability('devis.view') AND devis_peut_lire(d.id)
  ORDER BY d.affaire_id, d.version DESC $$;

REVOKE ALL ON FUNCTION public.devis_creer_depuis_pipeline(uuid,uuid), public.devis_derniers_par_affaire(uuid[]),
  public.devis_marquer_envoye(uuid,date), public.devis_marquer_signe(uuid), public.devis_poste_compte_be(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devis_creer_depuis_pipeline(uuid,uuid), public.devis_derniers_par_affaire(uuid[]),
  public.devis_marquer_envoye(uuid,date), public.devis_marquer_signe(uuid), public.devis_poste_compte_be(uuid,boolean) TO authenticated;
NOTIFY pgrst, 'reload schema';