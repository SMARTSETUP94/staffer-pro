-- Lot 4 — corrections après recette (devis test 9484-R1). Transaction annulée : le bloc finit toujours par une exception.
-- Couvre : ligne_id du modèle (champs appliqués, heures poste+niveau mises à jour sans doublon), modifier / supprimer
-- ses propres lignes (tout ou rien, corbeille restaurable par un humain), verrou humain et règle « créé par Claude »
-- en autonomie, aperçu avant / après, coûts manquants signalés, journal.
DO $t$
DECLARE
  v_admin uuid := 'afcb9389-edb4-4ce0-b82c-e302a0aff71a';
  v_client text := '064330b7-082b-45ab-8758-6dc45649a12d';
  v_aff uuid; v_d uuid; v_obj uuid; v_com uuid; v_h uuid; v_mat uuid; v_lib uuid; snap text; cid uuid; r jsonb; p jsonb; n int; n2 int; nh int;
  claims_mcp text; claims_app text; out text := '';
BEGIN
  claims_mcp := json_build_object('sub',v_admin,'role','authenticated','client_id',v_client)::text;
  claims_app := json_build_object('sub',v_admin,'role','authenticated')::text;
  SELECT a.id INTO v_aff FROM affaires a WHERE a.phase='opportunite' AND a.archived_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM devis d WHERE d.affaire_id=a.id AND d.redige_dans_staffing) ORDER BY a.numero DESC LIMIT 1;
  PERFORM set_config('request.jwt.claims', claims_mcp, true);

  -- 0. brouillon Claude depuis le devis type par défaut
  p := jsonb_build_object('mode','autonomie','cle_externe','T-LOT4C');
  SELECT updated_at::text INTO snap FROM affaires WHERE id=v_aff;
  cid := (mcp_write_preview('devis_creer_brouillon','c0',p,v_aff,NULL,snap,'{}')->>'confirmation_id')::uuid;
  r := mcp_execute_write_locked(cid,'devis_creer_brouillon','c0',p,'{}');
  IF r ? 'error' THEN RAISE EXCEPTION 'KO création : %', r->>'error'; END IF;
  v_d := (r->>'devis_id')::uuid;
  SELECT id INTO v_obj FROM devis_lignes WHERE devis_id=v_d AND type='objet' AND supprime_le IS NULL ORDER BY ordre LIMIT 1;
  IF v_obj IS NULL THEN RAISE EXCEPTION 'KO : pas d''objet dans le modèle par défaut'; END IF;
  SELECT count(*) INTO nh FROM devis_heures WHERE ligne_id=v_obj AND supprime_le IS NULL;

  -- POINT 2. ligne_id : champs appliqués à « Objet 1 », heures du modèle mises à jour (pas de doublon)
  p := jsonb_build_object('mode','autonomie','devis_id',v_d,'lignes',jsonb_build_array(jsonb_build_object(
         'ligne_id',v_obj,'libelle','Totem FIJI','quantite',2,'longueur_mm',1200,'largeur_mm',400,'hauteur_mm',2000,'descriptif_client','Totem bois peint',
         'heures',jsonb_build_array(jsonb_build_object('poste','construction','heures',8),jsonb_build_object('poste','peinture','heures',6)),
         'materiaux',jsonb_build_array(jsonb_build_object('designation','MDF 19 test','quantite',3,'prix_achat',20)),
         'libres',jsonb_build_array(jsonb_build_object('categorie','achat','designation','Visserie','prix_achat',10,'quantite',1)))));
  SELECT updated_at::text INTO snap FROM devis WHERE id=v_d;
  cid := (mcp_write_preview('devis_remplir','c1',p,v_aff,NULL,snap,'{}')->>'confirmation_id')::uuid;
  r := mcp_execute_write_locked(cid,'devis_remplir','c1',p,'{}');
  IF r ? 'error' THEN RAISE EXCEPTION 'KO ligne_id : %', r->>'error'; END IF;
  IF (SELECT libelle||'|'||quantite::numeric::text||'|'||longueur_mm::numeric::text||'|'||descriptif_client FROM devis_lignes WHERE id=v_obj) <> 'Totem FIJI|2|1200|Totem bois peint' THEN
    RAISE EXCEPTION 'KO champs de la ligne du modèle non appliqués : %', (SELECT to_jsonb(l) FROM devis_lignes l WHERE id=v_obj); END IF;
  SELECT count(*) INTO n FROM devis_heures WHERE ligne_id=v_obj AND supprime_le IS NULL;
  IF n <> nh THEN RAISE EXCEPTION 'KO heures doublées : % → %', nh, n; END IF;
  IF (SELECT count(*) FROM devis_heures h JOIN devis_postes_ref p ON p.id=h.poste_id WHERE h.ligne_id=v_obj AND p.code='construction' AND h.supprime_le IS NULL) <> 1
     OR (SELECT h.heures FROM devis_heures h JOIN devis_postes_ref p ON p.id=h.poste_id WHERE h.ligne_id=v_obj AND p.code='construction' AND h.supprime_le IS NULL) <> 8 THEN
    RAISE EXCEPTION 'KO heure construction non mise à jour'; END IF;
  IF (r->'mises_a_jour'->>'heures')::int <> 2 OR (r->'ajouts'->>'heures')::int <> 0 OR (r->'mises_a_jour'->>'lignes')::int <> 1 THEN RAISE EXCEPTION 'KO comptes : %', r; END IF;
  out := out || format(E'\nPoint 2 : « Objet 1 » → Totem FIJI ×2, %s lignes d''heures avant et après (construction 0 → 8 h, peinture 0 → 6 h)', nh);

  SELECT h.id INTO v_h FROM devis_heures h JOIN devis_postes_ref p ON p.id=h.poste_id WHERE h.ligne_id=v_obj AND p.code='construction' AND h.supprime_le IS NULL;
  SELECT id INTO v_mat FROM devis_materiaux WHERE ligne_id=v_obj AND supprime_le IS NULL;
  SELECT id INTO v_lib FROM devis_lignes_libres WHERE ligne_id=v_obj AND designation='Visserie';
  SELECT id INTO v_com FROM devis_lignes WHERE devis_id=v_d AND type='commentaire' AND supprime_le IS NULL ORDER BY ordre LIMIT 1;

  -- POINT 1a. modifications (ligne, heure, matériau, ligne libre)
  p := jsonb_build_object('mode','autonomie','devis_id',v_d,'modifications',jsonb_build_array(
         jsonb_build_object('cible','ligne','id',v_obj,'champs',jsonb_build_object('quantite',3,'descriptif_client','Totem bois peint, 3 ex.')),
         jsonb_build_object('cible','heure','id',v_h,'champs',jsonb_build_object('heures',10,'taux_vente',50)),
         jsonb_build_object('cible','materiau','id',v_mat,'champs',jsonb_build_object('quantite',5,'coefficient',1.5)),
         jsonb_build_object('cible','libre','id',v_lib,'champs',jsonb_build_object('quantite',2,'prix_forfait',120))));
  r := devis_mcp_simuler('devis_remplir', p, v_aff);
  IF r ? 'error' THEN RAISE EXCEPTION 'KO aperçu modifications : %', r->>'error'; END IF;
  IF (r->'apres'->>'total_ht')::numeric = (r->'avant'->>'total_ht')::numeric THEN RAISE EXCEPTION 'KO aperçu : total inchangé'; END IF;
  IF (SELECT heures FROM devis_heures WHERE id=v_h) <> 8 THEN RAISE EXCEPTION 'KO aperçu a écrit'; END IF;
  SELECT updated_at::text INTO snap FROM devis WHERE id=v_d;
  cid := (mcp_write_preview('devis_remplir','c2',p,v_aff,NULL,snap,'{}')->>'confirmation_id')::uuid;
  r := mcp_execute_write_locked(cid,'devis_remplir','c2',p,'{}');
  IF r ? 'error' THEN RAISE EXCEPTION 'KO modifications : %', r->>'error'; END IF;
  IF (SELECT quantite FROM devis_lignes WHERE id=v_obj) <> 3 OR (SELECT heures||'|'||taux_vente FROM devis_heures WHERE id=v_h) <> '10|50'
     OR (SELECT quantite||'|'||coefficient FROM devis_materiaux WHERE id=v_mat) <> '5|1.5' OR (SELECT quantite||'|'||prix_forfait FROM devis_lignes_libres WHERE id=v_lib) <> '2|120' THEN
    RAISE EXCEPTION 'KO valeurs modifiées'; END IF;
  out := out || format(E'\nPoint 1 modifier : objet ×3, construction 10 h à 50 €, matériau 5 × coef 1,5, ligne libre 2 × 120 € — total HT %s €', r->'calcul'->>'total_ht');

  -- POINT 1b. tout ou rien : une modification en erreur → rien d'écrit
  p := jsonb_build_object('mode','autonomie','devis_id',v_d,'modifications',jsonb_build_array(
         jsonb_build_object('cible','heure','id',v_h,'champs',jsonb_build_object('heures',99)),
         jsonb_build_object('cible','materiau','id',gen_random_uuid(),'champs',jsonb_build_object('quantite',1))));
  SELECT updated_at::text INTO snap FROM devis WHERE id=v_d;
  cid := (mcp_write_preview('devis_remplir','c3',p,v_aff,NULL,snap,'{}')->>'confirmation_id')::uuid;
  r := mcp_execute_write_locked(cid,'devis_remplir','c3',p,'{}');
  IF r->>'statut' <> 'refused' OR position('Modification 2' IN r->>'error')=0 THEN RAISE EXCEPTION 'KO lot en erreur : %', r; END IF;
  IF (SELECT heures FROM devis_heures WHERE id=v_h) <> 10 THEN RAISE EXCEPTION 'KO lot partiel écrit'; END IF;
  -- champ hors liste refusé
  r := devis_mcp_simuler('devis_remplir', jsonb_build_object('mode','autonomie','devis_id',v_d,'modifications',jsonb_build_array(
         jsonb_build_object('cible','heure','id',v_h,'champs',jsonb_build_object('cout_revient',1)))), v_aff);
  IF position('non modifiable' IN coalesce(r->>'error',''))=0 THEN RAISE EXCEPTION 'KO champ interdit accepté : %', r; END IF;
  r := devis_mcp_simuler('devis_remplir', jsonb_build_object('mode','autonomie','devis_id',v_d,'suppressions',jsonb_build_array(jsonb_build_object('cible','devis','id',v_d))), v_aff);
  IF NOT r ? 'error' THEN RAISE EXCEPTION 'KO suppression du devis entier acceptée'; END IF;
  out := out || E'\nPoint 1 tout ou rien : lot avec un id inconnu refusé, rien écrit ; champ hors liste et suppression du devis refusés';

  -- POINT 1c. suppressions logiques + aperçu des comptes
  p := jsonb_build_object('mode','autonomie','devis_id',v_d,'suppressions',jsonb_build_array(
         jsonb_build_object('cible','materiau','id',v_mat), jsonb_build_object('cible','libre','id',v_lib), jsonb_build_object('cible','ligne','id',v_com)));
  r := devis_mcp_simuler('devis_remplir', p, v_aff);
  IF (r->'compte_apres'->>'materiaux')::int <> (r->'compte_avant'->>'materiaux')::int - 1 OR (r->'compte_apres'->>'lignes')::int <> (r->'compte_avant'->>'lignes')::int - 1 THEN
    RAISE EXCEPTION 'KO aperçu suppressions : % / %', r->'compte_avant', r->'compte_apres'; END IF;
  SELECT updated_at::text INTO snap FROM devis WHERE id=v_d;
  cid := (mcp_write_preview('devis_remplir','c4',p,v_aff,NULL,snap,'{}')->>'confirmation_id')::uuid;
  r := mcp_execute_write_locked(cid,'devis_remplir','c4',p,'{}');
  IF r ? 'error' THEN RAISE EXCEPTION 'KO suppressions : %', r->>'error'; END IF;
  IF (SELECT supprime_le FROM devis_materiaux WHERE id=v_mat) IS NULL OR (SELECT supprime_le FROM devis_lignes WHERE id=v_com) IS NULL THEN RAISE EXCEPTION 'KO suppression logique'; END IF;
  -- l'humain voit et restaure dans la corbeille de l'éditeur
  PERFORM set_config('request.jwt.claims', claims_app, true);
  r := devis_lire(v_d);
  IF jsonb_array_length(r->'corbeille_elements') <> 2 OR jsonb_array_length(r->'corbeille') < 1 THEN RAISE EXCEPTION 'KO corbeille : % / %', r->'corbeille_elements', r->'corbeille'; END IF;
  PERFORM devis_element_supprimer('materiau', v_mat, true);
  PERFORM devis_corbeille_restaurer(v_d, (r->'corbeille'->0->>'groupe')::uuid);
  IF (SELECT supprime_le FROM devis_materiaux WHERE id=v_mat) IS NOT NULL OR (SELECT supprime_le FROM devis_lignes WHERE id=v_com) IS NOT NULL THEN RAISE EXCEPTION 'KO restauration humaine'; END IF;
  out := out || E'\nPoint 1 supprimer : matériau, ligne libre et commentaire à la corbeille ; restaurés par un humain dans l''éditeur';

  -- POINT 1d. verrou humain : la restauration est une modification humaine → autonomie refusée, conversation acceptée
  IF (SELECT modifie_par_humain_le FROM devis WHERE id=v_d) IS NULL THEN RAISE EXCEPTION 'KO verrou humain non posé'; END IF;
  PERFORM set_config('request.jwt.claims', claims_mcp, true);
  p := jsonb_build_object('mode','autonomie','devis_id',v_d,'modifications',jsonb_build_array(jsonb_build_object('cible','heure','id',v_h,'champs',jsonb_build_object('heures',12))));
  SELECT updated_at::text INTO snap FROM devis WHERE id=v_d;
  cid := (mcp_write_preview('devis_remplir','c5',p,v_aff,NULL,snap,'{}')->>'confirmation_id')::uuid;
  r := mcp_execute_write_locked(cid,'devis_remplir','c5',p,'{}');
  IF r->>'statut' <> 'refused' OR position('repris par' IN r->>'error')=0 THEN RAISE EXCEPTION 'KO autonomie non refusée : %', r; END IF;
  p := jsonb_set(p, '{mode}', '"conversation"');
  cid := (mcp_write_preview('devis_remplir','c6',p,v_aff,NULL,snap,'{}')->>'confirmation_id')::uuid;
  r := mcp_execute_write_locked(cid,'devis_remplir','c6',p,'{}');
  IF r ? 'error' OR (SELECT heures FROM devis_heures WHERE id=v_h) <> 12 THEN RAISE EXCEPTION 'KO conversation : %', r; END IF;

  -- brouillon non créé par Claude (jamais repris) : en autonomie, ajout OK mais modification refusée
  PERFORM set_config('request.jwt.claims', '{}', true);
  PERFORM set_config('app.devis_rpc','on',true);
  UPDATE devis SET cree_par_mcp=false, modifie_par_humain_le=NULL, modifie_par_humain_id=NULL WHERE id=v_d;
  PERFORM set_config('request.jwt.claims', claims_mcp, true);
  r := devis_mcp_simuler('devis_remplir', jsonb_build_object('mode','autonomie','devis_id',v_d,'modifications',jsonb_build_array(jsonb_build_object('cible','heure','id',v_h,'champs',jsonb_build_object('heures',1)))), v_aff);
  IF position('qu''il a créé' IN coalesce(r->>'error',''))=0 THEN RAISE EXCEPTION 'KO autonomie sur brouillon non Claude : %', r; END IF;
  r := devis_mcp_simuler('devis_remplir', jsonb_build_object('mode','autonomie','devis_id',v_d,'lignes',jsonb_build_array(jsonb_build_object('type','commentaire','texte','ajout')))), v_aff);
  IF r ? 'error' THEN RAISE EXCEPTION 'KO ajout autonome refusé : %', r->>'error'; END IF;
  out := out || E'\nPoint 1 verrou : repris par un humain → autonomie refusée, conversation acceptée ; brouillon non créé par Claude → modification autonome refusée';

  -- POINT 4. coûts manquants signalés (impression UV sans coût de revient), aucun coût inventé
  PERFORM set_config('request.jwt.claims', claims_mcp, true);
  r := devis_mcp_simuler('devis_remplir', jsonb_build_object('mode','conversation','devis_id',v_d,'lignes',jsonb_build_array(jsonb_build_object('ligne_id',v_obj,
         'heures',jsonb_build_array(jsonb_build_object('poste','impression_uv','heures',2),jsonb_build_object('poste','metallerie','heures',4)))))), v_aff);
  IF r ? 'error' OR jsonb_array_length(coalesce(r->'apres'->'couts_manquants','[]'))=0 THEN RAISE EXCEPTION 'KO coûts manquants non signalés : %', r->'apres'->'couts_manquants'; END IF;
  out := out || format(E'\nPoint 4 : coûts manquants signalés dans l''aperçu → %s', r->'apres'->'couts_manquants');

  -- journal
  SELECT count(*) INTO n FROM devis_mcp_journal WHERE devis_id=v_d AND outil='devis_remplir';
  SELECT count(*) INTO n2 FROM devis_mcp_journal WHERE devis_id=v_d AND outil='devis_remplir' AND statut='refuse';
  IF n < 6 OR n2 < 2 THEN RAISE EXCEPTION 'KO journal : % écritures dont % refus', n, n2; END IF;
  out := out || format(E'\nJournal : %s écritures devis_remplir tracées dont %s refus', n, n2);

  RAISE EXCEPTION 'TEST OK%', out;
END $t$;
