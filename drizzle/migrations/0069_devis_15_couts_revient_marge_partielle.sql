-- Devis 15 : coût de revient complet (MO / matériaux / autres), marge partielle, coûts des forfaits,
-- forfait sans prix bloquant à la validation, jours BE arrondis à 1 décimale.

ALTER TABLE public.devis_snapshot_couts ADD COLUMN IF NOT EXISTS detail jsonb;
COMMENT ON COLUMN public.devis_snapshot_couts.detail IS 'Décomposition figée à la validation : main d''œuvre / matériaux / autres (coût, vente), marge %, coûts manquants';

CREATE OR REPLACE FUNCTION public.devis_calculer_interne(_devis_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH RECURSIVE l AS (SELECT * FROM devis_lignes WHERE devis_id=_devis_id AND supprime_le IS NULL),
t AS (
  SELECT id, id AS racine, (type='option' AND NOT option_incluse) AS est_option, quantite AS q FROM l WHERE parent_id IS NULL
  UNION ALL
  SELECT c.id, t.racine, t.est_option OR (c.type='option' AND NOT c.option_incluse), c.quantite FROM l c JOIN t ON c.parent_id=t.id
),
hx AS (SELECT x.ligne_id, x.par_unite, coalesce(x.montant_force, x.heures*x.taux_vente) v, x.heures*x.cout_revient c,
              (x.cout_revient IS NULL AND x.heures>0) manq, x.heures, p.libelle
       FROM devis_heures x JOIN t ON t.id=x.ligne_id LEFT JOIN devis_postes_ref p ON p.id=x.poste_id WHERE x.supprime_le IS NULL),
h AS (SELECT ligne_id, sum(v) FILTER (WHERE par_unite) vu, sum(v) FILTER (WHERE NOT par_unite) vl,
             sum(c) FILTER (WHERE par_unite) cu, sum(c) FILTER (WHERE NOT par_unite) cl
      FROM hx GROUP BY ligne_id),
m AS (SELECT ligne_id, sum(quantite*prix_achat*coefficient) v, sum(quantite*prix_achat) c FROM devis_materiaux WHERE supprime_le IS NULL GROUP BY ligne_id),
fx AS (SELECT x.ligne_id, x.par_unite, x.designation,
              x.quantite*coalesce(x.prix_forfait,coalesce(x.prix_achat,0)*x.coefficient) v,
              x.quantite*coalesce(x.prix_achat,0) c,
              (x.prix_achat IS NULL AND x.quantite*coalesce(x.prix_forfait,0) > 0) manq
       FROM devis_lignes_libres x JOIN t ON t.id=x.ligne_id WHERE x.supprime_le IS NULL),
f AS (SELECT ligne_id, sum(v) FILTER (WHERE par_unite) vu, sum(v) FILTER (WHERE NOT par_unite) vl,
             sum(c) FILTER (WHERE par_unite) cu, sum(c) FILTER (WHERE NOT par_unite) cl
      FROM fx GROUP BY ligne_id),
o AS (
  SELECT t.id, t.racine, t.est_option, t.q,
    round((coalesce(h.vu,0)+coalesce(m.v,0)+coalesce(f.vu,0))*t.q + coalesce(h.vl,0)+coalesce(f.vl,0), 2) AS vente,
    coalesce(h.vu,0)*t.q + coalesce(h.vl,0) AS mo_v, coalesce(h.cu,0)*t.q + coalesce(h.cl,0) AS mo_c,
    coalesce(m.v,0)*t.q AS mat_v, coalesce(m.c,0)*t.q AS mat_c,
    coalesce(f.vu,0)*t.q + coalesce(f.vl,0) AS aut_v, coalesce(f.cu,0)*t.q + coalesce(f.cl,0) AS aut_c
  FROM t LEFT JOIN h ON h.ligne_id=t.id LEFT JOIN m ON m.ligne_id=t.id LEFT JOIN f ON f.ligne_id=t.id
),
hh AS (
  SELECT p.metier_id, x.heures*CASE WHEN x.par_unite THEN t.q ELSE 1 END h
    FROM devis_heures x JOIN t ON t.id=x.ligne_id JOIN devis_postes_ref p ON p.id=x.poste_id
   WHERE x.supprime_le IS NULL AND NOT t.est_option
  UNION ALL
  SELECT p.metier_id, x.heures_info*CASE WHEN x.par_unite THEN t.q ELSE 1 END
    FROM devis_lignes_libres x JOIN t ON t.id=x.ligne_id LEFT JOIN devis_postes_ref p ON p.id=x.poste_info_id
   WHERE x.supprime_le IS NULL AND NOT t.est_option AND coalesce(x.heures_info,0)<>0
),
hm AS (SELECT metier_id, round(sum(h),2) h FROM hh GROUP BY metier_id),
manq AS (
  SELECT 'heures'::text AS type, coalesce(hx.libelle,'Poste') AS libelle, round(sum(hx.heures*CASE WHEN hx.par_unite THEN t.q ELSE 1 END),2) AS heures
    FROM hx JOIN t ON t.id=hx.ligne_id WHERE hx.manq AND NOT t.est_option GROUP BY hx.libelle
  UNION ALL
  SELECT 'libre', fx.designation, NULL FROM fx JOIN t ON t.id=fx.ligne_id WHERE fx.manq AND NOT t.est_option GROUP BY fx.designation
),
tot AS (SELECT round(coalesce(sum(vente) FILTER (WHERE NOT est_option),0),2) ht, coalesce(sum(mo_c+mat_c+aut_c) FILTER (WHERE NOT est_option),0) cout,
               coalesce(sum(mo_v) FILTER (WHERE NOT est_option),0) mo_v, coalesce(sum(mo_c) FILTER (WHERE NOT est_option),0) mo_c,
               coalesce(sum(mat_v) FILTER (WHERE NOT est_option),0) mat_v, coalesce(sum(mat_c) FILTER (WHERE NOT est_option),0) mat_c,
               coalesce(sum(aut_v) FILTER (WHERE NOT est_option),0) aut_v, coalesce(sum(aut_c) FILTER (WHERE NOT est_option),0) aut_c,
               coalesce(sum(vente) FILTER (WHERE est_option),0) opt FROM o),
dv AS (SELECT remise_mode, remise_valeur, tva_pct FROM devis WHERE id=_devis_id),
rem AS (SELECT LEAST(tot.ht, GREATEST(0, round(CASE coalesce(dv.remise_mode,'aucune')
          WHEN 'montant'   THEN abs(coalesce(dv.remise_valeur,0))
          WHEN 'pct'       THEN tot.ht*coalesce(dv.remise_valeur,0)/100
          WHEN 'net_cible' THEN tot.ht-coalesce(dv.remise_valeur,tot.ht)
          ELSE 0 END, 2))) r
        FROM tot LEFT JOIN dv ON true),
tva AS (SELECT coalesce((SELECT tva_pct FROM dv),(SELECT valeur FROM v_devis_parametres_courants WHERE cle='tva_pct'),20) p),
n AS (SELECT tot.ht - rem.r net FROM tot, rem)
SELECT jsonb_build_object(
  'total_ht', tot.ht,
  'remise', -rem.r,
  'net_ht', n.net,
  'tva_pct', tva.p,
  'tva', round(n.net*tva.p/100,2),
  'ttc', n.net+round(n.net*tva.p/100,2),
  'options_ht', round(tot.opt,2),
  'lignes', (SELECT coalesce(jsonb_object_agg(id, vente),'{}'::jsonb) FROM o WHERE vente<>0),
  'racines', (SELECT coalesce(jsonb_object_agg(racine, s),'{}'::jsonb) FROM (SELECT racine, round(sum(vente),2) s FROM o GROUP BY racine) z),
  'heures_metier', (SELECT coalesce(jsonb_object_agg(coalesce(metier_id::text,'aucun'), h),'{}'::jsonb) FROM hm),
  'cout_total', round(tot.cout,2),
  'cout_complet', NOT EXISTS (SELECT 1 FROM manq),
  'marge', to_jsonb(round(n.net-tot.cout,2)),
  'marge_pct', CASE WHEN n.net<>0 THEN round((n.net-tot.cout)/n.net*100,1) END,
  'decomposition', jsonb_build_object(
     'main_oeuvre', jsonb_build_object('cout',round(tot.mo_c,2),'vente',round(tot.mo_v,2)),
     'materiaux',   jsonb_build_object('cout',round(tot.mat_c,2),'vente',round(tot.mat_v,2)),
     'autres',      jsonb_build_object('cout',round(tot.aut_c,2),'vente',round(tot.aut_v,2))),
  'couts_manquants', (SELECT coalesce(jsonb_agg(jsonb_build_object('type',type,'libelle',libelle,'heures',heures) ORDER BY type,libelle),'[]'::jsonb) FROM manq))
FROM tot, rem, tva, n;
$function$;

CREATE OR REPLACE FUNCTION public.devis_calculer(_devis_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v jsonb;
BEGIN
  IF NOT devis_peut_lire(_devis_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  v := devis_calculer_interne(_devis_id);
  IF NOT current_user_has_capability('devis.couts') THEN
    v := v - 'cout_total' - 'cout_complet' - 'marge_pct' - 'decomposition' - 'couts_manquants' || jsonb_build_object('marge', NULL);
  END IF;
  RETURN v;
END $function$;

CREATE OR REPLACE FUNCTION public.devis_statut_changer(_devis_id uuid, _statut devis_redaction_statut)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE d record; v_calc jsonb; v_sans_prix text;
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
    SELECT string_agg(DISTINCT f.designation, ', ') INTO v_sans_prix
      FROM devis_lignes_libres f JOIN devis_lignes l ON l.id=f.ligne_id
     WHERE l.devis_id=_devis_id AND l.supprime_le IS NULL AND f.supprime_le IS NULL
       AND (f.categorie='forfait' OR f.forfait_cle IS NOT NULL) AND f.quantite>0 AND f.prix_forfait IS NULL;
    IF v_sans_prix IS NOT NULL THEN
      RAISE EXCEPTION 'Validation impossible : prix de vente à saisir pour le forfait %', v_sans_prix;
    END IF;
    v_calc := devis_calculer_interne(_devis_id);
    INSERT INTO devis_snapshot_couts(devis_id, cout_total, marge, fige_le, detail)
      VALUES (_devis_id, (v_calc->>'cout_total')::numeric, v_calc->'marge', now(),
              jsonb_build_object('decomposition',v_calc->'decomposition','marge_pct',v_calc->'marge_pct',
                                 'cout_complet',v_calc->'cout_complet','couts_manquants',v_calc->'couts_manquants','net_ht',v_calc->'net_ht'))
      ON CONFLICT (devis_id) DO UPDATE SET cout_total=EXCLUDED.cout_total, marge=EXCLUDED.marge, fige_le=EXCLUDED.fige_le, detail=EXCLUDED.detail;
    UPDATE devis SET statut_redaction='valide', valide_par=auth.uid(), valide_le=now(),
      totaux_snapshot=v_calc - 'cout_total' - 'marge' - 'cout_complet' - 'marge_pct' - 'decomposition' - 'couts_manquants',
      montant_ht=coalesce((v_calc->>'net_ht')::numeric,(v_calc->>'total_ht')::numeric),
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

CREATE OR REPLACE FUNCTION public.devis_libre_enregistrer(_ligne_id uuid, _f jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_d uuid := devis_de_ligne(_ligne_id); v_id uuid := NULLIF(_f->>'id','')::uuid; v_fk text := NULLIF(_f->>'forfait_cle','');
BEGIN
  PERFORM devis_assert_ecriture(v_d);
  IF v_id IS NULL THEN
    INSERT INTO devis_lignes_libres(ligne_id,categorie,forfait_cle,designation,unite,quantite,prix_achat,prix_forfait,coefficient,par_unite,ordre,heures_info,poste_info_id)
    VALUES(_ligne_id, coalesce(NULLIF(_f->>'categorie',''), CASE WHEN v_fk IS NOT NULL THEN 'forfait' ELSE 'achat' END), v_fk,
      coalesce(NULLIF(_f->>'designation',''),'Ligne libre'), _f->>'unite', coalesce((_f->>'quantite')::numeric,1),
      coalesce((_f->>'prix_achat')::numeric, CASE WHEN v_fk IS NOT NULL THEN (SELECT valeur FROM v_devis_parametres_courants WHERE cle='cout_'||v_fk) END),
      coalesce((_f->>'prix_forfait')::numeric, CASE WHEN v_fk IS NOT NULL THEN (SELECT valeur FROM v_devis_parametres_courants WHERE cle=v_fk) END),
      coalesce((_f->>'coefficient')::numeric,1), coalesce((_f->>'par_unite')::boolean,true),
      coalesce((_f->>'ordre')::numeric,(SELECT coalesce(max(ordre),0)+1 FROM devis_lignes_libres WHERE ligne_id=_ligne_id)),
      (_f->>'heures_info')::numeric, NULLIF(_f->>'poste_info_id','')::uuid)
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
      ordre = CASE WHEN _f ? 'ordre' THEN (_f->>'ordre')::numeric ELSE ordre END,
      heures_info = CASE WHEN _f ? 'heures_info' THEN (_f->>'heures_info')::numeric ELSE heures_info END,
      poste_info_id = CASE WHEN _f ? 'poste_info_id' THEN NULLIF(_f->>'poste_info_id','')::uuid ELSE poste_info_id END
    WHERE id=v_id AND ligne_id=_ligne_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Ligne libre introuvable'; END IF;
  END IF;
  RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION public.devis_charge_be(_affaire_ids uuid[])
 RETURNS TABLE(affaire_id uuid, devis_id uuid, numero text, version integer, heures_be numeric, jours_be numeric, etat text, figee boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT a.id, r.id, r.numero, r.version, r.h,
         round(ceil(r.h / nullif((SELECT valeur FROM v_devis_parametres_courants WHERE cle='heures_par_jour_be'),0) * 2) / 2, 1),
         CASE WHEN a.statut_opportunite='gagne' OR a.phase='signe' THEN 'confirme' ELSE 'previsionnel' END,
         r.figee
  FROM affaires a
  CROSS JOIN LATERAL (
    SELECT d.id, d.numero, d.version, coalesce(d.heures_be_fige, devis_heures_be(d.id)) h, d.heures_be_fige IS NOT NULL figee
    FROM devis d WHERE d.affaire_id=a.id AND d.redige_dans_staffing AND NOT d.est_modele AND d.supprime_le IS NULL
      AND d.statut_redaction IN ('signe','transfere','valide')
    ORDER BY CASE d.statut_redaction WHEN 'signe' THEN 0 WHEN 'transfere' THEN 1 ELSE 2 END, d.version DESC LIMIT 1) r
  WHERE a.id = ANY(_affaire_ids) AND coalesce(array_length(_affaire_ids,1),0) <= 1000
    AND (a.statut_opportunite IN ('presque_gagne','gagne') OR a.phase='signe')
    AND (current_user_has_capability('planning.pilotage') OR user_has_affaire_access(a.id)) $function$;

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
    'photos', (SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.ordre,p.uploaded_at),'[]') FROM devis_photos p WHERE p.devis_id=_devis_id AND p.deleted_at IS NULL),
    'calcul', devis_calculer(_devis_id),
    'droits', jsonb_build_object('couts',v_c,'ecrire',devis_peut_ecrire(_devis_id),'valider',devis_peut_valider(_devis_id),'parametres',current_user_has_capability('devis.parametres')),
    'parametres', (SELECT coalesce(jsonb_object_agg(cle,valeur),'{}') FROM v_devis_parametres_courants WHERE v_c OR cle NOT LIKE 'cout\_%'),
    'couts_figes', CASE WHEN v_c THEN (SELECT to_jsonb(s) FROM devis_snapshot_couts s WHERE s.devis_id=_devis_id) END);
  RETURN v;
END $function$;

-- Les coûts des forfaits (cout_*) ne sont lisibles qu'avec le droit coûts ou paramétrage.
CREATE POLICY parametres_couts_restreints ON public.devis_parametres AS RESTRICTIVE FOR SELECT TO authenticated
  USING (cle NOT LIKE 'cout\_%' OR current_user_has_capability('devis.couts') OR current_user_has_capability('devis.parametres'));