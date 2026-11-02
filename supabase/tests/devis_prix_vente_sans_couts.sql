-- Rédacteur bureau d'étude (sans devis.couts) : voit le prix de vente des matériaux et lignes libres,
-- jamais le prix d'achat ni le coefficient. Transaction annulée : le bloc se termine toujours par une
-- exception (« TEST OK » ou le détail de l'échec), donc rien n'est conservé.
DO $t$
DECLARE v_admin uuid := 'afcb9389-edb4-4ce0-b82c-e302a0aff71a'; v_be uuid; v_aff uuid; v_d uuid; v_o uuid; v jsonb; m jsonb; f jsonb;
BEGIN
  PERFORM set_config('app.devis_rpc','on',true);
  SELECT u.id INTO v_be FROM auth.users u
   WHERE NOT EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role IN ('admin','commercial')) LIMIT 1;
  INSERT INTO user_roles(user_id, role) VALUES (v_be, 'bureau_etude') ON CONFLICT DO NOTHING;
  SELECT id INTO v_aff FROM affaires ORDER BY created_at LIMIT 1;
  INSERT INTO devis(affaire_id,numero,statut,redige_dans_staffing,version,statut_redaction,tva_pct,date_devis)
    VALUES (v_aff,'TEST-PV','brouillon',true,999,'brouillon',20,current_date) RETURNING id INTO v_d;
  INSERT INTO devis_lignes(devis_id,type,ordre,libelle,quantite) VALUES (v_d,'objet',1,'Objet test',2) RETURNING id INTO v_o;
  INSERT INTO devis_materiaux(ligne_id,designation,unite,quantite,prix_achat,coefficient,ordre) VALUES (v_o,'MDF 19','m²',11.59,8.80,1.5,1);
  INSERT INTO devis_lignes_libres(ligne_id,categorie,designation,quantite,prix_achat,coefficient,par_unite,ordre) VALUES (v_o,'achat','Quincaillerie',3,10,1.4,true,1);
  INSERT INTO devis_lignes_libres(ligne_id,categorie,designation,quantite,prix_forfait,coefficient,par_unite,ordre) VALUES (v_o,'forfait','Coursier',1,330,1,false,2);

  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_be,'role','authenticated')::text, true);
  IF current_user_has_capability('devis.couts') OR NOT current_user_has_capability('devis.rediger') THEN
    RAISE EXCEPTION 'Préparation KO : le compte test doit rédiger sans voir les coûts'; END IF;
  v := devis_lire(v_d);
  m := v->'materiaux'->0;
  IF m ? 'prix_achat' OR m ? 'coefficient' THEN RAISE EXCEPTION 'KO matériau : achat/coef visibles %', m; END IF;
  IF (m->>'prix_vente')::numeric <> round(11.59*8.80*1.5, 4) THEN RAISE EXCEPTION 'KO matériau : prix de vente % ≠ 152.988', m->>'prix_vente'; END IF;
  FOR f IN SELECT * FROM jsonb_array_elements(v->'libres') LOOP
    IF f ? 'prix_achat' OR f ? 'coefficient' THEN RAISE EXCEPTION 'KO libre : achat/coef visibles %', f; END IF;
  END LOOP;
  IF (SELECT (x->>'prix_vente')::numeric FROM jsonb_array_elements(v->'libres') x WHERE x->>'designation'='Quincaillerie') <> 42 THEN
    RAISE EXCEPTION 'KO libre achat × coef : prix de vente attendu 42'; END IF;
  IF (SELECT (x->>'prix_vente')::numeric FROM jsonb_array_elements(v->'libres') x WHERE x->>'designation'='Coursier') <> 330 THEN
    RAISE EXCEPTION 'KO libre forfait : prix de vente attendu 330'; END IF;
  IF (v->'droits'->>'couts')::boolean OR (v->'calcul'->>'marge') IS NOT NULL THEN RAISE EXCEPTION 'KO : marge visible'; END IF;
  -- total objet = (152.988 + 42) × 2 + 330 = 719.98
  IF (v->'calcul'->'lignes'->>v_o::text)::numeric <> 719.98 THEN RAISE EXCEPTION 'KO total objet % ≠ 719,98', v->'calcul'->'lignes'->>v_o::text; END IF;

  -- l'admin (devis.couts) voit toujours achat et coefficient
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_admin,'role','authenticated')::text, true);
  v := devis_lire(v_d);
  IF NOT (v->'materiaux'->0 ? 'prix_achat' AND v->'materiaux'->0 ? 'coefficient') THEN RAISE EXCEPTION 'KO admin : achat/coef absents'; END IF;
  RAISE EXCEPTION 'TEST OK : BE voit les prix de vente (152,99 / 42 / 330), sans achat ni coefficient ; admin voit tout';
END $t$;
