CREATE OR REPLACE FUNCTION public.opportunites_planning_lire()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_couts boolean; v_params jsonb; v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT current_user_has_capability('opportunites.planning.view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  v_couts := current_user_has_capability('devis.couts');

  SELECT coalesce(jsonb_object_agg(cle, valeur),'{}'::jsonb) INTO v_params
    FROM v_devis_parametres_courants WHERE cle LIKE 'opp_plan_%' OR cle LIKE 'proba_%';

  WITH a AS (
    SELECT a.id, a.numero, a.nom, a.statut_opportunite::text st, a.taille::text taille,
           a.date_montage, a.date_demontage, a.date_evenement_debut, a.date_evenement_fin,
           a.charge_affaires_id, a.client_id
      FROM affaires a
     WHERE a.typologie = 'prototype' AND a.archived_at IS NULL
       AND a.statut_opportunite IN ('a_faire','envoye','a_l_etude','presque_gagne')
       AND coalesce(a.numero,'') NOT IN ('9440','9462')),
  d AS (
    SELECT DISTINCT ON (dv.affaire_id) dv.affaire_id, dv.id, dv.montant_ht, dv.redige_dans_staffing, dv.version
      FROM devis dv JOIN a ON a.id = dv.affaire_id
     WHERE dv.supprime_le IS NULL AND NOT coalesce(dv.est_modele,false)
     ORDER BY dv.affaire_id, dv.created_at DESC, dv.version DESC),
  c AS (SELECT d.*, CASE WHEN d.redige_dans_staffing THEN devis_calculer_interne(d.id) END calc FROM d),
  lt AS (
    WITH RECURSIVE t AS (
      SELECT l.id, l.devis_id, (l.type='option' AND NOT l.option_incluse) opt, l.quantite::numeric q
        FROM devis_lignes l JOIN d ON d.id=l.devis_id WHERE l.parent_id IS NULL AND l.supprime_le IS NULL
      UNION ALL
      SELECT l.id, t.devis_id, t.opt OR (l.type='option' AND NOT l.option_incluse), t.q*coalesce(l.quantite,1)
        FROM devis_lignes l JOIN t ON l.parent_id=t.id WHERE l.supprime_le IS NULL)
    SELECT * FROM t WHERE NOT opt),
  mat AS (
    SELECT lt.devis_id, jsonb_agg(jsonb_build_object(
             'materiau_id', m.materiau_id, 'designation', m.designation, 'unite', m.unite,
             'fournisseur', m.fournisseur,
             'quantite', round(m.quantite*coalesce(lt.q,1),3),
             'prix_achat', CASE WHEN v_couts THEN m.prix_achat END,
             'a_prix', coalesce(m.prix_achat,0) > 0) ORDER BY m.designation) j
      FROM devis_materiaux m JOIN lt ON lt.id=m.ligne_id
     WHERE m.supprime_le IS NULL AND coalesce(m.quantite,0) <> 0
     GROUP BY lt.devis_id),
  lib AS (
    SELECT lt.devis_id, jsonb_agg(jsonb_build_object(
             'designation', x.designation, 'unite', x.unite, 'categorie', x.categorie,
             'quantite', round(x.quantite*CASE WHEN x.par_unite THEN coalesce(lt.q,1) ELSE 1 END,3)) ORDER BY x.designation) j
      FROM devis_lignes_libres x JOIN lt ON lt.id=x.ligne_id
     WHERE x.supprime_le IS NULL
     GROUP BY lt.devis_id),
  act AS (
    SELECT DISTINCT ON (o.affaire_id) o.affaire_id, jsonb_build_object('type',o.type,'texte',left(o.texte,300),'due',o.prochaine_action_due_le,'date',o.date) j
      FROM opportunite_actions o JOIN a ON a.id=o.affaire_id
     ORDER BY o.affaire_id, (o.prochaine_action_due_le IS NULL OR o.prochaine_action_due_le < current_date), o.prochaine_action_due_le, o.date DESC)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'affaire_id', a.id, 'numero', a.numero, 'nom', a.nom, 'statut', a.st, 'taille', a.taille,
      'date_montage', a.date_montage, 'date_demontage', a.date_demontage,
      'date_evenement_debut', a.date_evenement_debut, 'date_evenement_fin', a.date_evenement_fin,
      'charge_affaires_id', a.charge_affaires_id,
      'charge_affaires_nom', (SELECT pr.full_name FROM profiles pr WHERE pr.id=a.charge_affaires_id),
      'client_nom', (SELECT coalesce(cl.raison_sociale, cl.nom) FROM clients cl WHERE cl.id=a.client_id),
      'devis_id', c.id,
      'montant_ht', CASE WHEN v_couts THEN coalesce(c.montant_ht, (c.calc->>'net_ht')::numeric) END,
      'heures_fabrication', (SELECT coalesce(sum(value::numeric),0) FROM jsonb_each_text(coalesce(c.calc->'heures_metier','{}'::jsonb)) WHERE key IN ('1','2','3','4','5','9')),
      'materiaux', coalesce(mat.j,'[]'::jsonb),
      'autres_lignes', coalesce(lib.j,'[]'::jsonb),
      'prochaine_action', act.j) ORDER BY a.date_montage NULLS LAST, a.numero), '[]'::jsonb)
    INTO v_rows
    FROM a LEFT JOIN c ON c.affaire_id=a.id LEFT JOIN mat ON mat.devis_id=c.id
           LEFT JOIN lib ON lib.devis_id=c.id LEFT JOIN act ON act.affaire_id=a.id;

  RETURN jsonb_build_object('couts', v_couts, 'parametres', v_params, 'opportunites', v_rows);
END $function$;

REVOKE EXECUTE ON FUNCTION public.opportunites_planning_lire() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.opportunites_planning_lire() TO authenticated;