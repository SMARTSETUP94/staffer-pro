CREATE OR REPLACE FUNCTION public.cleanup_fabrication_orphelins(p_affaire_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_affaire_numero text;
  v_email text;
  v_supprimes int := 0;
  v_bloques int := 0;
  v_orphelins_bloques jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.mcp_assert_legacy_oauth_write('cleanup_fabrication_orphelins');
  IF NOT is_chef_or_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT numero INTO v_affaire_numero FROM affaires WHERE id = p_affaire_id;
  SELECT email INTO v_email FROM profiles WHERE id = auth.uid();

  -- Liste les orphelins bloqués (avec dépendances)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', fo.id, 'reference', fo.reference, 'nom', fo.nom,
    'has_heures', EXISTS(SELECT 1 FROM heures_saisies hs WHERE hs.fabrication_objet_id = fo.id),
    'has_spo', EXISTS(SELECT 1 FROM staffing_plan_object spo WHERE spo.objet_id = fo.id),
    'has_assign', EXISTS(SELECT 1 FROM assignation_objets ao WHERE ao.objet_id = fo.id)
  )), '[]'::jsonb), COUNT(*)
  INTO v_orphelins_bloques, v_bloques
  FROM fabrication_objets fo
  WHERE fo.affaire_id = p_affaire_id
    AND fo.devis_id IS NULL
    AND (
      EXISTS(SELECT 1 FROM heures_saisies hs WHERE hs.fabrication_objet_id = fo.id)
      OR EXISTS(SELECT 1 FROM staffing_plan_object spo WHERE spo.objet_id = fo.id)
      OR EXISTS(SELECT 1 FROM assignation_objets ao WHERE ao.objet_id = fo.id)
    );

  -- Supprime les orphelins SANS dépendances (les fabrication_etapes seront cascade)
  DELETE FROM fabrication_etapes
  WHERE objet_id IN (
    SELECT fo.id FROM fabrication_objets fo
    WHERE fo.affaire_id = p_affaire_id
      AND fo.devis_id IS NULL
      AND NOT EXISTS(SELECT 1 FROM heures_saisies hs WHERE hs.fabrication_objet_id = fo.id)
      AND NOT EXISTS(SELECT 1 FROM staffing_plan_object spo WHERE spo.objet_id = fo.id)
      AND NOT EXISTS(SELECT 1 FROM assignation_objets ao WHERE ao.objet_id = fo.id)
  );

  DELETE FROM fabrication_objets fo
  WHERE fo.affaire_id = p_affaire_id
    AND fo.devis_id IS NULL
    AND NOT EXISTS(SELECT 1 FROM heures_saisies hs WHERE hs.fabrication_objet_id = fo.id)
    AND NOT EXISTS(SELECT 1 FROM staffing_plan_object spo WHERE spo.objet_id = fo.id)
    AND NOT EXISTS(SELECT 1 FROM assignation_objets ao WHERE ao.objet_id = fo.id);
  GET DIAGNOSTICS v_supprimes = ROW_COUNT;

  -- Audit (uniquement si quelque chose a été fait)
  IF v_supprimes > 0 THEN
    INSERT INTO devis_deletion_log (
      devis_id, devis_numero, affaire_id, affaire_numero,
      action, deleted_by, deleted_by_email,
      objets_supprimes, postes_supprimes, objets_archives,
      heures_supprimees, heures_preservees
    ) VALUES (
      gen_random_uuid(), 'CLEANUP-ORPHELINS', p_affaire_id, v_affaire_numero,
      'cleanup_orphelins', auth.uid(), v_email,
      v_supprimes, 0, 0, 0, 0
    );
  END IF;

  RETURN jsonb_build_object(
    'supprimes', v_supprimes,
    'bloques', v_bloques,
    'orphelins_bloques', v_orphelins_bloques
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_devis_atomique(p_devis_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_devis record;
  v_import record;
  v_email text;
  v_heures_validees int;
  v_heures_non_validees int;
  v_postes_supprimes int := 0;
  v_objets_supprimes int := 0;
  v_objets_archives int := 0;
  v_action text;
  v_cleanup jsonb;
BEGIN
  PERFORM public.mcp_assert_legacy_oauth_write('delete_devis_atomique');
  IF NOT is_chef_or_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT id, numero, affaire_id INTO v_devis
  FROM devis WHERE id = p_devis_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Devis introuvable';
  END IF;

  SELECT * INTO v_import FROM devis_imports
  WHERE devis_id = p_devis_id ORDER BY created_at DESC LIMIT 1;

  SELECT email INTO v_email FROM profiles WHERE id = auth.uid();

  SELECT COUNT(*) INTO v_heures_validees
  FROM heures_saisies WHERE devis_id = p_devis_id AND statut = 'valide';

  SELECT COUNT(*) INTO v_heures_non_validees
  FROM heures_saisies WHERE devis_id = p_devis_id AND statut <> 'valide';

  DELETE FROM heures_saisies WHERE devis_id = p_devis_id AND statut <> 'valide';

  DELETE FROM devis_postes WHERE devis_id = p_devis_id;
  GET DIAGNOSTICS v_postes_supprimes = ROW_COUNT;

  IF v_heures_validees > 0 THEN
    v_action := 'archived';

    UPDATE fabrication_objets SET archive = true
    WHERE devis_id = p_devis_id
      AND id IN (SELECT DISTINCT fabrication_objet_id FROM heures_saisies
                 WHERE devis_id = p_devis_id AND statut = 'valide' AND fabrication_objet_id IS NOT NULL);
    GET DIAGNOSTICS v_objets_archives = ROW_COUNT;

    DELETE FROM fabrication_objets
    WHERE devis_id = p_devis_id
      AND id NOT IN (SELECT DISTINCT fabrication_objet_id FROM heures_saisies
                     WHERE devis_id = p_devis_id AND statut = 'valide' AND fabrication_objet_id IS NOT NULL);
    GET DIAGNOSTICS v_objets_supprimes = ROW_COUNT;

    UPDATE devis SET archive = true, updated_at = now() WHERE id = p_devis_id;
  ELSE
    v_action := 'deleted';

    DELETE FROM fabrication_objets WHERE devis_id = p_devis_id;
    GET DIAGNOSTICS v_objets_supprimes = ROW_COUNT;

    UPDATE assignations SET devis_id = NULL WHERE devis_id = p_devis_id;

    DELETE FROM devis WHERE id = p_devis_id;
  END IF;

  DELETE FROM devis_imports WHERE devis_id = p_devis_id;

  -- Cleanup orphelins de l'affaire (filet anti-récidive)
  v_cleanup := cleanup_fabrication_orphelins(v_devis.affaire_id);

  INSERT INTO devis_deletion_log (
    devis_id, devis_numero, affaire_id, affaire_numero,
    fichier_nom, fichier_hash, action,
    postes_supprimes, objets_supprimes, objets_archives,
    heures_supprimees, heures_preservees,
    deleted_by, deleted_by_email
  ) VALUES (
    p_devis_id, v_devis.numero, v_devis.affaire_id,
    (SELECT numero FROM affaires WHERE id = v_devis.affaire_id),
    v_import.fichier_nom, v_import.fichier_hash, v_action,
    v_postes_supprimes, v_objets_supprimes, v_objets_archives,
    v_heures_non_validees, v_heures_validees,
    auth.uid(), v_email
  );

  RETURN json_build_object(
    'action', v_action,
    'postes_supprimes', v_postes_supprimes,
    'objets_supprimes', v_objets_supprimes,
    'objets_archives', v_objets_archives,
    'heures_supprimees', v_heures_non_validees,
    'heures_preservees', v_heures_validees,
    'orphelins_cleanup', v_cleanup
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.refresh_affaire_equipe_historique(_affaire_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_typologie text;
  v_client text;
  v_phase text;
  v_statut text;
  v_numero text;
  v_date_debut date;
  v_date_fin date;
  v_cloturee boolean;
BEGIN
  PERFORM public.mcp_assert_legacy_oauth_write('refresh_affaire_equipe_historique');
  -- Snapshot affaire
  SELECT
    compute_affaire_typologie(a.numero),
    a.client,
    a.phase::text,
    a.statut::text,
    a.numero,
    a.date_debut,
    a.date_fin_prevue,
    (a.statut::text IN ('termine','annule'))
  INTO v_typologie, v_client, v_phase, v_statut, v_numero, v_date_debut, v_date_fin, v_cloturee
  FROM affaires a
  WHERE a.id = _affaire_id;

  IF NOT FOUND THEN
    -- Affaire supprimée → on purge l'historique associé
    DELETE FROM affaire_equipe_historique WHERE affaire_id = _affaire_id;
    RETURN;
  END IF;

  -- Purge puis recalcul
  DELETE FROM affaire_equipe_historique WHERE affaire_id = _affaire_id;

  WITH chefs AS (
    SELECT chef_chantier_id AS chef_id, 'chef_chantier'::text AS chef_role FROM affaires WHERE id = _affaire_id AND chef_chantier_id IS NOT NULL
    UNION ALL
    SELECT responsable_montage_id, 'responsable_montage'::text FROM affaires WHERE id = _affaire_id AND responsable_montage_id IS NOT NULL
    UNION ALL
    SELECT responsable_demontage_id, 'responsable_demontage'::text FROM affaires WHERE id = _affaire_id AND responsable_demontage_id IS NOT NULL
    UNION ALL
    SELECT chef_projet_id, 'chef_projet'::text FROM affaires WHERE id = _affaire_id AND chef_projet_id IS NOT NULL
    UNION ALL
    SELECT charge_affaires_id, 'charge_affaires'::text FROM affaires WHERE id = _affaire_id AND charge_affaires_id IS NOT NULL
  ),
  agg AS (
    SELECT
      a.employe_id,
      e.metier_principal_id,
      e.type_contrat::text AS type_contrat,
      COUNT(*)::int AS nb_demi_jours,
      COUNT(DISTINCT a.date)::int AS nb_jours_distincts,
      MIN(a.date) AS premier_jour,
      MAX(a.date) AS dernier_jour,
      COALESCE(AVG(NULLIF(a.heures,0) / 4.0 * 100.0), 100)::numeric AS presence_pct_moyen,
      bool_or(a.statut_confirmation = 'refusee') AS a_refuse,
      MAX(a.updated_at) AS derniere_assignation_at
    FROM assignations a
    JOIN employes e ON e.id = a.employe_id
    WHERE a.affaire_id = _affaire_id
    GROUP BY a.employe_id, e.metier_principal_id, e.type_contrat
  ),
  absent_flags AS (
    SELECT DISTINCT a.employe_id
    FROM assignations a
    JOIN absences ab ON ab.employe_id = a.employe_id
                    AND ab.valide = true
                    AND a.date BETWEEN ab.date_debut AND ab.date_fin
    WHERE a.affaire_id = _affaire_id
  )
  INSERT INTO affaire_equipe_historique (
    affaire_id, affaire_numero, client, typologie, phase, affaire_statut, affaire_cloturee,
    date_debut_affaire, date_fin_affaire,
    chef_id, chef_role,
    employe_id, metier_principal_id, type_contrat,
    nb_demi_jours, nb_jours_distincts, premier_jour, dernier_jour,
    presence_pct_moyen, a_refuse, a_ete_absent,
    derniere_assignation_at
  )
  SELECT
    _affaire_id, v_numero, v_client, v_typologie, v_phase, v_statut, v_cloturee,
    v_date_debut, v_date_fin,
    c.chef_id, c.chef_role,
    g.employe_id, g.metier_principal_id, g.type_contrat,
    g.nb_demi_jours, g.nb_jours_distincts, g.premier_jour, g.dernier_jour,
    g.presence_pct_moyen, g.a_refuse,
    (af.employe_id IS NOT NULL),
    g.derniere_assignation_at
  FROM chefs c
  CROSS JOIN agg g
  LEFT JOIN absent_flags af ON af.employe_id = g.employe_id
  WHERE c.chef_id <> g.employe_id;  -- on ne se compte pas soi-même
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_vehicule_chauffeurs_autorises(_vehicule_id uuid, _employe_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.mcp_assert_legacy_oauth_write('set_vehicule_chauffeurs_autorises');
  IF NOT public.is_chef_or_admin() THEN
    RAISE EXCEPTION 'Action réservée aux chefs de chantier et administrateurs.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _vehicule_id IS NULL THEN
    RAISE EXCEPTION 'vehicule_id est obligatoire.' USING ERRCODE = 'check_violation';
  END IF;

  -- Supprime les autorisations qui ne sont plus dans la nouvelle liste
  DELETE FROM public.vehicule_chauffeurs_autorises
  WHERE vehicule_id = _vehicule_id
    AND (
      _employe_ids IS NULL
      OR array_length(_employe_ids, 1) IS NULL
      OR NOT (employe_id = ANY (_employe_ids))
    );

  -- Insère les nouvelles autorisations (idempotent grâce à ON CONFLICT)
  IF _employe_ids IS NOT NULL AND array_length(_employe_ids, 1) IS NOT NULL THEN
    INSERT INTO public.vehicule_chauffeurs_autorises (vehicule_id, employe_id)
    SELECT _vehicule_id, unnest(_employe_ids)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.upsert_feuille_route_ligne(_date date, _affaire_id uuid, _patch jsonb)
 RETURNS feuille_route_lignes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.feuille_route_lignes;
  v_uid uuid := auth.uid();
BEGIN
  PERFORM public.mcp_assert_legacy_oauth_write('upsert_feuille_route_ligne');
  IF NOT is_chef_or_admin() THEN
    RAISE EXCEPTION 'forbidden: chef ou admin requis' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.feuille_route_lignes AS frl (
    date, affaire_id, type_operation, horaire_rdv, adresse_override,
    commentaires, vehicules_ids, created_by
  )
  VALUES (
    _date,
    _affaire_id,
    NULLIF(_patch->>'type_operation', ''),
    CASE WHEN _patch ? 'horaire_rdv' AND _patch->>'horaire_rdv' <> ''
         THEN (_patch->>'horaire_rdv')::time ELSE NULL END,
    NULLIF(_patch->>'adresse_override', ''),
    NULLIF(_patch->>'commentaires', ''),
    COALESCE(
      (SELECT array_agg((value)::uuid)
         FROM jsonb_array_elements_text(COALESCE(_patch->'vehicules_ids', '[]'::jsonb))),
      '{}'::uuid[]
    ),
    v_uid
  )
  ON CONFLICT (date, affaire_id) DO UPDATE SET
    type_operation = CASE WHEN _patch ? 'type_operation'
                          THEN NULLIF(_patch->>'type_operation', '')
                          ELSE frl.type_operation END,
    horaire_rdv = CASE WHEN _patch ? 'horaire_rdv'
                       THEN CASE WHEN _patch->>'horaire_rdv' = '' OR _patch->>'horaire_rdv' IS NULL
                                 THEN NULL
                                 ELSE (_patch->>'horaire_rdv')::time END
                       ELSE frl.horaire_rdv END,
    adresse_override = CASE WHEN _patch ? 'adresse_override'
                            THEN NULLIF(_patch->>'adresse_override', '')
                            ELSE frl.adresse_override END,
    commentaires = CASE WHEN _patch ? 'commentaires'
                        THEN NULLIF(_patch->>'commentaires', '')
                        ELSE frl.commentaires END,
    vehicules_ids = CASE WHEN _patch ? 'vehicules_ids'
                         THEN COALESCE(
                           (SELECT array_agg((value)::uuid)
                              FROM jsonb_array_elements_text(_patch->'vehicules_ids')),
                           '{}'::uuid[])
                         ELSE frl.vehicules_ids END,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$
;