-- Lot 4 : écritures Claude sur les devis. Transaction annulée : le bloc finit toujours par une exception
-- (« TEST OK » ou le détail de l'échec), donc rien n'est conservé.
-- Couvre : création idempotente par cle_externe, refus d'un 2e brouillon, lot tout ou rien, verrou humain
-- (autonomie refusée / conversation acceptée), outils interdits, journal, soumission à valider,
-- aperçu simulé sans trace, absence de coûts sans devis.couts.
DO $t$
DECLARE
  v_admin uuid := 'afcb9389-edb4-4ce0-b82c-e302a0aff71a';
  v_client text := '064330b7-082b-45ab-8758-6dc45649a12d';
  v_be uuid := '8c26516c-ccea-435a-a90d-eda523ae341f';
  v_aff uuid; v_d uuid; v_d2 uuid; v_obj uuid; snap text; cid uuid; r jsonb; p jsonb; n int; n2 int; v_msg text; v_ok boolean;
BEGIN
  SELECT a.id INTO v_aff FROM affaires a WHERE a.phase='opportunite' AND a.archived_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM devis d WHERE d.affaire_id=a.id AND d.redige_dans_staffing) ORDER BY a.numero DESC LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_admin,'role','authenticated','client_id',v_client)::text, true);

  -- 1. aperçu simulé : aucune trace
  r := devis_mcp_simuler('devis_creer_brouillon', jsonb_build_object('mode','autonomie','cle_externe','T-LOT4-1'), v_aff);
  IF r ? 'error' THEN RAISE EXCEPTION 'KO aperçu création : %', r->>'error'; END IF;
  IF (r->'apres'->>'total_ht') IS NULL THEN RAISE EXCEPTION 'KO aperçu : totaux après absents %', r; END IF;
  IF EXISTS (SELECT 1 FROM devis WHERE affaire_id=v_aff) THEN RAISE EXCEPTION 'KO aperçu : un devis a été conservé'; END IF;

  -- 2. création confirmée
  p := jsonb_build_object('mode','autonomie','cle_externe','T-LOT4-1','note','Hypothèse : 2 exemplaires');
  SELECT updated_at::text INTO snap FROM affaires WHERE id=v_aff;
  cid := (mcp_write_preview('devis_creer_brouillon','h1',p,v_aff,NULL,snap,'{}')->>'confirmation_id')::uuid;
  r := mcp_execute_write_locked(cid,'devis_creer_brouillon','h1',p,'{}');
  IF r ? 'error' THEN RAISE EXCEPTION 'KO création : %', r->>'error'; END IF;
  v_d := (r->>'devis_id')::uuid;
  IF NOT (SELECT cree_par_mcp AND modifie_par_humain_le IS NULL AND cle_externe='T-LOT4-1' FROM devis WHERE id=v_d) THEN RAISE EXCEPTION 'KO marquage MCP'; END IF;

  -- 3. même cle_externe (même contenu, nouvelle confirmation) → même brouillon
  cid := (mcp_write_preview('devis_creer_brouillon','h1',p,v_aff,NULL,snap,'{}')->>'confirmation_id')::uuid;
  r := mcp_execute_write_locked(cid,'devis_creer_brouillon','h1',p,'{}');
  IF (r->>'devis_id')::uuid IS DISTINCT FROM v_d THEN RAISE EXCEPTION 'KO idempotence : %', r; END IF;
  -- autre clé → refus avec l'id du brouillon actif
  r := devis_mcp_simuler('devis_creer_brouillon', jsonb_build_object('mode','autonomie','cle_externe','T-LOT4-2'), v_aff);
  IF position(v_d::text IN coalesce(r->>'error','')) = 0 THEN RAISE EXCEPTION 'KO refus 2e brouillon : %', r; END IF;
  SELECT count(*) INTO n FROM devis WHERE affaire_id=v_aff AND supprime_le IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'KO : % devis sur l''affaire', n; END IF;

  -- 4. lot avec une ligne en erreur → rien d'écrit
  SELECT count(*) INTO n FROM devis_lignes WHERE devis_id=v_d;
  p := jsonb_build_object('mode','autonomie','devis_id',v_d,'lignes',jsonb_build_array(
        jsonb_build_object('ref','z','type','zone','libelle','Zone test'),
        jsonb_build_object('ref','o','parent_ref','z','type','objet','libelle','Objet test','quantite',2,
          'heures',jsonb_build_array(jsonb_build_object('poste','construction','heures',8),jsonb_build_object('poste','inexistant','heures',1)))));
  SELECT updated_at::text INTO snap FROM devis WHERE id=v_d;
  cid := (mcp_write_preview('devis_remplir','h2',p,v_aff,NULL,snap,'{}')->>'confirmation_id')::uuid;
  r := mcp_execute_write_locked(cid,'devis_remplir','h2',p,'{}');
  IF r->>'statut' <> 'refused' OR position('Élément 2' IN r->>'error')=0 THEN RAISE EXCEPTION 'KO lot en erreur non refusé : %', r; END IF;
  SELECT count(*) INTO n2 FROM devis_lignes WHERE devis_id=v_d;
  IF n2 <> n THEN RAISE EXCEPTION 'KO lot partiel écrit (% → %)', n, n2; END IF;

  -- 5. lot valide
  p := jsonb_build_object('mode','autonomie','devis_id',v_d,'lignes',jsonb_build_array(
        jsonb_build_object('ref','z','type','zone','libelle','Zone test'),
        jsonb_build_object('ref','o','parent_ref','z','type','objet','libelle','Objet test','quantite',2,
          'heures',jsonb_build_array(jsonb_build_object('poste','construction','heures',8)),
          'libres',jsonb_build_array(jsonb_build_object('categorie','achat','designation','Régul','prix_forfait',-50,'par_unite',false)))));
  cid := (mcp_write_preview('devis_remplir','h3',p,v_aff,NULL,snap,'{}')->>'confirmation_id')::uuid;
  r := mcp_execute_write_locked(cid,'devis_remplir','h3',p,'{}');
  IF r ? 'error' THEN RAISE EXCEPTION 'KO lot valide : %', r->>'error'; END IF;
  IF (r->'ajouts'->>'lignes')::int <> 2 OR (r->'ajouts'->>'heures')::int <> 1 THEN RAISE EXCEPTION 'KO comptes lot : %', r->'ajouts'; END IF;
  v_obj := (r->'refs'->>'o')::uuid;
  IF (SELECT modifie_par_humain_le FROM devis WHERE id=v_d) IS NOT NULL THEN RAISE EXCEPTION 'KO : écriture MCP comptée comme humaine'; END IF;

  -- 6. modification humaine (session application, sans client OAuth) → verrou
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_admin,'role','authenticated')::text, true);
  PERFORM devis_ligne_enregistrer(v_d, jsonb_build_object('id',v_obj,'libelle','Objet repris'));
  IF (SELECT modifie_par_humain_le FROM devis WHERE id=v_d) IS NULL THEN RAISE EXCEPTION 'KO verrou humain non posé'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_admin,'role','authenticated','client_id',v_client)::text, true);
  p := jsonb_build_object('mode','autonomie','devis_id',v_d,'champs',jsonb_build_object('libelle','Titre Claude'));
  SELECT updated_at::text INTO snap FROM devis WHERE id=v_d;
  cid := (mcp_write_preview('devis_modifier_entete','h4',p,v_aff,NULL,snap,'{}')->>'confirmation_id')::uuid;
  r := mcp_execute_write_locked(cid,'devis_modifier_entete','h4',p,'{}');
  IF r->>'statut' <> 'refused' OR position('repris par' IN r->>'error')=0 THEN RAISE EXCEPTION 'KO autonomie non refusée : %', r; END IF;
  p := jsonb_build_object('mode','conversation','devis_id',v_d,'champs',jsonb_build_object('libelle','Titre Claude','remise',jsonb_build_object('mode','pct','valeur',40)));
  cid := (mcp_write_preview('devis_modifier_entete','h5',p,v_aff,NULL,snap,'{}')->>'confirmation_id')::uuid;
  r := mcp_execute_write_locked(cid,'devis_modifier_entete','h5',p,'{}');
  IF r ? 'error' THEN RAISE EXCEPTION 'KO conversation refusée : %', r->>'error'; END IF;
  IF (SELECT libelle FROM devis WHERE id=v_d) <> 'Titre Claude' THEN RAISE EXCEPTION 'KO en-tête non modifié'; END IF;
  IF (SELECT remise_mode FROM devis WHERE id=v_d) <> 'pct' THEN RAISE EXCEPTION 'KO remise 40 %% refusée (aucun seuil attendu)'; END IF;

  -- 7. outils interdits
  FOREACH v_msg IN ARRAY ARRAY['devis_valider','devis_marquer_envoye','devis_marquer_signe','devis_signer_vers_fabrication','devis_supprimer','devis_restaurer','devis_taux_ajouter','devis_parametre_ajouter','devis_modele_enregistrer','devis_statut_changer'] LOOP
    v_ok := false;
    BEGIN PERFORM mcp_assert_write(v_msg); EXCEPTION WHEN OTHERS THEN v_ok := true; END;
    IF NOT v_ok THEN RAISE EXCEPTION 'KO outil interdit accepté : %', v_msg; END IF;
    r := mcp_execute_write_locked(gen_random_uuid(), v_msg, 'x', jsonb_build_object('devis_id',v_d), '{}');
    IF r->>'statut' <> 'refused' THEN RAISE EXCEPTION 'KO dispatch interdit accepté : %', v_msg; END IF;
  END LOOP;

  -- 8. soumission à valider
  p := jsonb_build_object('mode','conversation','devis_id',v_d,'note','À confirmer : dimensions');
  SELECT updated_at::text INTO snap FROM devis WHERE id=v_d;
  cid := (mcp_write_preview('devis_soumettre','h6',p,v_aff,NULL,snap,'{}')->>'confirmation_id')::uuid;
  r := mcp_execute_write_locked(cid,'devis_soumettre','h6',p,'{}');
  IF r ? 'error' THEN RAISE EXCEPTION 'KO soumission : %', r->>'error'; END IF;
  IF (SELECT statut_redaction::text||'|'||note_mcp FROM devis WHERE id=v_d) <> 'a_valider|À confirmer : dimensions' THEN RAISE EXCEPTION 'KO statut/note après soumission'; END IF;
  -- plus aucune écriture une fois à valider
  r := devis_mcp_simuler('devis_remplir', jsonb_build_object('mode','conversation','devis_id',v_d,'lignes',jsonb_build_array(jsonb_build_object('type','commentaire','texte','x'))), v_aff);
  IF NOT r ? 'error' THEN RAISE EXCEPTION 'KO écriture acceptée hors brouillon'; END IF;

  -- 9. journal : chaque écriture confirmée ou refusée est tracée
  SELECT count(*) INTO n FROM devis_mcp_journal WHERE affaire_id=v_aff OR devis_id=v_d;
  IF n < 7 THEN RAISE EXCEPTION 'KO journal : % lignes', n; END IF;
  IF NOT EXISTS (SELECT 1 FROM devis_mcp_journal WHERE devis_id=v_d AND outil='devis_modifier_entete' AND statut='refuse' AND mode='autonomie') THEN RAISE EXCEPTION 'KO journal du refus'; END IF;

  -- 10. sans devis.couts : ni coût ni marge
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_be,'role','authenticated')::text, true);
  r := devis_calculer(v_d);
  IF r ? 'cout_total' OR r ? 'decomposition' OR r->'marge' <> 'null'::jsonb THEN RAISE EXCEPTION 'KO coûts visibles sans devis.couts : %', r; END IF;

  RAISE EXCEPTION 'TEST OK';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'TEST OK' THEN RAISE NOTICE 'TEST OK'; RAISE EXCEPTION 'TEST OK (annulé)'; END IF;
  RAISE;
END $t$;
