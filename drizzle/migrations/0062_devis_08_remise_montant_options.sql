ALTER TABLE public.devis
  ADD COLUMN IF NOT EXISTS remise_mode text NOT NULL DEFAULT 'aucune'
    CHECK (remise_mode IN ('aucune','montant','pct','net_cible')),
  ADD COLUMN IF NOT EXISTS remise_valeur numeric(14,4);
ALTER TABLE public.devis_heures ADD COLUMN IF NOT EXISTS montant_force numeric(14,2);
ALTER TABLE public.devis_lignes_libres
  ADD COLUMN IF NOT EXISTS heures_info numeric(10,2),
  ADD COLUMN IF NOT EXISTS poste_info_id uuid REFERENCES public.devis_postes_ref(id);
ALTER TABLE public.devis_lignes ADD COLUMN IF NOT EXISTS option_incluse boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.devis_calculer_interne(_devis_id uuid)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
WITH RECURSIVE l AS (SELECT * FROM devis_lignes WHERE devis_id=_devis_id AND supprime_le IS NULL),
t AS (
  SELECT id, id AS racine, (type='option' AND NOT option_incluse) AS est_option, quantite AS q FROM l WHERE parent_id IS NULL
  UNION ALL
  SELECT c.id, t.racine, t.est_option OR (c.type='option' AND NOT c.option_incluse), c.quantite FROM l c JOIN t ON c.parent_id=t.id
),
hx AS (SELECT ligne_id, par_unite, coalesce(montant_force, heures*taux_vente) v, heures*cout_revient c, (cout_revient IS NULL AND heures>0) manq
       FROM devis_heures WHERE supprime_le IS NULL),
h AS (SELECT ligne_id, sum(v) FILTER (WHERE par_unite) vu, sum(v) FILTER (WHERE NOT par_unite) vl,
             sum(c) FILTER (WHERE par_unite) cu, sum(c) FILTER (WHERE NOT par_unite) cl, bool_or(manq) manq
      FROM hx GROUP BY ligne_id),
m AS (SELECT ligne_id, sum(quantite*prix_achat*coefficient) v, sum(quantite*prix_achat) c FROM devis_materiaux WHERE supprime_le IS NULL GROUP BY ligne_id),
f AS (SELECT ligne_id,
        sum(quantite*coalesce(prix_forfait,coalesce(prix_achat,0)*coefficient)) FILTER (WHERE par_unite) vu,
        sum(quantite*coalesce(prix_forfait,coalesce(prix_achat,0)*coefficient)) FILTER (WHERE NOT par_unite) vl,
        sum(quantite*coalesce(prix_achat,0)) FILTER (WHERE par_unite) cu,
        sum(quantite*coalesce(prix_achat,0)) FILTER (WHERE NOT par_unite) cl
      FROM devis_lignes_libres WHERE supprime_le IS NULL GROUP BY ligne_id),
