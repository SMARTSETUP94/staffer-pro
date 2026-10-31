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
  IF d.statut_redaction NOT IN ('valide','transfere') THEN RAISE EXCEPTION 'Seul un devis validé peut être signé'; END IF;
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
    signe_vers_fabrication_le=now(), montant_ht=coalesce((totaux_snapshot->>'total_ht')::numeric,montant_ht), updated_at=now()
  WHERE id=_devis_id;

  RETURN jsonb_build_object('deja_fait', false, 'objets', v_n, 'prefixe', NULLIF(v_prefix,''), 'photos', v_photos);
END $$;