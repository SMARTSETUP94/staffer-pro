ALTER TABLE public.devis_lignes ADD COLUMN deplace_groupe uuid, ADD COLUMN parent_avant uuid;
ALTER TABLE public.devis_materiaux ADD COLUMN created_by uuid DEFAULT auth.uid();

-- ===== Droits =====
CREATE FUNCTION public.devis_peut_valider(_devis_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT is_admin() OR EXISTS (SELECT 1 FROM devis d JOIN affaires a ON a.id=d.affaire_id
     WHERE d.id=_devis_id AND a.charge_affaires_id=auth.uid() AND current_user_has_capability('devis.rediger')) $$;

CREATE FUNCTION public.devis_peut_ecrire(_devis_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM devis d WHERE d.id=_devis_id AND d.redige_dans_staffing AND (
    (d.est_modele AND current_user_has_capability('devis.parametres'))
    OR (NOT d.est_modele AND user_can_write_affaire(d.affaire_id,'devis.rediger')))) $$;

CREATE FUNCTION public.devis_assert_ecriture(_devis_id uuid, _brouillon boolean DEFAULT true) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM mcp_assert_legacy_oauth_write('devis');
  IF NOT devis_peut_ecrire(_devis_id) THEN RAISE EXCEPTION 'Droits insuffisants sur ce devis' USING ERRCODE='42501'; END IF;
  IF _brouillon THEN PERFORM devis_assert_brouillon(_devis_id); END IF;
  PERFORM set_config('app.devis_rpc','on',true);
END $$;

CREATE FUNCTION public.devis_de_ligne(_ligne_id uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT devis_id FROM devis_lignes WHERE id=_ligne_id $$;

-- ===== Copie de sous-arbre (création depuis modèle, duplication, nouvelle version) =====
CREATE FUNCTION public.devis_copier_sous_arbre(_src_devis uuid, _dst_devis uuid, _racine uuid, _parent_dst uuid, _reevaluer boolean, _ordre numeric DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rec record; v_map jsonb := '{}'; v_new uuid; v_parent uuid; v_coef numeric;
BEGIN
  SELECT coef_materiaux_defaut INTO v_coef FROM devis WHERE id=_dst_devis;
  FOR rec IN
    WITH RECURSIVE t AS (
      SELECT l.id, l.parent_id, 0 AS depth, l.ordre FROM devis_lignes l
      WHERE l.devis_id=_src_devis AND l.supprime_le IS NULL AND (CASE WHEN _racine IS NULL THEN l.parent_id IS NULL ELSE l.id=_racine END)
      UNION ALL
      SELECT c.id, c.parent_id, t.depth+1, c.ordre FROM devis_lignes c JOIN t ON c.parent_id=t.id WHERE c.supprime_le IS NULL)
    SELECT t.id, t.parent_id, t.depth FROM t ORDER BY t.depth, t.ordre
  LOOP
    v_parent := CASE WHEN rec.depth=0 THEN _parent_dst ELSE (v_map->>rec.parent_id::text)::uuid END;
    INSERT INTO devis_lignes(devis_id,parent_id,type,ordre,libelle,quantite,descriptif_client,longueur_mm,largeur_mm,hauteur_mm,finition,texte,interne,source_ligne_id)
    SELECT _dst_devis,v_parent,type,CASE WHEN rec.depth=0 AND _ordre IS NOT NULL THEN _ordre ELSE ordre END,libelle,quantite,descriptif_client,longueur_mm,largeur_mm,hauteur_mm,finition,texte,interne,id
    FROM devis_lignes WHERE id=rec.id RETURNING id INTO v_new;
    v_map := v_map || jsonb_build_object(rec.id::text, v_new);

    INSERT INTO devis_heures(ligne_id,poste_id,niveau,heures,par_unite,taux_vente,taux_grille,cout_revient,ordre)
    SELECT v_new,h.poste_id,h.niveau,h.heures,h.par_unite,
      CASE WHEN _reevaluer THEN coalesce(g.taux_vente,h.taux_vente) ELSE h.taux_vente END,
      CASE WHEN _reevaluer THEN coalesce(g.taux_vente,h.taux_grille) ELSE h.taux_grille END,
      CASE WHEN _reevaluer THEN coalesce(g.cout_revient,h.cout_revient) ELSE h.cout_revient END, h.ordre
    FROM devis_heures h LEFT JOIN v_devis_taux_courants g ON g.poste_id=h.poste_id AND g.niveau=h.niveau
    WHERE h.ligne_id=rec.id AND h.supprime_le IS NULL;

    INSERT INTO devis_materiaux(ligne_id,materiau_id,designation,fournisseur,ref,unite,quantite,aide_conversion,prix_achat,date_tarif,coefficient,propose_catalogue,ordre)
    SELECT v_new, coalesce(CASE WHEN _reevaluer THEN c.id END, m.materiau_id), m.designation,m.fournisseur,m.ref,m.unite,m.quantite,m.aide_conversion,
      CASE WHEN _reevaluer AND c.prix_achat_net IS NOT NULL THEN c.prix_achat_net ELSE m.prix_achat END,
      CASE WHEN _reevaluer AND c.id IS NOT NULL THEN c.date_tarif ELSE m.date_tarif END,
      m.coefficient, m.propose_catalogue, m.ordre
    FROM devis_materiaux m
    LEFT JOIN materiaux_catalogue o ON o.id=m.materiau_id
    LEFT JOIN LATERAL (SELECT c2.* FROM materiaux_catalogue c2 WHERE c2.actif AND c2.fournisseur_id=o.fournisseur_id
                       AND (c2.id=o.id OR (o.ref IS NOT NULL AND c2.ref=o.ref)) ORDER BY (c2.id=o.id) DESC LIMIT 1) c ON true
    WHERE m.ligne_id=rec.id AND m.supprime_le IS NULL;

    INSERT INTO devis_lignes_libres(ligne_id,categorie,forfait_cle,designation,unite,quantite,prix_achat,prix_forfait,coefficient,par_unite,ordre)
    SELECT v_new,f.categorie,f.forfait_cle,f.designation,f.unite,f.quantite,f.prix_achat,
      CASE WHEN _reevaluer AND f.forfait_cle IS NOT NULL THEN coalesce((SELECT valeur FROM v_devis_parametres_courants WHERE cle=f.forfait_cle),f.prix_forfait) ELSE f.prix_forfait END,
      f.coefficient,f.par_unite,f.ordre
    FROM devis_lignes_libres f WHERE f.ligne_id=rec.id AND f.supprime_le IS NULL;

    INSERT INTO devis_photos(devis_id,ligne_id,storage_path,thumb_path,mime,width,height,size_bytes,legende,visible_client,ordre)
    SELECT _dst_devis,v_new,storage_path,thumb_path,mime,width,height,size_bytes,legende,visible_client,ordre
    FROM devis_photos WHERE ligne_id=rec.id AND deleted_at IS NULL;
  END LOOP;
  RETURN CASE WHEN _racine IS NULL THEN NULL ELSE (v_map->>_racine::text)::uuid END;
END $$;

-- ===== Création / versions / liste =====
CREATE FUNCTION public.devis_creer(_affaire_id uuid, _modele_id uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
  RETURN v_id;
END $$;

CREATE FUNCTION public.devis_nouvelle_version(_devis_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s record; v_version int; v_id uuid;
BEGIN
  PERFORM devis_assert_ecriture(_devis_id, false);
  SELECT * INTO s FROM devis WHERE id=_devis_id;
  IF s.est_modele THEN RAISE EXCEPTION 'Un modèle ne se versionne pas'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('devis_version:'||s.affaire_id::text));
  SELECT coalesce(max(version),0)+1 INTO v_version FROM devis WHERE affaire_id=s.affaire_id AND redige_dans_staffing AND NOT est_modele;
  INSERT INTO devis(affaire_id,numero,libelle,statut,redige_dans_staffing,version,version_precedente_id,statut_redaction,client_id,contact_id,
                    client_final_id,date_devis,validite_jours,tva_pct,coef_materiaux_defaut,modele_origine_id,auteur_id)
  VALUES(s.affaire_id, regexp_replace(s.numero,'-R\d+$','')||'-R'||v_version, s.libelle,'brouillon',true,v_version,s.id,'brouillon',
         s.client_id,s.contact_id,s.client_final_id,current_date,s.validite_jours,s.tva_pct,s.coef_materiaux_defaut,s.modele_origine_id,auth.uid())
  RETURNING id INTO v_id;
  PERFORM devis_copier_sous_arbre(_devis_id, v_id, NULL, NULL, false);
  RETURN v_id;
END $$;

CREATE FUNCTION public.devis_lister(_affaire_id uuid)
RETURNS TABLE(id uuid, numero text, version int, statut_redaction devis_redaction_statut, total_ht numeric, date_devis date,
              auteur text, modele_origine text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT d.id,d.numero,d.version,d.statut_redaction,
    coalesce((d.totaux_snapshot->>'total_ht')::numeric,(devis_calculer_interne(d.id)->>'total_ht')::numeric),
    d.date_devis,(SELECT coalesce(p.full_name,p.email) FROM profiles p WHERE p.id=d.auteur_id),
    (SELECT m.modele_nom FROM devis m WHERE m.id=d.modele_origine_id), d.created_at
  FROM devis d WHERE d.affaire_id=_affaire_id AND d.redige_dans_staffing AND NOT d.est_modele AND devis_peut_lire(d.id)
  ORDER BY d.version DESC $$;

-- ===== Lecture =====
CREATE FUNCTION public.devis_lire(_devis_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
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
    'materiaux', (SELECT coalesce(jsonb_agg((to_jsonb(m) - CASE WHEN v_c THEN 'x' ELSE 'prix_achat' END) ORDER BY m.ordre,m.created_at),'[]')
        FROM devis_materiaux m JOIN devis_lignes l ON l.id=m.ligne_id WHERE l.devis_id=_devis_id AND m.supprime_le IS NULL),
    'libres', (SELECT coalesce(jsonb_agg((to_jsonb(f) - CASE WHEN v_c THEN 'x' ELSE 'prix_achat' END) ORDER BY f.ordre,f.created_at),'[]')
        FROM devis_lignes_libres f JOIN devis_lignes l ON l.id=f.ligne_id WHERE l.devis_id=_devis_id AND f.supprime_le IS NULL),
    'photos', (SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.ordre,p.uploaded_at),'[]') FROM devis_photos p WHERE p.devis_id=_devis_id AND p.deleted_at IS NULL),
    'calcul', devis_calculer(_devis_id),
    'droits', jsonb_build_object('couts',v_c,'ecrire',devis_peut_ecrire(_devis_id),'valider',devis_peut_valider(_devis_id),'parametres',current_user_has_capability('devis.parametres')),
    'parametres', (SELECT coalesce(jsonb_object_agg(cle,valeur),'{}') FROM v_devis_parametres_courants));
  RETURN v;
END $$;

CREATE FUNCTION public.devis_lire_client(_devis_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE d record; v_calc jsonb; v_dates jsonb;
BEGIN
  IF NOT devis_peut_lire(_devis_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO d FROM devis WHERE id=_devis_id;
  v_calc := coalesce(d.totaux_snapshot, devis_calculer_interne(_devis_id));
  v_dates := coalesce(d.dates_snapshot, (SELECT jsonb_build_object('date_opportunite',a.created_at::date,'date_devis',d.date_devis,
      'date_visite_technique',a.date_visite_technique,'date_montage',a.date_montage,'date_evenement_debut',a.date_evenement_debut,
      'date_evenement_fin',a.date_evenement_fin,'date_demontage',a.date_demontage) FROM affaires a WHERE a.id=d.affaire_id));
  RETURN jsonb_build_object(
    'numero',d.numero,'libelle',d.libelle,'date_devis',d.date_devis,'validite_jours',d.validite_jours,
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
END $$;

-- ===== En-tête et dates =====
CREATE FUNCTION public.devis_entete_modifier(_devis_id uuid, _patch jsonb, _maj_affaire_client boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
END $$;

CREATE FUNCTION public.devis_dates_modifier(_devis_id uuid, _patch jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_aff uuid;
BEGIN
  PERFORM devis_assert_ecriture(_devis_id);
  SELECT affaire_id INTO v_aff FROM devis WHERE id=_devis_id;
  IF v_aff IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(_patch) k WHERE k NOT IN ('date_visite_technique','date_montage','date_evenement_debut','date_evenement_fin','date_demontage')) THEN
    RAISE EXCEPTION 'Champ de date non autorisé'; END IF;
  UPDATE affaires SET
    date_visite_technique = CASE WHEN _patch ? 'date_visite_technique' THEN NULLIF(_patch->>'date_visite_technique','')::date ELSE date_visite_technique END,
    date_montage = CASE WHEN _patch ? 'date_montage' THEN NULLIF(_patch->>'date_montage','')::date ELSE date_montage END,
    date_evenement_debut = CASE WHEN _patch ? 'date_evenement_debut' THEN NULLIF(_patch->>'date_evenement_debut','')::date ELSE date_evenement_debut END,
    date_evenement_fin = CASE WHEN _patch ? 'date_evenement_fin' THEN NULLIF(_patch->>'date_evenement_fin','')::date ELSE date_evenement_fin END,
    date_demontage = CASE WHEN _patch ? 'date_demontage' THEN NULLIF(_patch->>'date_demontage','')::date ELSE date_demontage END,
    updated_at = now()
  WHERE id=v_aff;
END $$;

-- ===== Arbre =====
CREATE FUNCTION public.devis_ligne_enregistrer(_devis_id uuid, _l jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid := NULLIF(_l->>'id','')::uuid; v_parent uuid := NULLIF(_l->>'parent_id','')::uuid;
BEGIN
  PERFORM devis_assert_ecriture(_devis_id);
  IF v_parent IS NOT NULL AND NOT EXISTS (SELECT 1 FROM devis_lignes WHERE id=v_parent AND devis_id=_devis_id AND supprime_le IS NULL) THEN
    RAISE EXCEPTION 'Parent invalide'; END IF;
  IF v_id IS NULL THEN
    INSERT INTO devis_lignes(devis_id,parent_id,type,ordre,libelle,quantite,descriptif_client,longueur_mm,largeur_mm,hauteur_mm,finition,texte,interne)
    VALUES(_devis_id,v_parent,(_l->>'type')::devis_ligne_type,
      coalesce((_l->>'ordre')::numeric,(SELECT coalesce(max(ordre),0)+1 FROM devis_lignes WHERE devis_id=_devis_id AND parent_id IS NOT DISTINCT FROM v_parent)),
      _l->>'libelle',coalesce((_l->>'quantite')::numeric,1),_l->>'descriptif_client',(_l->>'longueur_mm')::numeric,(_l->>'largeur_mm')::numeric,
      (_l->>'hauteur_mm')::numeric,_l->>'finition',_l->>'texte',coalesce((_l->>'interne')::boolean,false))
    RETURNING id INTO v_id;
  ELSE
    UPDATE devis_lignes SET
      libelle = CASE WHEN _l ? 'libelle' THEN _l->>'libelle' ELSE libelle END,
      quantite = CASE WHEN _l ? 'quantite' THEN coalesce((_l->>'quantite')::numeric,1) ELSE quantite END,
      descriptif_client = CASE WHEN _l ? 'descriptif_client' THEN _l->>'descriptif_client' ELSE descriptif_client END,
      longueur_mm = CASE WHEN _l ? 'longueur_mm' THEN (_l->>'longueur_mm')::numeric ELSE longueur_mm END,
      largeur_mm = CASE WHEN _l ? 'largeur_mm' THEN (_l->>'largeur_mm')::numeric ELSE largeur_mm END,
      hauteur_mm = CASE WHEN _l ? 'hauteur_mm' THEN (_l->>'hauteur_mm')::numeric ELSE hauteur_mm END,
      finition = CASE WHEN _l ? 'finition' THEN _l->>'finition' ELSE finition END,
      texte = CASE WHEN _l ? 'texte' THEN _l->>'texte' ELSE texte END,
      interne = CASE WHEN _l ? 'interne' THEN coalesce((_l->>'interne')::boolean,false) ELSE interne END,
      updated_at = now()
    WHERE id=v_id AND devis_id=_devis_id AND supprime_le IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Ligne introuvable'; END IF;
  END IF;
  RETURN v_id;
END $$;

CREATE FUNCTION public.devis_ligne_deplacer(_ligne_id uuid, _parent_id uuid, _ordre numeric) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_d uuid := devis_de_ligne(_ligne_id);
BEGIN
  PERFORM devis_assert_ecriture(v_d);
  IF _parent_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM devis_lignes WHERE id=_parent_id AND devis_id=v_d AND supprime_le IS NULL) THEN RAISE EXCEPTION 'Parent invalide'; END IF;
    IF EXISTS (WITH RECURSIVE up AS (SELECT id,parent_id FROM devis_lignes WHERE id=_parent_id UNION ALL
               SELECT l.id,l.parent_id FROM devis_lignes l JOIN up ON l.id=up.parent_id) SELECT 1 FROM up WHERE id=_ligne_id) THEN
      RAISE EXCEPTION 'Impossible de déplacer une ligne dans elle-même'; END IF;
  END IF;
  UPDATE devis_lignes SET parent_id=_parent_id, ordre=coalesce(_ordre,ordre), updated_at=now() WHERE id=_ligne_id;
END $$;

CREATE FUNCTION public.devis_ligne_dupliquer(_ligne_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_d uuid := devis_de_ligne(_ligne_id); l record;
BEGIN
  PERFORM devis_assert_ecriture(v_d);
  SELECT * INTO l FROM devis_lignes WHERE id=_ligne_id;
  RETURN devis_copier_sous_arbre(v_d, v_d, _ligne_id, l.parent_id, false, l.ordre + 0.5);
END $$;

CREATE FUNCTION public.devis_ligne_supprimer(_ligne_id uuid, _mode text DEFAULT 'avec_contenu', _cible uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_d uuid := devis_de_ligne(_ligne_id); v_g uuid := gen_random_uuid();
BEGIN
  PERFORM devis_assert_ecriture(v_d);
  IF _mode='deplacer' THEN
    IF _cible IS NOT NULL AND (_cible=_ligne_id OR NOT EXISTS (SELECT 1 FROM devis_lignes WHERE id=_cible AND devis_id=v_d AND supprime_le IS NULL)) THEN
      RAISE EXCEPTION 'Zone cible invalide'; END IF;
    UPDATE devis_lignes SET parent_avant=parent_id, deplace_groupe=v_g, parent_id=_cible,
      ordre = ordre + (SELECT coalesce(max(ordre),0) FROM devis_lignes WHERE devis_id=v_d AND parent_id IS NOT DISTINCT FROM _cible)
    WHERE parent_id=_ligne_id AND supprime_le IS NULL;
    UPDATE devis_lignes SET supprime_le=now(), supprime_par=auth.uid(), suppression_groupe=v_g WHERE id=_ligne_id;
  ELSE
    WITH RECURSIVE t AS (SELECT id FROM devis_lignes WHERE id=_ligne_id UNION ALL
                         SELECT c.id FROM devis_lignes c JOIN t ON c.parent_id=t.id WHERE c.supprime_le IS NULL)
    UPDATE devis_lignes SET supprime_le=now(), supprime_par=auth.uid(), suppression_groupe=v_g WHERE id IN (SELECT id FROM t);
  END IF;
  RETURN v_g;
END $$;

CREATE FUNCTION public.devis_corbeille_restaurer(_devis_id uuid, _groupe uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM devis_assert_ecriture(_devis_id);
  UPDATE devis_lignes SET supprime_le=NULL, supprime_par=NULL, suppression_groupe=NULL WHERE devis_id=_devis_id AND suppression_groupe=_groupe;
  UPDATE devis_lignes SET parent_id=parent_avant, ordre=ordre - (SELECT 0), parent_avant=NULL, deplace_groupe=NULL
   WHERE devis_id=_devis_id AND deplace_groupe=_groupe;
END $$;

-- ===== Heures / matériaux / lignes libres =====
CREATE FUNCTION public.devis_heure_enregistrer(_ligne_id uuid, _h jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_d uuid := devis_de_ligne(_ligne_id); v_id uuid := NULLIF(_h->>'id','')::uuid; v_old record;
        v_poste uuid; v_niveau text; g record; v_regrille boolean;
BEGIN
  PERFORM devis_assert_ecriture(v_d);
  IF v_id IS NOT NULL THEN SELECT * INTO v_old FROM devis_heures WHERE id=v_id AND ligne_id=_ligne_id; IF NOT FOUND THEN RAISE EXCEPTION 'Ligne d''heures introuvable'; END IF; END IF;
  v_poste := coalesce(NULLIF(_h->>'poste_id','')::uuid, v_old.poste_id);
  IF v_poste IS NULL THEN RAISE EXCEPTION 'Poste obligatoire'; END IF;
  v_niveau := coalesce(NULLIF(_h->>'niveau',''), v_old.niveau,
     (SELECT niveau FROM v_devis_taux_courants WHERE poste_id=v_poste AND par_defaut LIMIT 1),
     (SELECT niveau FROM v_devis_taux_courants WHERE poste_id=v_poste ORDER BY niveau LIMIT 1), 'standard');
  SELECT * INTO g FROM v_devis_taux_courants WHERE poste_id=v_poste AND niveau=v_niveau;
  v_regrille := v_id IS NULL OR v_poste<>v_old.poste_id OR v_niveau<>v_old.niveau;
  IF v_id IS NULL THEN
    INSERT INTO devis_heures(ligne_id,poste_id,niveau,heures,par_unite,taux_vente,taux_grille,cout_revient,ordre)
    VALUES(_ligne_id,v_poste,v_niveau,coalesce((_h->>'heures')::numeric,0),coalesce((_h->>'par_unite')::boolean,true),
      coalesce((_h->>'taux_vente')::numeric,g.taux_vente,0),g.taux_vente,g.cout_revient,
      coalesce((_h->>'ordre')::numeric,(SELECT coalesce(max(ordre),0)+1 FROM devis_heures WHERE ligne_id=_ligne_id)))
    RETURNING id INTO v_id;
  ELSE
    UPDATE devis_heures SET poste_id=v_poste, niveau=v_niveau,
      heures = CASE WHEN _h ? 'heures' THEN coalesce((_h->>'heures')::numeric,0) ELSE heures END,
      par_unite = CASE WHEN _h ? 'par_unite' THEN coalesce((_h->>'par_unite')::boolean,true) ELSE par_unite END,
      taux_grille = CASE WHEN v_regrille THEN g.taux_vente ELSE taux_grille END,
      cout_revient = CASE WHEN v_regrille THEN g.cout_revient ELSE cout_revient END,
      taux_vente = CASE WHEN _h ? 'taux_vente' THEN coalesce((_h->>'taux_vente')::numeric,0)
                        WHEN v_regrille THEN coalesce(g.taux_vente,0) ELSE taux_vente END,
      ordre = CASE WHEN _h ? 'ordre' THEN (_h->>'ordre')::numeric ELSE ordre END
    WHERE id=v_id;
  END IF;
  RETURN v_id;
END $$;

CREATE FUNCTION public.devis_materiau_enregistrer(_ligne_id uuid, _m jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_d uuid := devis_de_ligne(_ligne_id); v_id uuid := NULLIF(_m->>'id','')::uuid; c record; v_coef numeric;
        v_couts boolean := current_user_has_capability('devis.couts'); v_cat uuid;
BEGIN
  PERFORM devis_assert_ecriture(v_d);
  SELECT coef_materiaux_defaut INTO v_coef FROM devis WHERE id=v_d;
  IF v_id IS NULL THEN
    v_cat := NULLIF(_m->>'materiau_id','')::uuid;
    IF v_cat IS NOT NULL THEN
      SELECT m.*, f.nom fnom INTO c FROM materiaux_catalogue m JOIN fournisseurs_tarifs f ON f.id=m.fournisseur_id WHERE m.id=v_cat AND m.actif;
      IF NOT FOUND THEN RAISE EXCEPTION 'Matériau introuvable dans le catalogue actif'; END IF;
      INSERT INTO devis_materiaux(ligne_id,materiau_id,designation,fournisseur,ref,unite,quantite,aide_conversion,prix_achat,date_tarif,coefficient,ordre)
      VALUES(_ligne_id,v_cat,concat_ws(' — ',c.produit,c.format_texte),c.fnom,c.ref,c.unite,coalesce((_m->>'quantite')::numeric,1),_m->'aide_conversion',
        coalesce(c.prix_achat_net, CASE WHEN v_couts THEN (_m->>'prix_achat')::numeric END, 0),c.date_tarif,
        coalesce((_m->>'coefficient')::numeric,v_coef,1.45),
        coalesce((_m->>'ordre')::numeric,(SELECT coalesce(max(ordre),0)+1 FROM devis_materiaux WHERE ligne_id=_ligne_id)))
      RETURNING id INTO v_id;
    ELSE
      INSERT INTO devis_materiaux(ligne_id,designation,fournisseur,ref,unite,quantite,aide_conversion,prix_achat,coefficient,propose_catalogue,ordre)
      VALUES(_ligne_id,coalesce(NULLIF(_m->>'designation',''),'Matériau'),_m->>'fournisseur',_m->>'ref',_m->>'unite',coalesce((_m->>'quantite')::numeric,1),
        _m->'aide_conversion',coalesce((_m->>'prix_achat')::numeric,0),coalesce((_m->>'coefficient')::numeric,v_coef,1.45),
        coalesce((_m->>'propose_catalogue')::boolean,false),
        coalesce((_m->>'ordre')::numeric,(SELECT coalesce(max(ordre),0)+1 FROM devis_materiaux WHERE ligne_id=_ligne_id)))
      RETURNING id INTO v_id;
    END IF;
  ELSE
    UPDATE devis_materiaux SET
      quantite = CASE WHEN _m ? 'quantite' THEN coalesce((_m->>'quantite')::numeric,0) ELSE quantite END,
      aide_conversion = CASE WHEN _m ? 'aide_conversion' THEN _m->'aide_conversion' ELSE aide_conversion END,
      coefficient = CASE WHEN _m ? 'coefficient' THEN coalesce((_m->>'coefficient')::numeric,1) ELSE coefficient END,
      designation = CASE WHEN _m ? 'designation' AND materiau_id IS NULL THEN _m->>'designation' ELSE designation END,
      fournisseur = CASE WHEN _m ? 'fournisseur' AND materiau_id IS NULL THEN _m->>'fournisseur' ELSE fournisseur END,
      ref = CASE WHEN _m ? 'ref' AND materiau_id IS NULL THEN _m->>'ref' ELSE ref END,
      unite = CASE WHEN _m ? 'unite' AND materiau_id IS NULL THEN _m->>'unite' ELSE unite END,
      prix_achat = CASE WHEN _m ? 'prix_achat' AND (materiau_id IS NULL OR v_couts) THEN coalesce((_m->>'prix_achat')::numeric,0) ELSE prix_achat END,
      propose_catalogue = CASE WHEN _m ? 'propose_catalogue' THEN coalesce((_m->>'propose_catalogue')::boolean,false) ELSE propose_catalogue END,
      ordre = CASE WHEN _m ? 'ordre' THEN (_m->>'ordre')::numeric ELSE ordre END
    WHERE id=v_id AND ligne_id=_ligne_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Ligne matériau introuvable'; END IF;
  END IF;
  RETURN v_id;
END $$;

CREATE FUNCTION public.devis_libre_enregistrer(_ligne_id uuid, _f jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_d uuid := devis_de_ligne(_ligne_id); v_id uuid := NULLIF(_f->>'id','')::uuid; v_fk text := NULLIF(_f->>'forfait_cle','');
BEGIN
  PERFORM devis_assert_ecriture(v_d);
  IF v_id IS NULL THEN
    INSERT INTO devis_lignes_libres(ligne_id,categorie,forfait_cle,designation,unite,quantite,prix_achat,prix_forfait,coefficient,par_unite,ordre)
    VALUES(_ligne_id, coalesce(NULLIF(_f->>'categorie',''), CASE WHEN v_fk IS NOT NULL THEN 'forfait' ELSE 'achat' END), v_fk,
      coalesce(NULLIF(_f->>'designation',''),'Ligne libre'), _f->>'unite', coalesce((_f->>'quantite')::numeric,1), (_f->>'prix_achat')::numeric,
      coalesce((_f->>'prix_forfait')::numeric, CASE WHEN v_fk IS NOT NULL THEN (SELECT valeur FROM v_devis_parametres_courants WHERE cle=v_fk) END),
      coalesce((_f->>'coefficient')::numeric,1), coalesce((_f->>'par_unite')::boolean,true),
      coalesce((_f->>'ordre')::numeric,(SELECT coalesce(max(ordre),0)+1 FROM devis_lignes_libres WHERE ligne_id=_ligne_id)))
    RETURNING id INTO v_id;
  ELSE
    UPDATE devis_lignes_libres SET
      categorie = CASE WHEN _f ? 'categorie' THEN _f->>'categorie' ELSE categorie END,
      designation = CASE WHEN _f ? 'designation' THEN _f->>'designation' ELSE designation END,
      unite = CASE WHEN _f ? 'unite' THEN _f->>'unite' ELSE unite END,
      quantite = CASE WHEN _f ? 'quantite' THEN coalesce((_f->>'quantite')::numeric,0) ELSE quantite END,
      prix_achat = CASE WHEN _f ? 'prix_achat' THEN (_f->>'prix_achat')::numeric ELSE prix_achat END,
      prix_forfait = CASE WHEN _f ? 'prix_forfait' THEN (_f->>'prix_forfait')::numeric ELSE prix_forfait END,
      coefficient = CASE WHEN _f ? 'coefficient' THEN coalesce((_f->>'coefficient')::numeric,1) ELSE coefficient END,
      par_unite = CASE WHEN _f ? 'par_unite' THEN coalesce((_f->>'par_unite')::boolean,true) ELSE par_unite END,
      ordre = CASE WHEN _f ? 'ordre' THEN (_f->>'ordre')::numeric ELSE ordre END
    WHERE id=v_id AND ligne_id=_ligne_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Ligne libre introuvable'; END IF;
  END IF;
  RETURN v_id;
END $$;

CREATE FUNCTION public.devis_element_supprimer(_kind text, _id uuid, _restaurer boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_l uuid;
BEGIN
  IF _kind='heure' THEN SELECT ligne_id INTO v_l FROM devis_heures WHERE id=_id;
  ELSIF _kind='materiau' THEN SELECT ligne_id INTO v_l FROM devis_materiaux WHERE id=_id;
  ELSIF _kind='libre' THEN SELECT ligne_id INTO v_l FROM devis_lignes_libres WHERE id=_id;
  ELSE RAISE EXCEPTION 'Type inconnu'; END IF;
  IF v_l IS NULL THEN RAISE EXCEPTION 'Élément introuvable'; END IF;
  PERFORM devis_assert_ecriture(devis_de_ligne(v_l));
  IF _kind='heure' THEN UPDATE devis_heures SET supprime_le=CASE WHEN _restaurer THEN NULL ELSE now() END WHERE id=_id;
  ELSIF _kind='materiau' THEN UPDATE devis_materiaux SET supprime_le=CASE WHEN _restaurer THEN NULL ELSE now() END WHERE id=_id;
  ELSE UPDATE devis_lignes_libres SET supprime_le=CASE WHEN _restaurer THEN NULL ELSE now() END WHERE id=_id; END IF;
END $$;

-- ===== Prix catalogue modifiés depuis =====
CREATE FUNCTION public.devis_materiaux_ecarts(_devis_id uuid)
RETURNS TABLE(devis_materiau_id uuid, nouveau_materiau_id uuid, ancien_prix numeric, nouveau_prix numeric, nouvelle_date date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_c boolean := current_user_has_capability('devis.couts');
BEGIN
  IF NOT devis_peut_lire(_devis_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT m.id, c.id, CASE WHEN v_c THEN m.prix_achat END, CASE WHEN v_c THEN c.prix_achat_net END, c.date_tarif
  FROM devis_materiaux m JOIN devis_lignes l ON l.id=m.ligne_id AND l.devis_id=_devis_id AND l.supprime_le IS NULL
  JOIN materiaux_catalogue o ON o.id=m.materiau_id
  JOIN LATERAL (SELECT c2.* FROM materiaux_catalogue c2 WHERE c2.actif AND c2.fournisseur_id=o.fournisseur_id
                AND (c2.id=o.id OR (o.ref IS NOT NULL AND c2.ref=o.ref)) ORDER BY (c2.id=o.id) DESC LIMIT 1) c ON true
  WHERE m.supprime_le IS NULL AND (c.prix_achat_net IS DISTINCT FROM m.prix_achat OR c.id<>m.materiau_id) AND c.prix_achat_net IS NOT NULL;
END $$;

CREATE FUNCTION public.devis_materiau_maj_prix(_devis_materiau_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_l uuid; e record;
BEGIN
  SELECT ligne_id INTO v_l FROM devis_materiaux WHERE id=_devis_materiau_id;
  PERFORM devis_assert_ecriture(devis_de_ligne(v_l));
  SELECT * INTO e FROM devis_materiaux_ecarts(devis_de_ligne(v_l)) x WHERE x.devis_materiau_id=_devis_materiau_id;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE devis_materiaux m SET materiau_id=c.id, prix_achat=c.prix_achat_net, date_tarif=c.date_tarif
  FROM materiaux_catalogue c WHERE m.id=_devis_materiau_id AND c.id=e.nouveau_materiau_id;
END $$;

-- ===== Accès rapides matériaux =====
CREATE FUNCTION public.materiaux_acces_rapides(_devis_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_c boolean := current_user_has_capability('devis.couts');
BEGIN
  IF NOT (current_user_has_capability('devis.rediger') OR current_user_has_capability('devis.parametres')) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object(
   'favoris',(SELECT coalesce(jsonb_agg(x),'[]') FROM (SELECT c.id,c.produit,c.format_texte,c.epaisseur_mm,c.unite,f.nom fournisseur,
        CASE WHEN v_c THEN c.prix_achat_net END prix_achat_net, CASE WHEN v_c THEN c.prix_m2 END prix_m2, c.date_tarif
        FROM materiaux_favoris fa JOIN materiaux_catalogue c ON c.id=fa.materiau_id AND c.actif JOIN fournisseurs_tarifs f ON f.id=c.fournisseur_id
        WHERE fa.user_id=auth.uid() ORDER BY fa.cree_le DESC LIMIT 30) x),
   'recents',(SELECT coalesce(jsonb_agg(x),'[]') FROM (SELECT c.id,c.produit,c.format_texte,c.epaisseur_mm,c.unite,f.nom fournisseur,
        CASE WHEN v_c THEN c.prix_achat_net END prix_achat_net, CASE WHEN v_c THEN c.prix_m2 END prix_m2, c.date_tarif
        FROM (SELECT materiau_id, max(created_at) t FROM devis_materiaux WHERE created_by=auth.uid() AND materiau_id IS NOT NULL GROUP BY materiau_id ORDER BY 2 DESC LIMIT 20) r
        JOIN materiaux_catalogue c ON c.id=r.materiau_id AND c.actif JOIN fournisseurs_tarifs f ON f.id=c.fournisseur_id ORDER BY r.t DESC) x),
   'ce_devis',(SELECT coalesce(jsonb_agg(x),'[]') FROM (SELECT DISTINCT ON (c.id) c.id,c.produit,c.format_texte,c.epaisseur_mm,c.unite,f.nom fournisseur,
        CASE WHEN v_c THEN c.prix_achat_net END prix_achat_net, CASE WHEN v_c THEN c.prix_m2 END prix_m2, c.date_tarif
        FROM devis_materiaux m JOIN devis_lignes l ON l.id=m.ligne_id AND l.devis_id=_devis_id AND l.supprime_le IS NULL
        JOIN materiaux_catalogue c ON c.id=m.materiau_id AND c.actif JOIN fournisseurs_tarifs f ON f.id=c.fournisseur_id WHERE m.supprime_le IS NULL) x),
   'top12',(SELECT coalesce(jsonb_agg(x),'[]') FROM (SELECT c.id,c.produit,c.format_texte,c.epaisseur_mm,c.unite,f.nom fournisseur,
        CASE WHEN v_c THEN c.prix_achat_net END prix_achat_net, CASE WHEN v_c THEN c.prix_m2 END prix_m2, c.date_tarif
        FROM (SELECT materiau_id, count(*) n FROM devis_materiaux WHERE materiau_id IS NOT NULL AND created_at > now()-interval '12 months' GROUP BY materiau_id ORDER BY 2 DESC LIMIT 20) r
        JOIN materiaux_catalogue c ON c.id=r.materiau_id AND c.actif JOIN fournisseurs_tarifs f ON f.id=c.fournisseur_id ORDER BY r.n DESC) x));
END $$;

-- ===== Photos =====
CREATE FUNCTION public.devis_photo_ajouter(_ligne_id uuid, _p jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_d uuid := devis_de_ligne(_ligne_id); v_id uuid;
BEGIN
  PERFORM devis_assert_ecriture(v_d);
  IF (_p->>'storage_path') NOT LIKE v_d::text||'/%' THEN RAISE EXCEPTION 'Chemin de fichier invalide'; END IF;
  INSERT INTO devis_photos(devis_id,ligne_id,storage_path,thumb_path,mime,width,height,size_bytes,legende,visible_client,ordre)
  VALUES(v_d,_ligne_id,_p->>'storage_path',_p->>'thumb_path',_p->>'mime',(_p->>'width')::int,(_p->>'height')::int,(_p->>'size_bytes')::int,
         _p->>'legende',coalesce((_p->>'visible_client')::boolean,true),
         coalesce((_p->>'ordre')::numeric,(SELECT coalesce(max(ordre),0)+1 FROM devis_photos WHERE ligne_id=_ligne_id)))
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE FUNCTION public.devis_photo_modifier(_photo_id uuid, _p jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_d uuid;
BEGIN
  SELECT devis_id INTO v_d FROM devis_photos WHERE id=_photo_id;
  PERFORM devis_assert_ecriture(v_d);
  UPDATE devis_photos SET
    legende = CASE WHEN _p ? 'legende' THEN _p->>'legende' ELSE legende END,
    visible_client = CASE WHEN _p ? 'visible_client' THEN coalesce((_p->>'visible_client')::boolean,true) ELSE visible_client END,
    ordre = CASE WHEN _p ? 'ordre' THEN (_p->>'ordre')::numeric ELSE ordre END,
    deleted_at = CASE WHEN coalesce((_p->>'supprimer')::boolean,false) THEN now() WHEN _p ? 'restaurer' THEN NULL ELSE deleted_at END,
    deleted_by = CASE WHEN coalesce((_p->>'supprimer')::boolean,false) THEN auth.uid() WHEN _p ? 'restaurer' THEN NULL ELSE deleted_by END
  WHERE id=_photo_id;
END $$;

-- ===== Statuts =====
CREATE FUNCTION public.devis_statut_changer(_devis_id uuid, _statut devis_redaction_statut) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
    UPDATE devis SET statut_redaction='valide', valide_par=auth.uid(), valide_le=now(), totaux_snapshot=v_calc,
      montant_ht=(v_calc->>'total_ht')::numeric,
      dates_snapshot=(SELECT jsonb_build_object('date_opportunite',a.created_at::date,'date_devis',d.date_devis,
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
END $$;

-- ===== Grants =====
REVOKE ALL ON FUNCTION public.devis_peut_ecrire(uuid), public.devis_assert_ecriture(uuid,boolean), public.devis_de_ligne(uuid),
  public.devis_copier_sous_arbre(uuid,uuid,uuid,uuid,boolean,numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.devis_peut_valider(uuid), public.devis_creer(uuid,uuid), public.devis_nouvelle_version(uuid), public.devis_lister(uuid),
  public.devis_lire(uuid), public.devis_lire_client(uuid), public.devis_entete_modifier(uuid,jsonb,boolean), public.devis_dates_modifier(uuid,jsonb),
  public.devis_ligne_enregistrer(uuid,jsonb), public.devis_ligne_deplacer(uuid,uuid,numeric), public.devis_ligne_dupliquer(uuid),
  public.devis_ligne_supprimer(uuid,text,uuid), public.devis_corbeille_restaurer(uuid,uuid), public.devis_heure_enregistrer(uuid,jsonb),
  public.devis_materiau_enregistrer(uuid,jsonb), public.devis_libre_enregistrer(uuid,jsonb), public.devis_element_supprimer(text,uuid,boolean),
  public.devis_materiaux_ecarts(uuid), public.devis_materiau_maj_prix(uuid), public.materiaux_acces_rapides(uuid),
  public.devis_photo_ajouter(uuid,jsonb), public.devis_photo_modifier(uuid,jsonb), public.devis_statut_changer(uuid,devis_redaction_statut) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devis_peut_valider(uuid), public.devis_creer(uuid,uuid), public.devis_nouvelle_version(uuid), public.devis_lister(uuid),
  public.devis_lire(uuid), public.devis_lire_client(uuid), public.devis_entete_modifier(uuid,jsonb,boolean), public.devis_dates_modifier(uuid,jsonb),
  public.devis_ligne_enregistrer(uuid,jsonb), public.devis_ligne_deplacer(uuid,uuid,numeric), public.devis_ligne_dupliquer(uuid),
  public.devis_ligne_supprimer(uuid,text,uuid), public.devis_corbeille_restaurer(uuid,uuid), public.devis_heure_enregistrer(uuid,jsonb),
  public.devis_materiau_enregistrer(uuid,jsonb), public.devis_libre_enregistrer(uuid,jsonb), public.devis_element_supprimer(text,uuid,boolean),
  public.devis_materiaux_ecarts(uuid), public.devis_materiau_maj_prix(uuid), public.materiaux_acces_rapides(uuid),
  public.devis_photo_ajouter(uuid,jsonb), public.devis_photo_modifier(uuid,jsonb), public.devis_statut_changer(uuid,devis_redaction_statut) TO authenticated;

-- Fichiers photos des devis (bucket privé devis-photos)
CREATE POLICY devis_photos_storage_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='devis-photos' AND (public.current_user_has_capability('devis.rediger') OR public.current_user_has_capability('devis.parametres')));
CREATE POLICY devis_photos_storage_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='devis-photos' AND (public.current_user_has_capability('devis.rediger') OR public.current_user_has_capability('devis.parametres')));