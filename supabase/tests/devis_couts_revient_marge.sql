-- Coûts de revient et marge (lot devis 15). Transaction annulée : le bloc se termine toujours par
-- une exception (« TEST OK » ou le détail de l'échec), donc rien n'est conservé.
-- Couvre : décor 2 exemplaires (total 2 898,60 € inchangé, marge décomposée), coût du coursier copié
-- depuis le paramètre, ligne métallerie → marge partielle + alerte, validation refusée avec un
-- semi-remorque sans prix, chef d'équipe sans aucune donnée de coût.
DO $t$
DECLARE
  v_admin uuid := 'afcb9389-edb4-4ce0-b82c-e302a0aff71a'; v_chef uuid; v_aff uuid; v_d uuid; v_o uuid; v_l uuid; v_d2 uuid; v_o2 uuid;
  c jsonb; v jsonb; v_ok boolean := false; v_msg text; r record; n int;
  p_cons uuid := (SELECT id FROM devis_postes_ref WHERE code='construction');
  p_peint uuid := (SELECT id FROM devis_postes_ref WHERE code='peinture');
  p_bem uuid := (SELECT id FROM devis_postes_ref WHERE code='plans_bem');
  p_met uuid := (SELECT id FROM devis_postes_ref WHERE code='metallerie');
BEGIN
  -- un chef d'équipe (sans droit coûts) et une affaire à laquelle il a accès
  FOR r IN SELECT u.user_id, a.id aff FROM user_roles u CROSS JOIN LATERAL (SELECT id FROM affaires ORDER BY created_at DESC LIMIT 300) a
           WHERE u.role='chef_chantier' AND NOT EXISTS (SELECT 1 FROM user_roles x WHERE x.user_id=u.user_id AND x.role IN ('admin','commercial','bureau_etude','rh'))
  LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub',r.user_id,'role','authenticated')::text, true);
    IF user_has_affaire_access(r.aff) AND current_user_has_capability('devis.view') AND NOT current_user_has_capability('devis.couts') THEN
      v_chef := r.user_id; v_aff := r.aff; EXIT; END IF;
  END LOOP;
  IF v_chef IS NULL THEN RAISE EXCEPTION 'Préparation KO : aucun chef affecté trouvé'; END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_admin,'role','authenticated')::text, true);
  PERFORM set_config('app.devis_rpc','on',true);
  INSERT INTO devis(affaire_id,numero,statut,redige_dans_staffing,version,statut_redaction,tva_pct,date_devis)
    VALUES (v_aff,'TEST-COUTS','brouillon',true,998,'brouillon',20,current_date) RETURNING id INTO v_d;
  INSERT INTO devis_lignes(devis_id,type,ordre,libelle,quantite) VALUES (v_d,'objet',1,'Décor',2) RETURNING id INTO v_o;

  -- 1. Décor : construction 8 h, peinture 300 € au montant (6 h), plans BEM 4 h, MDF 19 CIF 17,39 m², tasseau 30 ml, régul −50
  PERFORM devis_heure_enregistrer(v_o, jsonb_build_object('poste_id',p_cons,'heures',8));
  PERFORM devis_heure_enregistrer(v_o, jsonb_build_object('poste_id',p_peint,'heures',6,'montant_force',300));
  PERFORM devis_heure_enregistrer(v_o, jsonb_build_object('poste_id',p_bem,'heures',4));
  INSERT INTO devis_materiaux(ligne_id,designation,unite,quantite,prix_achat,coefficient,ordre) VALUES
    (v_o,'MDF standard 19 (CIF)','m²',17.39,8.80,1.45,1), (v_o,'Tasseau','ml',30,5.8024,1.45,2);
  PERFORM devis_libre_enregistrer(v_o, jsonb_build_object('categorie','achat','designation','Régularisation','prix_forfait',-50,'par_unite',false));
  c := devis_calculer(v_d);
  IF (c->>'total_ht')::numeric <> 2898.60 THEN RAISE EXCEPTION 'KO décor : total % ≠ 2898,60', c->>'total_ht'; END IF;
  IF (c->'decomposition'->'main_oeuvre'->>'cout')::numeric <> 1272 OR (c->'decomposition'->'main_oeuvre'->>'vente')::numeric <> 2000 THEN
    RAISE EXCEPTION 'KO décor MO : %', c->'decomposition'->'main_oeuvre'; END IF;
  IF (c->'decomposition'->'materiaux'->>'cout')::numeric <> 654.21 OR (c->'decomposition'->'materiaux'->>'vente')::numeric <> 948.60 THEN
    RAISE EXCEPTION 'KO décor matériaux : %', c->'decomposition'->'materiaux'; END IF;
  IF (c->'decomposition'->'autres'->>'vente')::numeric <> -50 THEN RAISE EXCEPTION 'KO décor autres : %', c->'decomposition'->'autres'; END IF;
  IF (c->>'cout_total')::numeric <> 1926.21 OR (c->>'marge')::numeric <> 972.39 OR (c->>'marge_pct')::numeric <> 33.5 OR NOT (c->>'cout_complet')::boolean THEN
    RAISE EXCEPTION 'KO décor marge : coût % marge % (% %%) complet %', c->>'cout_total', c->>'marge', c->>'marge_pct', c->>'cout_complet'; END IF;

  -- 2. Location avec coursier : le coût (50 €/h) est copié dans la ligne et compté
  INSERT INTO devis_lignes(devis_id,type,ordre,libelle,quantite) VALUES (v_d,'objet',2,'Location',1) RETURNING id INTO v_o2;
  v_l := devis_libre_enregistrer(v_o2, jsonb_build_object('forfait_cle','coursier_22m3','designation','Coursier 22 m³','quantite',3));
  IF (SELECT prix_achat FROM devis_lignes_libres WHERE id=v_l) <> 50 THEN RAISE EXCEPTION 'KO coursier : coût non copié'; END IF;
  c := devis_calculer(v_d);
  IF (c->>'cout_total')::numeric <> 1926.21 + 150 OR (c->'decomposition'->'autres'->>'cout')::numeric <> 150 THEN
    RAISE EXCEPTION 'KO coursier : coût % / autres %', c->>'cout_total', c->'decomposition'->'autres'; END IF;

  -- 3. Métallerie sans coût : marge partielle + alerte
  PERFORM devis_heure_enregistrer(v_o2, jsonb_build_object('poste_id',p_met,'heures',4));
  c := devis_calculer(v_d);
  IF (c->>'cout_complet')::boolean OR jsonb_typeof(c->'marge') <> 'number' THEN RAISE EXCEPTION 'KO métallerie : marge non partielle %', c->'marge'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(c->'couts_manquants') x WHERE x->>'libelle' ILIKE 'métallerie%' AND (x->>'heures')::numeric=4) THEN
    RAISE EXCEPTION 'KO métallerie : alerte absente %', c->'couts_manquants'; END IF;
  IF (c->>'cout_total')::numeric <> 2076.21 THEN RAISE EXCEPTION 'KO métallerie : coûts connus % ≠ 2076,21', c->>'cout_total'; END IF;

  -- 4. Chef d'équipe : aucune donnée de coût
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_chef,'role','authenticated')::text, true);
  v := devis_lire(v_d);
  IF (v->'calcul') ?| ARRAY['cout_total','decomposition','couts_manquants','marge_pct','cout_complet'] OR (v->'calcul'->>'marge') IS NOT NULL THEN
    RAISE EXCEPTION 'KO chef : coûts visibles %', v->'calcul'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(v->'parametres') k WHERE k LIKE 'cout\_%') OR v->'couts_figes' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'KO chef : paramètres de coût visibles'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v->'heures') h WHERE h ? 'cout_revient') THEN RAISE EXCEPTION 'KO chef : coût horaire visible'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v->'libres') h WHERE h ? 'prix_achat') THEN RAISE EXCEPTION 'KO chef : achat ligne libre visible'; END IF;
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM devis_parametres WHERE cle LIKE 'cout\_%';
  EXECUTE 'RESET ROLE';
  IF n <> 0 THEN RAISE EXCEPTION 'KO chef : % paramètre(s) de coût lisibles en direct', n; END IF;

  -- 5. Validation refusée avec un semi-remorque sans prix de vente
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_admin,'role','authenticated')::text, true);
  PERFORM devis_libre_enregistrer(v_o2, jsonb_build_object('forfait_cle','semi_remorque','designation','Semi-remorque'));
  BEGIN
    PERFORM devis_statut_changer(v_d, 'valide');
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM ILIKE '%prix de vente à saisir%Semi-remorque%'; v_msg := SQLERRM; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'KO validation : semi-remorque sans prix accepté (%)', v_msg; END IF;

  -- 6. Prix saisi → validation OK et décomposition figée
  UPDATE devis_lignes_libres SET prix_forfait=900 WHERE forfait_cle='semi_remorque' AND ligne_id=v_o2;
  PERFORM devis_statut_changer(v_d, 'valide');
  IF NOT EXISTS (SELECT 1 FROM devis_snapshot_couts WHERE devis_id=v_d AND detail ? 'decomposition' AND (detail->'decomposition'->'materiaux'->>'cout')::numeric=654.21) THEN
    RAISE EXCEPTION 'KO : décomposition non figée'; END IF;
  IF (SELECT totaux_snapshot ?| ARRAY['cout_total','decomposition','marge'] FROM devis WHERE id=v_d) THEN RAISE EXCEPTION 'KO : coûts dans les totaux publics'; END IF;

  RAISE EXCEPTION 'TEST OK : décor 2 898,60 € (coût 1 926,21 €, marge 972,39 € = 33,5 %%), coursier compté, métallerie en marge partielle, semi-remorque sans prix bloqué, chef sans coûts. Message de refus : %', v_msg;
END $t$;