o AS (
  SELECT t.id, t.racine, t.est_option, t.q,
    round((coalesce(h.vu,0)+coalesce(m.v,0)+coalesce(f.vu,0))*t.q + coalesce(h.vl,0)+coalesce(f.vl,0), 2) AS vente,
    (coalesce(h.cu,0)+coalesce(m.c,0)+coalesce(f.cu,0))*t.q + coalesce(h.cl,0)+coalesce(f.cl,0) AS cout,
    coalesce(h.manq,false) AS manq
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
tot AS (SELECT round(coalesce(sum(vente) FILTER (WHERE NOT est_option),0),2) ht, coalesce(sum(cout) FILTER (WHERE NOT est_option),0) cout,
               coalesce(bool_or(manq) FILTER (WHERE NOT est_option),false) manq,
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
  'cout_total', CASE WHEN tot.manq THEN NULL ELSE round(tot.cout,2) END,
  'marge', CASE WHEN tot.manq THEN to_jsonb('non_calculable'::text) ELSE to_jsonb(round(n.net-tot.cout,2)) END)
FROM tot, rem, tva, n;
$function$;

CREATE OR REPLACE FUNCTION public.devis_heure_enregistrer(_ligne_id uuid, _h jsonb)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_d uuid := devis_de_ligne(_ligne_id); v_id uuid := NULLIF(_h->>'id','')::uuid; v_old devis_heures%ROWTYPE;
        v_poste uuid; v_niveau text; g record; v_regrille boolean;
BEGIN
  PERFORM devis_assert_ecriture(v_d);
  IF v_id IS NOT NULL THEN SELECT * INTO v_old FROM devis_heures WHERE id=v_id AND ligne_id=_ligne_id; IF NOT FOUND THEN RAISE EXCEPTION 'Ligne d''heures introuvable'; END IF; END IF;
  v_poste := coalesce(NULLIF(_h->>'poste_id','')::uuid, v_old.poste_id);
  IF v_poste IS NULL THEN RAISE EXCEPTION 'Poste obligatoire'; END IF;
  v_niveau := coalesce(NULLIF(_h->>'niveau',''), CASE WHEN NULLIF(_h->>'poste_id','')::uuid IS DISTINCT FROM v_old.poste_id AND v_id IS NOT NULL THEN NULL ELSE v_old.niveau END,
     (SELECT niveau FROM v_devis_taux_courants WHERE poste_id=v_poste AND par_defaut LIMIT 1),
     (SELECT niveau FROM v_devis_taux_courants WHERE poste_id=v_poste ORDER BY niveau LIMIT 1), 'standard');
  SELECT taux_vente, cout_revient INTO g FROM v_devis_taux_courants WHERE poste_id=v_poste AND niveau=v_niveau;
  v_regrille := v_id IS NULL OR v_poste<>v_old.poste_id OR v_niveau<>v_old.niveau;
  IF v_id IS NULL THEN
    INSERT INTO devis_heures(ligne_id,poste_id,niveau,heures,par_unite,taux_vente,taux_grille,cout_revient,ordre,montant_force)
    VALUES(_ligne_id,v_poste,v_niveau,coalesce((_h->>'heures')::numeric,0),coalesce((_h->>'par_unite')::boolean,true),
      coalesce((_h->>'taux_vente')::numeric,g.taux_vente,0),g.taux_vente,g.cout_revient,
      coalesce((_h->>'ordre')::numeric,(SELECT coalesce(max(ordre),0)+1 FROM devis_heures WHERE ligne_id=_ligne_id)),
      round((_h->>'montant_force')::numeric,2))
    RETURNING id INTO v_id;
  ELSE
    UPDATE devis_heures SET poste_id=v_poste, niveau=v_niveau,
      heures = CASE WHEN _h ? 'heures' THEN coalesce((_h->>'heures')::numeric,0) ELSE heures END,
      par_unite = CASE WHEN _h ? 'par_unite' THEN coalesce((_h->>'par_unite')::boolean,true) ELSE par_unite END,
      taux_grille = CASE WHEN v_regrille THEN g.taux_vente ELSE taux_grille END,
      cout_revient = CASE WHEN v_regrille THEN g.cout_revient ELSE cout_revient END,
      taux_vente = CASE WHEN _h ? 'taux_vente' THEN coalesce((_h->>'taux_vente')::numeric,0)
                        WHEN v_regrille THEN coalesce(g.taux_vente,0) ELSE taux_vente END,
      montant_force = CASE WHEN _h ? 'montant_force' THEN round((_h->>'montant_force')::numeric,2) ELSE montant_force END,
      ordre = CASE WHEN _h ? 'ordre' THEN (_h->>'ordre')::numeric ELSE ordre END
    WHERE id=v_id;
  END IF;
  RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION public.devis_libre_enregistrer(_ligne_id uuid, _f jsonb)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_d uuid := devis_de_ligne(_ligne_id); v_id uuid := NULLIF(_f->>'id','')::uuid; v_fk text := NULLIF(_f->>'forfait_cle','');
BEGIN
  PERFORM devis_assert_ecriture(v_d);
  IF v_id IS NULL THEN
    INSERT INTO devis_lignes_libres(ligne_id,categorie,forfait_cle,designation,unite,quantite,prix_achat,prix_forfait,coefficient,par_unite,ordre,heures_info,poste_info_id)
    VALUES(_ligne_id, coalesce(NULLIF(_f->>'categorie',''), CASE WHEN v_fk IS NOT NULL THEN 'forfait' ELSE 'achat' END), v_fk,
      coalesce(NULLIF(_f->>'designation',''),'Ligne libre'), _f->>'unite', coalesce((_f->>'quantite')::numeric,1), (_f->>'prix_achat')::numeric,
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

CREATE OR REPLACE FUNCTION public.devis_remise_modifier(_devis_id uuid, _mode text, _valeur numeric)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM devis_assert_ecriture(_devis_id);
  IF _mode NOT IN ('aucune','montant','pct','net_cible') THEN RAISE EXCEPTION 'Mode de remise invalide'; END IF;
  IF _mode='pct' AND (_valeur < 0 OR _valeur > 100) THEN RAISE EXCEPTION 'Pourcentage entre 0 et 100'; END IF;
  IF _mode IN ('montant','net_cible') AND _valeur < 0 THEN RAISE EXCEPTION 'Montant positif attendu'; END IF;
  PERFORM set_config('app.devis_rpc','on',true);
  UPDATE devis SET remise_mode=_mode, remise_valeur=CASE WHEN _mode='aucune' THEN NULL ELSE _valeur END, updated_at=now() WHERE id=_devis_id;
  RETURN devis_calculer(_devis_id);
END $function$;

CREATE OR REPLACE FUNCTION public.devis_option_inclure(_ligne_id uuid, _incluse boolean)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM devis_assert_ecriture(devis_de_ligne(_ligne_id));
  PERFORM set_config('app.devis_rpc','on',true);
  UPDATE devis_lignes SET option_incluse=coalesce(_incluse,false), updated_at=now() WHERE id=_ligne_id AND type='option';
  IF NOT FOUND THEN RAISE EXCEPTION 'Ligne option introuvable'; END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.devis_marquer_envoye(_devis_id uuid, _date date DEFAULT CURRENT_DATE)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE d record; v_ht numeric; v_avance boolean := false;
BEGIN
  IF auth.jwt()->>'client_id' IS NOT NULL THEN RAISE EXCEPTION 'Envoi réservé à l''application' USING ERRCODE='42501'; END IF;
  SELECT * INTO d FROM devis WHERE id=_devis_id AND redige_dans_staffing AND NOT est_modele FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Devis introuvable'; END IF;
  IF NOT devis_peut_valider(_devis_id) THEN RAISE EXCEPTION 'Envoi réservé au chargé d''affaires de l''affaire ou à un admin' USING ERRCODE='42501'; END IF;
  IF d.statut_redaction <> 'valide' THEN RAISE EXCEPTION 'Seul un devis validé peut être envoyé'; END IF;
  IF _date IS NULL OR _date > current_date + 1 THEN RAISE EXCEPTION 'Date d''envoi invalide'; END IF;
  v_ht := coalesce((d.totaux_snapshot->>'net_ht')::numeric, (d.totaux_snapshot->>'total_ht')::numeric, d.montant_ht);
  PERFORM set_config('app.devis_rpc','on',true);
  UPDATE devis SET statut_redaction='transfere', date_envoi=_date, updated_at=now() WHERE id=_devis_id;
  IF EXISTS (SELECT 1 FROM affaires WHERE id=d.affaire_id AND phase='opportunite') THEN
    v_avance := devis_opp_avancer(d.affaire_id,'envoye',
      format('Devis %s (R%s) envoyé le %s — %s € net HT', d.numero, d.version, to_char(_date,'DD/MM/YYYY'), to_char(v_ht,'FM999G999G990D00')));
    UPDATE affaires SET ca_estime_ht=v_ht, updated_at=now() WHERE id=d.affaire_id;
    INSERT INTO opportunite_jalons(affaire_id,etape,date_atteinte,ordre) VALUES(d.affaire_id,'devis_envoye',_date,2)
      ON CONFLICT (affaire_id,etape) DO UPDATE SET date_atteinte=EXCLUDED.date_atteinte, updated_at=now();
  END IF;
  RETURN jsonb_build_object('devis_id',_devis_id,'statut_avance',v_avance,'ca_estime_ht',v_ht);
END $function$;

CREATE OR REPLACE FUNCTION public.devis_lister_global(_recherche text DEFAULT NULL, _statuts text[] DEFAULT NULL,
  _charge_affaires_id uuid DEFAULT NULL, _limit int DEFAULT 200, _offset int DEFAULT 0)
 RETURNS TABLE(id uuid, numero text, version int, statut_redaction devis_redaction_statut, affaire_id uuid, affaire_numero text,
   affaire_nom text, client_nom text, net_ht numeric, date_devis date, charge_affaires_id uuid, charge_affaires_nom text, updated_at timestamptz)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT d.id, d.numero, d.version, d.statut_redaction, a.id, a.numero::text, a.nom, c.nom,
         coalesce((d.totaux_snapshot->>'net_ht')::numeric, (devis_calculer_interne(d.id)->>'net_ht')::numeric),
         d.date_devis, r.employe_id, trim(coalesce(e.prenom,'')||' '||coalesce(e.nom,'')), d.updated_at
    FROM devis d
    JOIN affaires a ON a.id=d.affaire_id
    LEFT JOIN clients c ON c.id=d.client_id
    LEFT JOIN affaire_roles r ON r.affaire_id=a.id AND r.role='charge_affaires'
    LEFT JOIN employes e ON e.id=r.employe_id
   WHERE d.redige_dans_staffing AND NOT d.est_modele
     AND current_user_has_capability('devis.view') AND devis_peut_lire(d.id)
     AND (_statuts IS NULL OR d.statut_redaction::text = ANY(_statuts))
     AND (_charge_affaires_id IS NULL OR r.employe_id=_charge_affaires_id)
     AND (_recherche IS NULL OR concat_ws(' ',d.numero,a.numero,a.nom,c.nom) ILIKE '%'||_recherche||'%')
   ORDER BY d.updated_at DESC, d.id
   LIMIT LEAST(coalesce(_limit,200),500) OFFSET coalesce(_offset,0);
$function$;

REVOKE ALL ON FUNCTION public.devis_lister_global(text,text[],uuid,int,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devis_lister_global(text,text[],uuid,int,int) TO authenticated;
REVOKE ALL ON FUNCTION public.devis_remise_modifier(uuid,text,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devis_remise_modifier(uuid,text,numeric) TO authenticated;
REVOKE ALL ON FUNCTION public.devis_option_inclure(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devis_option_inclure(uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.devis_statut_changer(_devis_id uuid, _statut devis_redaction_statut)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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

CREATE OR REPLACE FUNCTION public.devis_lire_client(_devis_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
    'total_ht',v_calc->'total_ht','remise',coalesce(v_calc->'remise','0'::jsonb),'net_ht',coalesce(v_calc->'net_ht',v_calc->'total_ht'),'tva',v_calc->'tva','tva_pct',v_calc->'tva_pct','ttc',v_calc->'ttc','options_ht',v_calc->'options_ht');
END $function$;

CREATE OR REPLACE FUNCTION public.devis_copier_sous_arbre(_src_devis uuid, _dst_devis uuid, _racine uuid, _parent_dst uuid, _reevaluer boolean, _ordre numeric DEFAULT NULL::numeric)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
    INSERT INTO devis_lignes(devis_id,parent_id,type,ordre,libelle,quantite,descriptif_client,longueur_mm,largeur_mm,hauteur_mm,finition,texte,interne,source_ligne_id,option_incluse)
    SELECT _dst_devis,v_parent,type,CASE WHEN rec.depth=0 AND _ordre IS NOT NULL THEN _ordre ELSE ordre END,libelle,quantite,descriptif_client,longueur_mm,largeur_mm,hauteur_mm,finition,texte,interne,id,option_incluse
    FROM devis_lignes WHERE id=rec.id RETURNING id INTO v_new;
    v_map := v_map || jsonb_build_object(rec.id::text, v_new);

    INSERT INTO devis_heures(ligne_id,poste_id,niveau,heures,par_unite,taux_vente,taux_grille,cout_revient,ordre,montant_force)
    SELECT v_new,h.poste_id,h.niveau,h.heures,h.par_unite,
      CASE WHEN _reevaluer THEN coalesce(g.taux_vente,h.taux_vente) ELSE h.taux_vente END,
      CASE WHEN _reevaluer THEN coalesce(g.taux_vente,h.taux_grille) ELSE h.taux_grille END,
      CASE WHEN _reevaluer THEN coalesce(g.cout_revient,h.cout_revient) ELSE h.cout_revient END, h.ordre, h.montant_force
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

    INSERT INTO devis_lignes_libres(ligne_id,categorie,forfait_cle,designation,unite,quantite,prix_achat,prix_forfait,coefficient,par_unite,ordre,heures_info,poste_info_id)
    SELECT v_new,f.categorie,f.forfait_cle,f.designation,f.unite,f.quantite,f.prix_achat,
      CASE WHEN _reevaluer AND f.forfait_cle IS NOT NULL THEN coalesce((SELECT valeur FROM v_devis_parametres_courants WHERE cle=f.forfait_cle),f.prix_forfait) ELSE f.prix_forfait END,
      f.coefficient,f.par_unite,f.ordre,f.heures_info,f.poste_info_id
    FROM devis_lignes_libres f WHERE f.ligne_id=rec.id AND f.supprime_le IS NULL;

    INSERT INTO devis_photos(devis_id,ligne_id,storage_path,thumb_path,mime,width,height,size_bytes,legende,visible_client,ordre)
    SELECT _dst_devis,v_new,storage_path,thumb_path,mime,width,height,size_bytes,legende,visible_client,ordre
    FROM devis_photos WHERE ligne_id=rec.id AND deleted_at IS NULL;
  END LOOP;
  RETURN CASE WHEN _racine IS NULL THEN NULL ELSE (v_map->>_racine::text)::uuid END;
END $function$;

CREATE OR REPLACE FUNCTION public.devis_nouvelle_version(_devis_id uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE s record; v_version int; v_id uuid;
BEGIN
  PERFORM devis_assert_ecriture(_devis_id, false);
  SELECT * INTO s FROM devis WHERE id=_devis_id;
  IF s.est_modele THEN RAISE EXCEPTION 'Un modèle ne se versionne pas'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('devis_version:'||s.affaire_id::text));
  SELECT coalesce(max(version),0)+1 INTO v_version FROM devis WHERE affaire_id=s.affaire_id AND redige_dans_staffing AND NOT est_modele;
  INSERT INTO devis(affaire_id,numero,libelle,statut,redige_dans_staffing,version,version_precedente_id,statut_redaction,client_id,contact_id,
                    client_final_id,date_devis,validite_jours,tva_pct,coef_materiaux_defaut,modele_origine_id,auteur_id,remise_mode,remise_valeur)
  VALUES(s.affaire_id, regexp_replace(s.numero,'-R\d+$','')||'-R'||v_version, s.libelle,'brouillon',true,v_version,s.id,'brouillon',
         s.client_id,s.contact_id,s.client_final_id,current_date,s.validite_jours,s.tva_pct,s.coef_materiaux_defaut,s.modele_origine_id,auth.uid(),s.remise_mode,s.remise_valeur)
  RETURNING id INTO v_id;
  PERFORM devis_copier_sous_arbre(_devis_id, v_id, NULL, NULL, false);
  RETURN v_id;
END $function$;

NOTIFY pgrst, 'reload schema';