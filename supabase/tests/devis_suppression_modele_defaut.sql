-- Suppression logique des devis + modèle par défaut « Devis type Set Up ».
-- Transaction annulée : le bloc se termine toujours par une exception (« TEST OK » ou le détail de l'échec).
DO $t$
DECLARE v_admin uuid := 'afcb9389-edb4-4ce0-b82c-e302a0aff71a';
        v_com uuid := '7bddafaf-1501-4ab4-9863-fe6c4ee646bb'; -- Laurent Debranche (commercial)
        v_chef uuid; v_aff uuid; v_mod uuid; r jsonb; v_d1 uuid; v_d2 uuid; v_d3 uuid; v jsonb; c jsonb; n int; ok boolean;
BEGIN
  SELECT u.id INTO v_chef FROM auth.users u WHERE EXISTS (SELECT 1 FROM user_roles x WHERE x.user_id=u.id AND x.role='chef_chantier')
     AND NOT EXISTS (SELECT 1 FROM user_roles x WHERE x.user_id=u.id AND x.role IN ('admin','commercial','bureau_etude')) LIMIT 1;
  SELECT a.id INTO v_aff FROM affaires a WHERE a.phase='opportunite' AND coalesce(a.statut_opportunite::text,'a_faire')='a_faire'
     AND a.archived_at IS NULL AND NOT EXISTS (SELECT 1 FROM devis d WHERE d.affaire_id=a.id) LIMIT 1;

  -- 1. Création depuis le pipeline avec le modèle par défaut
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_com,'role','authenticated')::text, true);
  v_mod := devis_modele_defaut_id();
  IF v_mod IS NULL OR (SELECT modele_nom FROM devis WHERE id=v_mod) <> 'Devis type Set Up' THEN RAISE EXCEPTION 'KO : modèle par défaut absent'; END IF;
  r := devis_creer_depuis_pipeline(v_aff, v_mod);
  v_d1 := (r->>'devis_id')::uuid;
  IF (r->>'existant')::boolean THEN RAISE EXCEPTION 'KO : devis existant inattendu'; END IF;
  v := devis_lire(v_d1);
  IF (v->'calcul'->>'total_ht')::numeric <> 0 THEN RAISE EXCEPTION 'KO : total % ≠ 0', v->'calcul'->>'total_ht'; END IF;
  IF jsonb_array_length(v->'lignes') <> 7 OR jsonb_array_length(v->'heures') <> 16 OR jsonb_array_length(v->'libres') <> 9 THEN
    RAISE EXCEPTION 'KO éditeur : % lignes / % heures / % libres (attendu 7/16/9)', jsonb_array_length(v->'lignes'), jsonb_array_length(v->'heures'), jsonb_array_length(v->'libres'); END IF;
  c := devis_lire_client(v_d1);
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(c->'lignes') x WHERE x->>'type'<>'commentaire') THEN RAISE EXCEPTION 'KO vue client : ligne à 0 visible'; END IF;
  IF jsonb_array_length(c->'lignes') <> 2 THEN RAISE EXCEPTION 'KO vue client : % commentaires (attendu 2)', jsonb_array_length(c->'lignes'); END IF;
  IF (SELECT statut_opportunite::text FROM affaires WHERE id=v_aff) <> 'a_l_etude' THEN RAISE EXCEPTION 'KO : opportunité pas en À l''étude'; END IF;

  -- 2. Le chef d'équipe ne peut pas supprimer
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_chef,'role','authenticated')::text, true);
  ok := false; BEGIN PERFORM devis_supprimer(v_d1); EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'KO : chef d''équipe a pu supprimer'; END IF;

  -- 3. L'auteur supprime son brouillon
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_com,'role','authenticated')::text, true);
  PERFORM devis_supprimer(v_d1);
  IF (SELECT supprime_le FROM devis WHERE id=v_d1) IS NULL THEN RAISE EXCEPTION 'KO : pas de suppression logique'; END IF;
  IF NOT EXISTS (SELECT 1 FROM devis_deletion_log WHERE devis_id=v_d1 AND action='suppression_logique' AND deleted_by=v_com) THEN RAISE EXCEPTION 'KO : trace absente'; END IF;
  IF EXISTS (SELECT 1 FROM devis_derniers_par_affaire(ARRAY[v_aff])) THEN RAISE EXCEPTION 'KO : badge pipeline encore présent'; END IF;
  IF EXISTS (SELECT 1 FROM devis_lister_global(NULL,NULL,NULL,500,0) g WHERE g.id=v_d1) THEN RAISE EXCEPTION 'KO : encore dans la liste'; END IF;
  IF devis_peut_lire(v_d1) THEN RAISE EXCEPTION 'KO : encore lisible'; END IF;
  IF (SELECT statut_opportunite::text FROM affaires WHERE id=v_aff) <> 'a_l_etude' THEN RAISE EXCEPTION 'KO : statut opportunité a reculé'; END IF;

  -- 4. Nouveau devis : le numéro R1 supprimé n'est pas réutilisé
  r := devis_creer_depuis_pipeline(v_aff, NULL);
  v_d2 := (r->>'devis_id')::uuid;
  IF (SELECT version FROM devis WHERE id=v_d2) <> 2 OR (SELECT numero FROM devis WHERE id=v_d2) NOT LIKE '%-R2' THEN RAISE EXCEPTION 'KO : version réutilisée'; END IF;

  -- 5. Refus pour un devis validé
  PERFORM set_config('app.devis_rpc','on',true);
  UPDATE devis SET statut_redaction='valide' WHERE id=v_d2;
  ok := false; BEGIN PERFORM devis_supprimer(v_d2); EXCEPTION WHEN insufficient_privilege THEN ok := SQLERRM LIKE '%Marquer refusé%'; END;
  IF NOT ok THEN RAISE EXCEPTION 'KO : devis validé supprimé ou message absent'; END IF;

  -- 6. Restauration admin, puis refus au-delà de 30 jours
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_com,'role','authenticated')::text, true);
  ok := false; BEGIN PERFORM devis_restaurer(v_d1); EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'KO : non-admin a restauré'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_admin,'role','authenticated')::text, true);
  IF NOT EXISTS (SELECT 1 FROM devis_supprimes_lister() WHERE id=v_d1) THEN RAISE EXCEPTION 'KO : absent de la liste Devis supprimés'; END IF;
  PERFORM devis_restaurer(v_d1);
  IF (SELECT supprime_le FROM devis WHERE id=v_d1) IS NOT NULL OR NOT devis_peut_lire(v_d1) THEN RAISE EXCEPTION 'KO : restauration'; END IF;
  IF NOT EXISTS (SELECT 1 FROM devis_deletion_log WHERE devis_id=v_d1 AND action='restauration') THEN RAISE EXCEPTION 'KO : trace restauration'; END IF;
  PERFORM devis_supprimer(v_d1);
  UPDATE devis SET supprime_le = now() - interval '31 days' WHERE id=v_d1;
  ok := false; BEGIN PERFORM devis_restaurer(v_d1); EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE '%30 jours%'; END;
  IF NOT ok THEN RAISE EXCEPTION 'KO : restauration au-delà de 30 jours'; END IF;

  RAISE EXCEPTION 'TEST OK : modèle par défaut (7 lignes, 16 heures, 9 libres, total 0, vue client = 2 commentaires) ; suppression auteur OK ; chef refusé ; validé refusé ; R2 sans réutilisation ; restauration admin OK, refusée après 30 j';
END $t$;
