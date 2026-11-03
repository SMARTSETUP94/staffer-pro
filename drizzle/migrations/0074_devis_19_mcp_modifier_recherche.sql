-- Lot 4 corrections : modifier / supprimer ses lignes, compléter une ligne existante, corbeille des éléments, recherche par section
CREATE OR REPLACE FUNCTION public.devis_lire(_devis_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_c boolean := current_user_has_capability('devis.couts'); d record; v jsonb;
BEGIN
  IF NOT devis_peut_lire(_devis_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO d FROM devis WHERE id=_devis_id;
  v := jsonb_build_object(
    'devis', to_jsonb(d) - CASE WHEN v_c THEN 'x' ELSE 'totaux_snapshot' END,
    'affaire', (SELECT jsonb_build_object('id',a.id,'numero',a.numero,'code_opportunite',a.code_opportunite,'nom',a.nom,'created_at',a.created_at,
        'client_id',a.client_id,'date_visite_technique',a.date_visite_technique,'date_montage',a.date_montage,
        'date_evenement_debut',a.date_evenement_debut,'date_evenement_fin',a.date_evenement_fin,'date_demontage',a.date_demontage)
        FROM affaires a WHERE a.id=d.affaire_id),
    'client', (SELECT to_jsonb(c) FROM (SELECT id,nom,siret,adresse,code_postal,ville,tva_intracom FROM clients WHERE id=d.client_id) c),
    'client_final', (SELECT jsonb_build_object('id',id,'nom',nom) FROM clients WHERE id=d.client_final_id),
    'contact', (SELECT to_jsonb(c) - 'notes' FROM client_contacts c WHERE c.id=d.contact_id),
    'modele_origine', (SELECT modele_nom FROM devis WHERE id=d.modele_origine_id),
    'lignes', (SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.ordre),'[]') FROM devis_lignes l WHERE l.devis_id=_devis_id AND l.supprime_le IS NULL),
    'corbeille', (SELECT coalesce(jsonb_agg(jsonb_build_object('groupe',g,'supprime_le',t,'libelles',libs) ORDER BY t DESC),'[]') FROM (
        SELECT suppression_groupe g, max(supprime_le) t, jsonb_agg(coalesce(libelle,left(texte,40),type::text)) FILTER (WHERE parent_id IS NULL OR parent_id NOT IN (SELECT id FROM devis_lignes x WHERE x.suppression_groupe=l.suppression_groupe)) libs
        FROM devis_lignes l WHERE devis_id=_devis_id AND supprime_le IS NOT NULL GROUP BY suppression_groupe) z),
    'heures', (SELECT coalesce(jsonb_agg((to_jsonb(h) - CASE WHEN v_c THEN 'x' ELSE 'cout_revient' END) || jsonb_build_object('poste_libelle',p.libelle,'metier_id',p.metier_id) ORDER BY h.ordre,h.created_at),'[]')
        FROM devis_heures h JOIN devis_lignes l ON l.id=h.ligne_id JOIN devis_postes_ref p ON p.id=h.poste_id WHERE l.devis_id=_devis_id AND h.supprime_le IS NULL),
    'materiaux', (SELECT coalesce(jsonb_agg((to_jsonb(m) - CASE WHEN v_c THEN ARRAY[]::text[] ELSE ARRAY['prix_achat','coefficient'] END)
          || jsonb_build_object('prix_vente_unitaire', coalesce(m.prix_achat,0) * m.coefficient,
                                'prix_vente', m.quantite * coalesce(m.prix_achat,0) * m.coefficient) ORDER BY m.ordre,m.created_at),'[]')
        FROM devis_materiaux m JOIN devis_lignes l ON l.id=m.ligne_id WHERE l.devis_id=_devis_id AND m.supprime_le IS NULL),
    'libres', (SELECT coalesce(jsonb_agg((to_jsonb(f) - CASE WHEN v_c THEN ARRAY[]::text[] ELSE ARRAY['prix_achat','coefficient'] END)
          || jsonb_build_object('prix_vente_unitaire', coalesce(f.prix_forfait, coalesce(f.prix_achat,0) * f.coefficient),
                                'prix_vente', f.quantite * coalesce(f.prix_forfait, coalesce(f.prix_achat,0) * f.coefficient)) ORDER BY f.ordre,f.created_at),'[]')
        FROM devis_lignes_libres f JOIN devis_lignes l ON l.id=f.ligne_id WHERE l.devis_id=_devis_id AND f.supprime_le IS NULL),
    'corbeille_elements', (SELECT coalesce(jsonb_agg(x ORDER BY x->>'supprime_le' DESC),'[]') FROM (
        SELECT jsonb_build_object('kind','heure','id',h.id,'supprime_le',h.supprime_le,'libelle',concat(coalesce(l.libelle,l.type::text),' — ',p.libelle,' ',trim_scale(h.heures),' h')) x
          FROM devis_heures h JOIN devis_lignes l ON l.id=h.ligne_id JOIN devis_postes_ref p ON p.id=h.poste_id WHERE l.devis_id=_devis_id AND l.supprime_le IS NULL AND h.supprime_le IS NOT NULL
        UNION ALL SELECT jsonb_build_object('kind','materiau','id',m.id,'supprime_le',m.supprime_le,'libelle',concat(coalesce(l.libelle,l.type::text),' — ',m.designation))
          FROM devis_materiaux m JOIN devis_lignes l ON l.id=m.ligne_id WHERE l.devis_id=_devis_id AND l.supprime_le IS NULL AND m.supprime_le IS NOT NULL
        UNION ALL SELECT jsonb_build_object('kind','libre','id',f.id,'supprime_le',f.supprime_le,'libelle',concat(coalesce(l.libelle,l.type::text),' — ',f.designation))
          FROM devis_lignes_libres f JOIN devis_lignes l ON l.id=f.ligne_id WHERE l.devis_id=_devis_id AND l.supprime_le IS NULL AND f.supprime_le IS NOT NULL) z),
    'photos', (SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.ordre,p.uploaded_at),'[]') FROM devis_photos p WHERE p.devis_id=_devis_id AND p.deleted_at IS NULL),
    'calcul', devis_calculer(_devis_id),
    'droits', jsonb_build_object('couts',v_c,'ecrire',devis_peut_ecrire(_devis_id),'valider',devis_peut_valider(_devis_id),'parametres',current_user_has_capability('devis.parametres')),
    'parametres', (SELECT coalesce(jsonb_object_agg(cle,valeur),'{}') FROM v_devis_parametres_courants WHERE v_c OR cle NOT LIKE 'cout\_%'),
    'couts_figes', CASE WHEN v_c THEN (SELECT to_jsonb(s) FROM devis_snapshot_couts s WHERE s.devis_id=_devis_id) END);
  RETURN v;
