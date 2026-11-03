CREATE OR REPLACE FUNCTION public.pipeline_indicateurs(_affaire_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE v_ids uuid[]; v_proba jsonb; v_hj numeric; v_rows jsonb; v_hm jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF coalesce(array_length(_affaire_ids,1),0) > 2000 THEN RAISE EXCEPTION '2000 opportunités maximum'; END IF;
  SELECT array_agg(a.id) INTO v_ids FROM affaires a
   WHERE a.phase='opportunite' AND a.archived_at IS NULL
     AND a.statut_opportunite IN ('a_faire','envoye','a_l_etude','presque_gagne')
     AND (_affaire_ids IS NULL OR a.id = ANY(_affaire_ids));
  v_ids := coalesce(v_ids, '{}');
  SELECT jsonb_object_agg(s, coalesce((SELECT valeur FROM v_devis_parametres_courants WHERE cle='proba_'||s), d)/100.0)
    INTO v_proba FROM (VALUES ('a_faire',10::numeric),('envoye',30),('a_l_etude',40),('presque_gagne',80)) x(s,d);
  v_hj := coalesce(nullif((SELECT valeur FROM v_devis_parametres_courants WHERE cle='heures_par_jour_be'),0), 8);

  WITH a AS (SELECT id, statut_opportunite::text st, ca_estime_ht FROM affaires WHERE id = ANY(v_ids)),
  d AS (SELECT * FROM devis_derniers_par_affaire(v_ids)),
  c AS (SELECT d.affaire_id, d.devis_id, d.version, d.numero_progbat, d.date_envoi, devis_calculer(d.devis_id) calc, devis_heures_be_net(d.devis_id) hbe FROM d),
  act AS (SELECT o.affaire_id, max(o.date) FILTER (WHERE o.type='devis_envoye') d_env, max(o.date) d_max
            FROM opportunite_actions o WHERE o.affaire_id = ANY(v_ids) GROUP BY o.affaire_id),
  r0 AS (
    SELECT a.id affaire_id, a.st, a.ca_estime_ht, c.devis_id, c.version, c.numero_progbat, c.calc,
      round((c.calc->>'net_ht')::numeric,2) net_brut,
      coalesce(c.hbe,0) hbe,
      coalesce(c.date_envoi, act.d_env::date) ref_envoi, act.d_max
    FROM a LEFT JOIN c ON c.affaire_id=a.id LEFT JOIN act ON act.affaire_id=a.id),
  r AS (
    SELECT r0.*,
      -- Devis absent ou à 0 € : le CA estimé prend le relais (compté à part) ; dès que le devis dépasse 0 €, il compte seul.
      CASE WHEN (devis_id IS NULL OR coalesce(net_brut,0) <= 0) AND coalesce(ca_estime_ht,0) > 0 THEN round(ca_estime_ht,2) END estime,
      CASE WHEN devis_id IS NOT NULL AND (coalesce(net_brut,0) > 0 OR coalesce(ca_estime_ht,0) <= 0) THEN net_brut END net_ht
    FROM r0),
  r2 AS (SELECT r.*, (r.st='envoye' AND r.ref_envoi IS NOT NULL AND r.ref_envoi < current_date - 7
                     AND (r.d_max IS NULL OR r.d_max::date <= r.ref_envoi)) a_relancer FROM r)
  SELECT coalesce(jsonb_agg(jsonb_build_object('affaire_id',affaire_id,'statut',st,'devis_id',devis_id,'version',version,
           'numero_progbat',numero_progbat,'net_ht',net_ht,'estime',estime,'a_relancer',a_relancer,
           'heures',(SELECT coalesce(sum(value::numeric),0) FROM jsonb_each_text(coalesce(calc->'heures_metier','{}'::jsonb))),
           'heures_be',hbe,'heures_metier',coalesce(calc->'heures_metier','{}'::jsonb))),'[]'::jsonb)
    INTO v_rows FROM r2;

  SELECT coalesce(jsonb_agg(jsonb_build_object('metier_id',k,'libelle',coalesce(m.libelle,'Sans métier'),'heures',h) ORDER BY h DESC),'[]'::jsonb) INTO v_hm
    FROM (SELECT e.key k, round(sum(e.value::numeric),1) h FROM jsonb_array_elements(v_rows) x, jsonb_each_text(x->'heures_metier') e GROUP BY e.key) s
    LEFT JOIN metiers m ON m.id::text = s.k WHERE h <> 0;

  RETURN jsonb_build_object(
    'probabilites', v_proba, 'heures_par_jour_be', v_hj,
    'totaux', (SELECT jsonb_build_object(
        'nb', count(*),
        'chiffre', round(coalesce(sum((x->>'net_ht')::numeric),0),2),
        'estime', round(coalesce(sum((x->>'estime')::numeric),0),2),
        'pondere', round(coalesce(sum((coalesce((x->>'net_ht')::numeric,0)+coalesce((x->>'estime')::numeric,0)) * (v_proba->>(x->>'statut'))::numeric),0),2),
        'heures', round(coalesce(sum((x->>'heures')::numeric),0),1),
        'heures_be', round(coalesce(sum((x->>'heures_be')::numeric),0),1),
        'jours_be', round(coalesce(sum((x->>'heures_be')::numeric),0)/v_hj,1),
        'relance_nb', count(*) FILTER (WHERE (x->>'a_relancer')::boolean),
        'relance_montant', round(coalesce(sum(coalesce((x->>'net_ht')::numeric,(x->>'estime')::numeric,0)) FILTER (WHERE (x->>'a_relancer')::boolean),0),2))
      FROM jsonb_array_elements(v_rows) x),
    'heures_metier', v_hm,
    'affaires', (SELECT coalesce(jsonb_agg(x - 'heures_metier'),'[]'::jsonb) FROM jsonb_array_elements(v_rows) x));
END $function$;