END $function$;

CREATE OR REPLACE FUNCTION public.devis_remplir_lot(_devis_id uuid, _lignes jsonb, _ops jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE e jsonb; ch jsonb; i int := 0; lid uuid; v_id uuid; v_parent uuid; refs jsonb := '{}'::jsonb; h jsonb; m jsonb; f jsonb; v_poste uuid; v_niv text; k text;
        v_mods jsonb := coalesce(_ops->'modifications','[]'::jsonb); v_sups jsonb := coalesce(_ops->'suppressions','[]'::jsonb);
        o record; groupes jsonb := '[]'::jsonb;
        nb_l int := 0; nb_h int := 0; nb_m int := 0; nb_f int := 0;
        mj_l int := 0; mj_h int := 0; mj_m int := 0; mj_f int := 0;
        sp_l int := 0; sp_h int := 0; sp_m int := 0; sp_f int := 0; total int := 0;
        c_ligne CONSTANT text[] := ARRAY['libelle','quantite','descriptif_client','longueur_mm','largeur_mm','hauteur_mm','finition','texte','interne'];
        c_heure CONSTANT text[] := ARRAY['heures','niveau','taux_vente','montant_force','par_unite'];
        c_mat CONSTANT text[] := ARRAY['quantite','coefficient','materiau_id'];
        c_libre CONSTANT text[] := ARRAY['quantite','prix_forfait','prix_achat','designation','coefficient','unite','heures_info'];
BEGIN
  PERFORM devis_assert_ecriture(_devis_id);
  _lignes := coalesce(_lignes,'[]'::jsonb);
  IF jsonb_typeof(_lignes) <> 'array' OR jsonb_typeof(v_mods) <> 'array' OR jsonb_typeof(v_sups) <> 'array' THEN RAISE EXCEPTION 'Lot mal formé'; END IF;
  IF jsonb_array_length(_lignes)+jsonb_array_length(v_mods)+jsonb_array_length(v_sups)=0 THEN RAISE EXCEPTION 'Lot vide'; END IF;
  SELECT count(*) + coalesce(sum(jsonb_array_length(coalesce(x->'heures','[]'))+jsonb_array_length(coalesce(x->'materiaux','[]'))+jsonb_array_length(coalesce(x->'libres','[]'))),0)
    INTO total FROM jsonb_array_elements(_lignes) x;
  total := total + jsonb_array_length(v_mods) + jsonb_array_length(v_sups);
  IF total > 300 THEN RAISE EXCEPTION 'Lot limité à 300 lignes (reçu %) : découper en plusieurs appels', total; END IF;

  -- 1. Modifications d'éléments existants
  FOR e IN SELECT value FROM jsonb_array_elements(v_mods) LOOP
    i := i + 1;
    BEGIN
      v_id := NULLIF(e->>'id','')::uuid; ch := coalesce(e->'champs','{}'::jsonb);
      IF v_id IS NULL THEN RAISE EXCEPTION 'id obligatoire'; END IF;
      IF jsonb_typeof(ch) <> 'object' OR ch = '{}'::jsonb THEN RAISE EXCEPTION 'Modification vide'; END IF;
      IF e->>'cible' = 'ligne' THEN
        FOR k IN SELECT jsonb_object_keys(ch) LOOP IF NOT (k = ANY(c_ligne) OR k='incluse') THEN RAISE EXCEPTION 'Champ non modifiable : %', k; END IF; END LOOP;
        IF NOT EXISTS (SELECT 1 FROM devis_lignes WHERE id=v_id AND devis_id=_devis_id AND supprime_le IS NULL) THEN RAISE EXCEPTION 'Ligne introuvable dans ce devis'; END IF;
        IF ch - 'incluse' <> '{}'::jsonb THEN PERFORM devis_ligne_enregistrer(_devis_id, (ch - 'incluse') || jsonb_build_object('id', v_id)); END IF;
        IF ch ? 'incluse' THEN PERFORM devis_option_inclure(v_id, (ch->>'incluse')::boolean); END IF;
        mj_l := mj_l + 1;
      ELSIF e->>'cible' = 'heure' THEN
        FOR k IN SELECT jsonb_object_keys(ch) LOOP IF NOT k = ANY(c_heure) THEN RAISE EXCEPTION 'Champ non modifiable : %', k; END IF; END LOOP;
        SELECT h2.ligne_id INTO lid FROM devis_heures h2 JOIN devis_lignes l ON l.id=h2.ligne_id WHERE h2.id=v_id AND l.devis_id=_devis_id AND h2.supprime_le IS NULL AND l.supprime_le IS NULL;
        IF lid IS NULL THEN RAISE EXCEPTION 'Ligne d''heures introuvable dans ce devis'; END IF;
        PERFORM devis_heure_enregistrer(lid, ch || jsonb_build_object('id', v_id));
        mj_h := mj_h + 1;
      ELSIF e->>'cible' = 'materiau' THEN
        FOR k IN SELECT jsonb_object_keys(ch) LOOP IF NOT k = ANY(c_mat) THEN RAISE EXCEPTION 'Champ non modifiable : %', k; END IF; END LOOP;
        SELECT m2.ligne_id, m2.materiau_id, m2.quantite, m2.coefficient, m2.ordre INTO o
          FROM devis_materiaux m2 JOIN devis_lignes l ON l.id=m2.ligne_id WHERE m2.id=v_id AND l.devis_id=_devis_id AND m2.supprime_le IS NULL AND l.supprime_le IS NULL;
        IF o.ligne_id IS NULL THEN RAISE EXCEPTION 'Matériau introuvable dans ce devis'; END IF;
        IF ch ? 'materiau_id' AND NULLIF(ch->>'materiau_id','')::uuid IS DISTINCT FROM o.materiau_id THEN
          -- changement de référence catalogue : l'ancienne ligne part à la corbeille, la nouvelle reprend quantité, coefficient et place
          IF NULLIF(ch->>'materiau_id','') IS NULL THEN RAISE EXCEPTION 'materiau_id vide'; END IF;
          PERFORM devis_element_supprimer('materiau', v_id);
          PERFORM devis_materiau_enregistrer(o.ligne_id, jsonb_build_object('materiau_id', ch->>'materiau_id',
            'quantite', coalesce((ch->>'quantite')::numeric, o.quantite), 'coefficient', coalesce((ch->>'coefficient')::numeric, o.coefficient), 'ordre', o.ordre));
        ELSE
          PERFORM devis_materiau_enregistrer(o.ligne_id, (ch - 'materiau_id') || jsonb_build_object('id', v_id));
        END IF;
        mj_m := mj_m + 1;
      ELSIF e->>'cible' = 'libre' THEN
        FOR k IN SELECT jsonb_object_keys(ch) LOOP IF NOT k = ANY(c_libre) THEN RAISE EXCEPTION 'Champ non modifiable : %', k; END IF; END LOOP;
        SELECT f2.ligne_id INTO lid FROM devis_lignes_libres f2 JOIN devis_lignes l ON l.id=f2.ligne_id WHERE f2.id=v_id AND l.devis_id=_devis_id AND f2.supprime_le IS NULL AND l.supprime_le IS NULL;
        IF lid IS NULL THEN RAISE EXCEPTION 'Ligne libre introuvable dans ce devis'; END IF;
        PERFORM devis_libre_enregistrer(lid, ch || jsonb_build_object('id', v_id));
        mj_f := mj_f + 1;
      ELSE RAISE EXCEPTION 'cible inconnue « % » (ligne, heure, materiau ou libre)', coalesce(e->>'cible','?');
      END IF;
      lid := NULL;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Modification % : % — rien n''a été écrit', i, SQLERRM;
    END;
  END LOOP;

  -- 2. Suppressions logiques (restaurables dans la corbeille de l'éditeur)
  i := 0;
  FOR e IN SELECT value FROM jsonb_array_elements(v_sups) LOOP
    i := i + 1;
    BEGIN
      v_id := NULLIF(e->>'id','')::uuid;
      IF v_id IS NULL THEN RAISE EXCEPTION 'id obligatoire'; END IF;
      IF e->>'cible' = 'ligne' THEN
        IF NOT EXISTS (SELECT 1 FROM devis_lignes WHERE id=v_id AND devis_id=_devis_id AND supprime_le IS NULL) THEN RAISE EXCEPTION 'Ligne introuvable dans ce devis (ou déjà supprimée)'; END IF;
        groupes := groupes || to_jsonb(devis_ligne_supprimer(v_id, 'avec_contenu', NULL));
        sp_l := sp_l + 1;
      ELSIF e->>'cible' IN ('heure','materiau','libre') THEN
        IF NOT EXISTS (
          SELECT 1 FROM devis_lignes l WHERE l.devis_id=_devis_id AND l.supprime_le IS NULL AND l.id = CASE e->>'cible'
            WHEN 'heure' THEN (SELECT ligne_id FROM devis_heures WHERE id=v_id AND supprime_le IS NULL)
            WHEN 'materiau' THEN (SELECT ligne_id FROM devis_materiaux WHERE id=v_id AND supprime_le IS NULL)
            ELSE (SELECT ligne_id FROM devis_lignes_libres WHERE id=v_id AND supprime_le IS NULL) END)
        THEN RAISE EXCEPTION 'Élément introuvable dans ce devis (ou déjà supprimé)'; END IF;
        PERFORM devis_element_supprimer(e->>'cible', v_id);
        IF e->>'cible'='heure' THEN sp_h := sp_h + 1; ELSIF e->>'cible'='materiau' THEN sp_m := sp_m + 1; ELSE sp_f := sp_f + 1; END IF;
      ELSE RAISE EXCEPTION 'cible inconnue « % » (ligne, heure, materiau ou libre)', coalesce(e->>'cible','?');
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Suppression % : % — rien n''a été écrit', i, SQLERRM;
    END;
  END LOOP;

  -- 3. Ajouts (et compléments d'une ligne existante via ligne_id)
  i := 0;
  FOR e IN SELECT value FROM jsonb_array_elements(_lignes) LOOP
    i := i + 1;
    BEGIN
      v_parent := NULLIF(e->>'parent_id','')::uuid;
      IF e ? 'parent_ref' THEN
        v_parent := NULLIF(refs->>(e->>'parent_ref'),'')::uuid;
        IF v_parent IS NULL THEN RAISE EXCEPTION 'parent_ref inconnu « % »', e->>'parent_ref'; END IF;
      END IF;
      IF NULLIF(e->>'ligne_id','') IS NOT NULL THEN
        lid := (e->>'ligne_id')::uuid;
        IF NOT EXISTS (SELECT 1 FROM devis_lignes WHERE id=lid AND devis_id=_devis_id AND supprime_le IS NULL) THEN RAISE EXCEPTION 'Ligne existante introuvable'; END IF;
        ch := e - 'id' - 'ref' - 'parent_ref' - 'parent_id' - 'ligne_id' - 'type' - 'heures' - 'materiaux' - 'libres' - 'incluse';
        FOR k IN SELECT jsonb_object_keys(ch) LOOP IF NOT k = ANY(c_ligne) THEN RAISE EXCEPTION 'Champ non modifiable : %', k; END IF; END LOOP;
        IF ch <> '{}'::jsonb THEN PERFORM devis_ligne_enregistrer(_devis_id, ch || jsonb_build_object('id', lid)); mj_l := mj_l + 1; END IF;
      ELSE
        IF NULLIF(e->>'type','') IS NULL THEN RAISE EXCEPTION 'type ou ligne_id obligatoire'; END IF;
        lid := devis_ligne_enregistrer(_devis_id, (e - 'id' - 'ref' - 'parent_ref' - 'ligne_id' - 'heures' - 'materiaux' - 'libres' - 'incluse')
                 || jsonb_build_object('parent_id', v_parent));
        nb_l := nb_l + 1;
      END IF;
      IF e ? 'ref' THEN refs := refs || jsonb_build_object(e->>'ref', lid); END IF;
      IF e ? 'incluse' THEN PERFORM devis_option_inclure(lid, (e->>'incluse')::boolean); END IF;
      FOR h IN SELECT value FROM jsonb_array_elements(coalesce(e->'heures','[]'::jsonb)) LOOP
        v_id := NULLIF(h->>'id','')::uuid;
        IF v_id IS NOT NULL THEN
          IF NOT EXISTS (SELECT 1 FROM devis_heures WHERE id=v_id AND ligne_id=lid AND supprime_le IS NULL) THEN RAISE EXCEPTION 'Ligne d''heures introuvable sur cette ligne'; END IF;
          PERFORM devis_heure_enregistrer(lid, (h - 'id' - 'poste' - 'poste_id') || jsonb_build_object('id', v_id));
          mj_h := mj_h + 1; CONTINUE;
        END IF;
        v_poste := NULLIF(h->>'poste_id','')::uuid;
        IF v_poste IS NULL THEN SELECT id INTO v_poste FROM devis_postes_ref WHERE code=h->>'poste' AND actif; END IF;
        IF v_poste IS NULL THEN RAISE EXCEPTION 'Poste inconnu « % »', coalesce(h->>'poste','?'); END IF;
        -- même poste + niveau déjà présent sur la ligne : mise à jour au lieu d'un doublon
        v_niv := coalesce(NULLIF(h->>'niveau',''),
          (SELECT niveau FROM v_devis_taux_courants WHERE poste_id=v_poste AND par_defaut LIMIT 1),
          (SELECT niveau FROM v_devis_taux_courants WHERE poste_id=v_poste ORDER BY niveau LIMIT 1), 'standard');
        SELECT id INTO v_id FROM devis_heures WHERE ligne_id=lid AND poste_id=v_poste AND niveau=v_niv AND supprime_le IS NULL ORDER BY ordre, created_at LIMIT 1;
        IF v_id IS NOT NULL THEN
          PERFORM devis_heure_enregistrer(lid, (h - 'id' - 'poste' - 'poste_id' - 'niveau') || jsonb_build_object('id', v_id));
          mj_h := mj_h + 1;
        ELSE
          PERFORM devis_heure_enregistrer(lid, (h - 'id' - 'poste') || jsonb_build_object('poste_id', v_poste, 'niveau', v_niv));
          nb_h := nb_h + 1;
        END IF;
      END LOOP;
      FOR m IN SELECT value FROM jsonb_array_elements(coalesce(e->'materiaux','[]'::jsonb)) LOOP
        PERFORM devis_materiau_enregistrer(lid, m - 'id'); nb_m := nb_m + 1;
      END LOOP;
      FOR f IN SELECT value FROM jsonb_array_elements(coalesce(e->'libres','[]'::jsonb)) LOOP
        IF f ? 'poste_info' THEN
          SELECT id INTO v_poste FROM devis_postes_ref WHERE code=f->>'poste_info' AND actif;
          IF v_poste IS NULL THEN RAISE EXCEPTION 'Poste inconnu « % »', f->>'poste_info'; END IF;
          f := (f - 'poste_info') || jsonb_build_object('poste_info_id', v_poste);
        END IF;
        PERFORM devis_libre_enregistrer(lid, f - 'id'); nb_f := nb_f + 1;
      END LOOP;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Élément % du lot : % — rien n''a été écrit', i, SQLERRM;
    END;
  END LOOP;
  RETURN jsonb_build_object('refs', refs,
    'ajouts', jsonb_build_object('lignes',nb_l,'heures',nb_h,'materiaux',nb_m,'libres',nb_f),
    'mises_a_jour', jsonb_build_object('lignes',mj_l,'heures',mj_h,'materiaux',mj_m,'libres',mj_f),
    'suppressions', jsonb_build_object('lignes',sp_l,'heures',sp_h,'materiaux',sp_m,'libres',sp_f,'groupes_corbeille',groupes),
    'calcul', devis_calculer(_devis_id));
END $$;
REVOKE EXECUTE ON FUNCTION public.devis_remplir_lot(uuid,jsonb,jsonb) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.devis_remplir_lot(uuid,jsonb,jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.devis_remplir_lot(_devis_id uuid, _lignes jsonb)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.devis_remplir_lot(_devis_id, _lignes, '{}'::jsonb);
$$;

CREATE OR REPLACE FUNCTION public.devis_mcp_appliquer(_tool text, _p jsonb, _affaire_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public' AS $$
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
END $$;

CREATE OR REPLACE FUNCTION public.devis_mcp_simuler(_tool text, _payload jsonb, _affaire_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE cap text; a public.affaires; v_devis uuid := NULLIF(_payload->>'devis_id','')::uuid; v_after uuid; avant jsonb; apres jsonb; res jsonb;
        snap text; c_av jsonb; c_ap jsonb; ecarts jsonb; msg text; det text;
BEGIN
  IF _tool NOT IN ('devis_creer_brouillon','devis_remplir','devis_modifier_entete','devis_ajouter_photo','devis_nouvelle_version','devis_soumettre') THEN RAISE EXCEPTION 'Outil devis interdit'; END IF;
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
END $$;

CREATE OR REPLACE FUNCTION public.materiaux_rechercher(_q text, _familles text[] DEFAULT NULL::text[], _fournisseurs uuid[] DEFAULT NULL::uuid[], _epaisseur numeric DEFAULT NULL::numeric, _recent_seulement boolean DEFAULT false, _tri text DEFAULT 'pertinence'::text, _limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, fournisseur text, fournisseur_etat text, prix_public boolean, famille text, produit text, ref text, format_texte text, longueur_mm numeric, largeur_mm numeric, epaisseur_mm numeric, unite text, prix_achat_net numeric, prix_m2 numeric, prix_ml numeric, date_tarif date, remarque text, cle_comparaison text, moins_cher_du_groupe boolean, score real)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_q text := materiaux_norm(_q); v_rest text; s record; w text; alts text[];
        v_whole text[] := '{}'; v_pref text[] := '{}'; v_head text[] := '{}'; v_dims text[]; v_nums numeric[]; v_n int; v_any text[] := '{}'; v_anyre text;
        v_couts boolean := current_user_has_capability('devis.couts'); v_ep numeric; v_sec numeric[];
BEGIN
  IF NOT (current_user_has_capability('devis.rediger') OR current_user_has_capability('devis.parametres')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  v_rest := ' '||v_q||' ';
  FOR s IN SELECT ms.terme, ms.groupe FROM materiaux_synonymes ms WHERE position(' ' in ms.terme) > 0 ORDER BY length(ms.terme) DESC LOOP
    IF position(' '||s.terme||' ' in v_rest) > 0 THEN
      v_rest := replace(v_rest, ' '||s.terme||' ', ' ');
      SELECT array_agg(replace(x.terme,'.','\.')) INTO alts FROM materiaux_synonymes x WHERE x.groupe = s.groupe;
      v_whole := v_whole || ('(^| )('||array_to_string(alts,'|')||')( |$)');
      v_head := v_head || ('^('||array_to_string(alts,'|')||')(s|x)?( |$)');
      v_pref := v_pref || coalesce('(^| )('||(SELECT string_agg(a,'|') FROM unnest(alts) a WHERE length(a) > 3)||')', '$^');
      IF (SELECT bool_and(length(a) >= 3) FROM unnest(alts) a) THEN v_any := v_any || alts; END IF;
    END IF;
  END LOOP;
  v_rest := trim(v_rest);
  -- épaisseur explicite : « 19 mm », « ep 19 », « épaisseur 19 »
  v_ep := coalesce((regexp_match(v_rest, '(?:^| )(\d+(?:\.\d+)?) mm(?: |$)'))[1], (regexp_match(v_rest, '(?:^| )(?:ep|epaisseur|epais) (\d+(?:\.\d+)?)(?: |$)'))[1])::numeric;
  v_rest := trim(regexp_replace(regexp_replace(' '||v_rest||' ', ' (ep|epaisseur|epais) (?=\d)', ' ', 'g'), '(\d) mm(?= )', '\1', 'g'));
  SELECT array_agg(t) INTO v_dims FROM regexp_split_to_table(v_rest,'\s+') t WHERE t ~ '^\d+(\.\d+)?(x\d+(\.\d+)?){1,2}$';
  -- section AxB (BxA accepté) : filtre fort si le catalogue la contient, sinon tri par section la plus proche
  SELECT ARRAY[(string_to_array(d,'x'))[1]::numeric, (string_to_array(d,'x'))[2]::numeric] INTO v_sec
    FROM unnest(v_dims) d WHERE cardinality(string_to_array(d,'x')) = 2 LIMIT 1;
  SELECT array_agg(n::numeric) INTO v_nums FROM regexp_split_to_table(v_rest,'[\sx]+') n WHERE n ~ '^\d+(\.\d+)?$';
  FOR w IN SELECT t FROM regexp_split_to_table(v_rest,'\s+') t WHERE length(t) > 1 AND t !~ '^[0-9.x]+$' LOOP
    SELECT array_agg(replace(b.terme,'.','\.')) INTO alts FROM materiaux_synonymes a JOIN materiaux_synonymes b ON b.groupe = a.groupe WHERE a.terme = w;
    alts := coalesce(alts, ARRAY[replace(w,'.','\.')]);
    v_whole := v_whole || ('(^| )('||array_to_string(alts,'|')||')( |$)');
    v_head := v_head || ('^('||array_to_string(alts,'|')||')(s|x)?( |$)');
    v_pref := v_pref || coalesce('(^| )('||(SELECT string_agg(a,'|') FROM unnest(alts) a WHERE length(a) > 3)||')', '$^');
    IF (SELECT bool_and(length(a) >= 3) FROM unnest(alts) a) THEN v_any := v_any || alts; END IF;
  END LOOP;
  v_n := coalesce(cardinality(v_whole), 0);
  -- préfiltre indexé (trigrammes) sur les termes d'au moins 3 lettres, ou ressemblance globale
  v_anyre := CASE WHEN v_n > 0 AND cardinality(v_any) > 0 THEN array_to_string(v_any,'|') END;

  RETURN QUERY
  WITH base AS (
    SELECT m.*, f.nom AS fnom, f.etat AS fetat, f.prix_public AS fpub,
      (SELECT count(*) FROM generate_subscripts(v_whole,1) i WHERE m.search_norm ~ v_whole[i])::int AS n_whole,
      (SELECT count(*) FROM generate_subscripts(v_whole,1) i WHERE m.search_norm ~ v_whole[i] OR m.search_norm ~ v_pref[i])::int AS n_any,
      (SELECT count(*) FROM generate_subscripts(v_whole,1) i WHERE m.produit_norm ~ v_whole[i] OR m.produit_norm ~ v_pref[i])::int AS n_prod,
      EXISTS (SELECT 1 FROM unnest(v_head) h WHERE m.produit_norm ~ h) AS tete
    FROM materiaux_catalogue m JOIN fournisseurs_tarifs f ON f.id = m.fournisseur_id
    WHERE m.actif
      AND (v_anyre IS NULL OR m.search_norm ~ v_anyre OR m.search_norm %> v_q)
      AND (_familles IS NULL OR m.famille = ANY(_familles))
      AND (_fournisseurs IS NULL OR m.fournisseur_id = ANY(_fournisseurs))
      AND (_epaisseur IS NULL OR m.epaisseur_mm = _epaisseur)
      AND (NOT coalesce(_recent_seulement,false) OR f.etat = 'ok')
      AND (v_nums IS NULL OR EXISTS (SELECT 1 FROM unnest(v_nums) n WHERE n IN (m.epaisseur_mm,m.longueur_mm,m.largeur_mm)
             OR m.search_norm ~ ('(^|[^0-9.])'||replace(trim_scale(n)::text,'.','\.')||'([^0-9.]|$)')))
  ), b2 AS (
    SELECT b.*,
      CASE WHEN v_sec IS NULL THEN NULL ELSE
        b.search_norm ~ ('(^|[^0-9.x])('||replace(trim_scale(v_sec[1])::text,'.','\.')||'x'||replace(trim_scale(v_sec[2])::text,'.','\.')||'|'
                                       ||replace(trim_scale(v_sec[2])::text,'.','\.')||'x'||replace(trim_scale(v_sec[1])::text,'.','\.')||')([^0-9.]|$)') END AS sec_ok,
      CASE WHEN v_sec IS NULL THEN NULL ELSE
        (SELECT min(least(abs(x[1]::numeric - v_sec[1]) + abs(x[2]::numeric - v_sec[2]), abs(x[1]::numeric - v_sec[2]) + abs(x[2]::numeric - v_sec[1])))
           FROM regexp_matches(b.search_norm, '(?:^|[^0-9.x])(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)', 'g') x) END AS sec_dist
    FROM base b
  ), b3 AS (
    SELECT b2.*, coalesce(bool_or(b2.sec_ok) OVER (), false) AS sec_existe,
           coalesce(bool_or(b2.epaisseur_mm = v_ep) OVER (), false) AS ep_existe FROM b2
  ), c AS (
    SELECT b.*,
      ( b.n_whole + (b.n_any - b.n_whole) * 0.6
        + b.n_prod * 0.4 + CASE WHEN b.tete THEN 0.5 ELSE 0 END
        + word_similarity(v_q, b.search_norm) * 0.5
        + coalesce((SELECT count(*) FROM unnest(v_nums) n WHERE b.epaisseur_mm = n),0) * 1.0
        + coalesce((SELECT count(*) FROM unnest(v_nums) n WHERE n IN (b.longueur_mm, b.largeur_mm)),0) * 0.5
        + coalesce((SELECT sum(
            CASE WHEN cardinality(p) = 2 THEN
              CASE WHEN b.search_norm ~ ('(^|[^0-9.x])'||p[1]||'x'||p[2]||'([^0-9.x]|$)') THEN 4
                   WHEN b.search_norm ~ ('(^|[^0-9.x])'||p[2]||'x'||p[1]||'([^0-9.x]|$)') THEN 3 ELSE 0 END
            ELSE
              CASE WHEN b.search_norm ~ ('(^|[^0-9.x])'||p[1]||'x'||p[2]||'x'||p[3]||'([^0-9.]|$)') THEN 5
                   WHEN b.epaisseur_mm = replace(p[3],'\.','.')::numeric
                        AND b.search_norm ~ ('(^|[^0-9.x])('||p[1]||'x'||p[2]||'|'||p[2]||'x'||p[1]||')([^0-9.x]|$)') THEN 5
                   WHEN p[1] = p[2] AND b.search_norm ~ '(^| )carre'
                        AND (b.epaisseur_mm = replace(p[3],'\.','.')::numeric OR b.search_norm ~ ('(^|[^0-9.x])'||p[1]||'x'||p[3]||'([^0-9.]|$)')) THEN 4.5
                   ELSE 0 END
            END)
          FROM (SELECT string_to_array(replace(d,'.','\.'),'x') p FROM unnest(v_dims) d) dd), 0)
        - CASE WHEN b.fetat = 'ancien' THEN 0.3 ELSE 0 END
        + CASE WHEN v_ep IS NOT NULL AND b.epaisseur_mm = v_ep THEN 2 ELSE 0 END
        + CASE WHEN b.sec_ok THEN 4 WHEN v_sec IS NOT NULL THEN - least(coalesce(b.sec_dist, 60), 60) * 0.05 ELSE 0 END
      )::real AS sc
    FROM b3 b
    WHERE (v_n = 0 OR b.n_any >= greatest(1, v_n - 1) OR b.search_norm %> v_q)
      AND (NOT b.sec_existe OR b.sec_ok)
      AND (v_ep IS NULL OR NOT b.ep_existe OR b.epaisseur_mm IS NULL OR b.epaisseur_mm = v_ep)
  )
  SELECT c.id,c.fnom,c.fetat,c.fpub,c.famille,c.produit,c.ref,c.format_texte,c.longueur_mm,c.largeur_mm,c.epaisseur_mm,c.unite,
    CASE WHEN v_couts THEN c.prix_achat_net END, CASE WHEN v_couts THEN c.prix_m2 END, CASE WHEN v_couts THEN c.prix_ml END,
    c.date_tarif,c.remarque,c.cle_comparaison,
    (c.cle_comparaison IS NOT NULL AND c.prix_m2 IS NOT NULL AND c.prix_m2 = min(c.prix_m2) OVER (PARTITION BY c.cle_comparaison)
       AND count(*) OVER (PARTITION BY c.cle_comparaison) > 1),
    c.sc
  FROM c
  ORDER BY CASE WHEN _tri='prix' THEN c.prix_achat_net END ASC NULLS LAST,
           CASE WHEN _tri='m2' THEN coalesce(c.prix_m2,c.prix_ml) END ASC NULLS LAST,
           c.sc DESC, c.prix_m2 ASC NULLS LAST
  LIMIT least(coalesce(_limit,50),100);
END $function$;