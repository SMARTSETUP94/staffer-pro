-- Fermeture des accès aux fonctions SECURITY DEFINER (12/11/2026). Restrictions uniquement.
-- Textes "avant" : /mnt/documents/fermeture-acces-fonctions-migration.sql et fichier de retour arrière.

CREATE OR REPLACE FUNCTION public.detect_client_duplicates(min_similarity real DEFAULT 0.5)
 RETURNS TABLE(client_a_id uuid, client_a_nom text, client_a_domaines text[], client_a_nb_affaires bigint, client_a_nb_contacts bigint, client_b_id uuid, client_b_nom text, client_b_domaines text[], client_b_nb_affaires bigint, client_b_nb_contacts bigint, similarity real)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.is_admin() OR public.current_user_has_capability('clients.merge')) THEN
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT
    a.id, a.nom, a.domaines_email,
    (SELECT count(*) FROM public.affaires WHERE client_id = a.id),
    (SELECT count(*) FROM public.client_contacts WHERE client_id = a.id),
    b.id, b.nom, b.domaines_email,
    (SELECT count(*) FROM public.affaires WHERE client_id = b.id),
    (SELECT count(*) FROM public.client_contacts WHERE client_id = b.id),
    similarity(a.nom_normalise, b.nom_normalise) AS sim
  FROM public.clients a
  JOIN public.clients b
    ON a.id < b.id
   AND a.nom_normalise % b.nom_normalise
  WHERE similarity(a.nom_normalise, b.nom_normalise) >= min_similarity
  ORDER BY sim DESC, a.nom, b.nom
  LIMIT 200;
END
$function$;

CREATE OR REPLACE FUNCTION public.mes_affaires_chef(_employe_id uuid)
 RETURNS TABLE(affaire affaires, mes_roles text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT a, ARRAY_AGG(DISTINCT v.role ORDER BY v.role) AS mes_roles
  FROM public.affaires a
  JOIN public.v_chefs_par_affaire v ON v.affaire_id = a.id
  WHERE v.employe_id = _employe_id
    AND (public.is_admin() OR EXISTS (SELECT 1 FROM public.employes e WHERE e.id = _employe_id AND e.profile_id = auth.uid()))
  GROUP BY a.id, a.*
  ORDER BY (a).date_debut DESC NULLS LAST;
$function$;

CREATE OR REPLACE FUNCTION public.sync_equipes_from_plan(p_plan_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_affaire_id uuid;
  v_n2 int := 0;
  v_n2_fab int := 0;
  v_n3 int := 0;
  v_phase_updates int := 0;
BEGIN
  -- Garde 12/11/2026 : appel direct par un utilisateur connecté limité à ceux qui peuvent écrire le plan de cette affaire.
  IF auth.uid() IS NOT NULL AND NOT (public.is_admin() OR (
       public.current_user_has_capability('section.planning_fab')
       AND public.user_can_write_affaire((SELECT sp.affaire_id FROM public.staffing_plan sp WHERE sp.id = p_plan_id), 'section.planning_fab'))) THEN
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
  END IF;
  SELECT affaire_id INTO v_affaire_id
  FROM staffing_plan WHERE id = p_plan_id;

  IF v_affaire_id IS NULL THEN
    RETURN jsonb_build_object('n2_upserts', 0, 'n3_upserts', 0, 'phase_updates', 0);
  END IF;

  -- N2 : affaire_equipe (1 ligne par employe × phase normalisée du step)
  WITH ups AS (
    INSERT INTO affaire_equipe (affaire_id, employe_id, phase, added_by, removed_at, removed_by)
    SELECT DISTINCT
      v_affaire_id,
      a.employe_id,
      CASE
        WHEN s.phase IN ('commercial_etude','fabrication','montage','demontage') THEN s.phase
        ELSE 'fabrication'
      END AS phase,
      p_user_id,
      NULL::timestamptz,
      NULL::uuid
    FROM staffing_plan_assignment a
    JOIN staffing_plan_step s ON s.id = a.step_id
    WHERE s.plan_id = p_plan_id
    ON CONFLICT (affaire_id, employe_id, phase) DO UPDATE
      SET removed_at = NULL, removed_by = NULL, updated_at = now()
    RETURNING 1
  )
  SELECT count(*) INTO v_n2 FROM ups;

  -- N2-bis : garantit phase='fabrication' pour TOUT employé qui sera inséré en N3,
  -- y compris si le step a une phase != 'fabrication' (cas rare montage/demontage
  -- avec objet_id). Pré-requis du trigger enforce_objet_equipe_strict.
  WITH ups AS (
    INSERT INTO affaire_equipe (affaire_id, employe_id, phase, added_by, removed_at, removed_by)
    SELECT DISTINCT
      v_affaire_id,
      a.employe_id,
      'fabrication',
      p_user_id,
      NULL::timestamptz,
      NULL::uuid
    FROM staffing_plan_assignment a
    JOIN staffing_plan_step s ON s.id = a.step_id
    WHERE s.plan_id = p_plan_id AND s.objet_id IS NOT NULL
    ON CONFLICT (affaire_id, employe_id, phase) DO UPDATE
      SET removed_at = NULL, removed_by = NULL, updated_at = now()
    RETURNING 1
  )
  SELECT count(*) INTO v_n2_fab FROM ups;

  -- N3 : fabrication_objet_equipe (1 ligne par employe × objet)
  -- Trigger enforce_objet_equipe_strict passe naturellement grâce à N2-bis.
  WITH ups AS (
    INSERT INTO fabrication_objet_equipe (objet_id, employe_id, added_by, removed_at, removed_by)
    SELECT DISTINCT
      s.objet_id,
      a.employe_id,
      p_user_id,
      NULL::timestamptz,
      NULL::uuid
    FROM staffing_plan_assignment a
    JOIN staffing_plan_step s ON s.id = a.step_id
    WHERE s.plan_id = p_plan_id AND s.objet_id IS NOT NULL
    ON CONFLICT (objet_id, employe_id) DO UPDATE
      SET removed_at = NULL, removed_by = NULL, updated_at = now()
    RETURNING 1
  )
  SELECT count(*) INTO v_n3 FROM ups;

  -- Propagation phase steps → assignations (seulement celles sans phase déjà)
  WITH upd AS (
    UPDATE assignations asg
    SET phase = s.phase
    FROM staffing_plan_step s
    WHERE asg.staffing_plan_id = p_plan_id
      AND asg.metier_id = s.metier_id
      AND s.plan_id = p_plan_id
      AND s.phase IS NOT NULL
      AND asg.phase IS NULL
    RETURNING 1
  )
  SELECT count(*) INTO v_phase_updates FROM upd;

  RETURN jsonb_build_object(
    'n2_upserts', v_n2 + v_n2_fab,
    'n3_upserts', v_n3,
    'phase_updates', v_phase_updates
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_equipes_from_plan(p_plan_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_strategy text DEFAULT 'auto'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_affaire_id uuid;
  v_n2 int := 0;
  v_n2_fab int := 0;
  v_n3 int := 0;
  v_phase_updates int := 0;
  v_strategy text := COALESCE(p_strategy, 'auto');
BEGIN
  -- Garde 12/11/2026 : appel direct par un utilisateur connecté limité à ceux qui peuvent écrire le plan de cette affaire.
  IF auth.uid() IS NOT NULL AND NOT (public.is_admin() OR (
       public.current_user_has_capability('section.planning_fab')
       AND public.user_can_write_affaire((SELECT sp.affaire_id FROM public.staffing_plan sp WHERE sp.id = p_plan_id), 'section.planning_fab'))) THEN
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
  END IF;
  IF v_strategy NOT IN ('auto','merge','manual') THEN
    RAISE EXCEPTION 'sync_equipes_from_plan: strategy invalide %', v_strategy;
  END IF;

  SELECT affaire_id INTO v_affaire_id FROM staffing_plan WHERE id = p_plan_id;

  IF v_affaire_id IS NULL THEN
    RETURN jsonb_build_object('n2_upserts', 0, 'n3_upserts', 0, 'phase_updates', 0, 'strategy', v_strategy);
  END IF;

  IF v_strategy <> 'manual' THEN
    WITH ups AS (
      INSERT INTO affaire_equipe (affaire_id, employe_id, phase, added_by, removed_at, removed_by)
      SELECT DISTINCT
        v_affaire_id, a.employe_id,
        CASE WHEN s.phase IN ('commercial_etude','fabrication','montage','demontage') THEN s.phase ELSE 'fabrication' END,
        p_user_id, NULL::timestamptz, NULL::uuid
      FROM staffing_plan_assignment a
      JOIN staffing_plan_step s ON s.id = a.step_id
      WHERE s.plan_id = p_plan_id
      ON CONFLICT (affaire_id, employe_id, phase) DO UPDATE
        SET removed_at = CASE WHEN v_strategy = 'merge' THEN affaire_equipe.removed_at ELSE NULL END,
            removed_by = CASE WHEN v_strategy = 'merge' THEN affaire_equipe.removed_by ELSE NULL END,
            updated_at = now()
      RETURNING 1
    )
    SELECT count(*) INTO v_n2 FROM ups;

    WITH ups AS (
      INSERT INTO affaire_equipe (affaire_id, employe_id, phase, added_by, removed_at, removed_by)
      SELECT DISTINCT
        v_affaire_id, a.employe_id, 'fabrication', p_user_id, NULL::timestamptz, NULL::uuid
      FROM staffing_plan_assignment a
      JOIN staffing_plan_step s ON s.id = a.step_id
      WHERE s.plan_id = p_plan_id AND s.objet_id IS NOT NULL
      ON CONFLICT (affaire_id, employe_id, phase) DO UPDATE
        SET removed_at = CASE WHEN v_strategy = 'merge' THEN affaire_equipe.removed_at ELSE NULL END,
            removed_by = CASE WHEN v_strategy = 'merge' THEN affaire_equipe.removed_by ELSE NULL END,
            updated_at = now()
      RETURNING 1
    )
    SELECT count(*) INTO v_n2_fab FROM ups;

    WITH ups AS (
      INSERT INTO fabrication_objet_equipe (objet_id, employe_id, added_by, removed_at, removed_by)
      SELECT DISTINCT s.objet_id, a.employe_id, p_user_id, NULL::timestamptz, NULL::uuid
      FROM staffing_plan_assignment a
      JOIN staffing_plan_step s ON s.id = a.step_id
      WHERE s.plan_id = p_plan_id AND s.objet_id IS NOT NULL
      ON CONFLICT (objet_id, employe_id) DO UPDATE
        SET removed_at = CASE WHEN v_strategy = 'merge' THEN fabrication_objet_equipe.removed_at ELSE NULL END,
            removed_by = CASE WHEN v_strategy = 'merge' THEN fabrication_objet_equipe.removed_by ELSE NULL END,
            updated_at = now()
      RETURNING 1
    )
    SELECT count(*) INTO v_n3 FROM ups;
  END IF;

  WITH upd AS (
    UPDATE assignations asg
    SET phase = s.phase
    FROM staffing_plan_step s
    WHERE asg.staffing_plan_id = p_plan_id
      AND asg.metier_id = s.metier_id
      AND s.plan_id = p_plan_id
      AND s.phase IS NOT NULL
      AND asg.phase IS NULL
    RETURNING 1
  )
  SELECT count(*) INTO v_phase_updates FROM upd;

  RETURN jsonb_build_object(
    'n2_upserts', v_n2 + v_n2_fab,
    'n3_upserts', v_n3,
    'phase_updates', v_phase_updates,
    'strategy', v_strategy
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.detect_equipe_overrides(p_plan_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_affaire_id uuid;
  v_n2_removed int := 0;
  v_n2_added int := 0;
  v_n3_removed int := 0;
  v_n3_added int := 0;
  v_total_slots int := 0;
BEGIN
  -- Garde 12/11/2026 : appel direct par un utilisateur connecté limité à ceux qui peuvent écrire le plan de cette affaire.
  IF auth.uid() IS NOT NULL AND NOT (public.is_admin() OR (
       public.current_user_has_capability('section.planning_fab')
       AND public.user_can_write_affaire((SELECT sp.affaire_id FROM public.staffing_plan sp WHERE sp.id = p_plan_id), 'section.planning_fab'))) THEN
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
  END IF;
  SELECT affaire_id INTO v_affaire_id FROM staffing_plan WHERE id = p_plan_id;
  IF v_affaire_id IS NULL THEN
    RETURN jsonb_build_object('overrides', 0, 'total_slots', 0, 'ratio', 0);
  END IF;

  WITH plan_n2 AS (
    SELECT DISTINCT
      a.employe_id,
      CASE WHEN s.phase IN ('commercial_etude','fabrication','montage','demontage') THEN s.phase ELSE 'fabrication' END AS phase
    FROM staffing_plan_assignment a
    JOIN staffing_plan_step s ON s.id = a.step_id
    WHERE s.plan_id = p_plan_id
  ),
  current_n2 AS (
    SELECT employe_id, phase, removed_at FROM affaire_equipe WHERE affaire_id = v_affaire_id
  )
  SELECT
    (SELECT count(*) FROM plan_n2 p
     JOIN current_n2 c ON c.employe_id = p.employe_id AND c.phase = p.phase
     WHERE c.removed_at IS NOT NULL),
    (SELECT count(*) FROM current_n2 c
     WHERE c.removed_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM plan_n2 p WHERE p.employe_id = c.employe_id AND p.phase = c.phase))
  INTO v_n2_removed, v_n2_added;

  WITH plan_n3 AS (
    SELECT DISTINCT s.objet_id, a.employe_id
    FROM staffing_plan_assignment a
    JOIN staffing_plan_step s ON s.id = a.step_id
    WHERE s.plan_id = p_plan_id AND s.objet_id IS NOT NULL
  ),
  current_n3 AS (
    SELECT foe.objet_id, foe.employe_id, foe.removed_at
    FROM fabrication_objet_equipe foe
    JOIN fabrication_objets fo ON fo.id = foe.objet_id
    WHERE fo.affaire_id = v_affaire_id
  )
  SELECT
    (SELECT count(*) FROM plan_n3 p
     JOIN current_n3 c ON c.objet_id = p.objet_id AND c.employe_id = p.employe_id
     WHERE c.removed_at IS NOT NULL),
    (SELECT count(*) FROM current_n3 c
     WHERE c.removed_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM plan_n3 p WHERE p.objet_id = c.objet_id AND p.employe_id = c.employe_id))
  INTO v_n3_removed, v_n3_added;

  SELECT
    (SELECT count(*) FROM (
      SELECT DISTINCT a.employe_id,
        CASE WHEN s.phase IN ('commercial_etude','fabrication','montage','demontage') THEN s.phase ELSE 'fabrication' END
      FROM staffing_plan_assignment a JOIN staffing_plan_step s ON s.id = a.step_id
      WHERE s.plan_id = p_plan_id
    ) t)
    +
    (SELECT count(*) FROM (
      SELECT DISTINCT s.objet_id, a.employe_id
      FROM staffing_plan_assignment a JOIN staffing_plan_step s ON s.id = a.step_id
      WHERE s.plan_id = p_plan_id AND s.objet_id IS NOT NULL
    ) t)
  INTO v_total_slots;

  RETURN jsonb_build_object(
    'overrides', v_n2_removed + v_n2_added + v_n3_removed + v_n3_added,
    'n2_removed', v_n2_removed,
    'n2_added', v_n2_added,
    'n3_removed', v_n3_removed,
    'n3_added', v_n3_added,
    'total_slots', v_total_slots,
    'ratio', CASE WHEN v_total_slots = 0 THEN 0
                  ELSE round( ((v_n2_removed + v_n2_added + v_n3_removed + v_n3_added)::numeric / v_total_slots) * 100, 2)
             END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_effective_caps(_user_id uuid)
 RETURNS TABLE(capability text, granted boolean, scope_resolved text, source_roles app_role[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    rc.capability,
    BOOL_OR(rc.granted) AS granted,
    CASE
      WHEN BOOL_OR(rc.scope = 'all' AND rc.granted) THEN 'all'
      WHEN BOOL_OR(rc.scope = 'team' AND rc.granted) THEN 'team'
      WHEN BOOL_OR(rc.scope = 'metier' AND rc.granted) THEN 'metier'
      WHEN BOOL_OR(rc.scope = 'own' AND rc.granted) THEN 'own'
      ELSE 'none'
    END AS scope_resolved,
    ARRAY_AGG(DISTINCT ur.role) FILTER (WHERE rc.granted) AS source_roles
  FROM public.user_roles ur
  JOIN public.role_capabilities rc ON rc.role = ur.role
  WHERE ur.user_id = _user_id
    AND (auth.uid() IS NULL OR _user_id = auth.uid() OR public.is_admin())
  GROUP BY rc.capability
  ORDER BY rc.capability;
$function$;

CREATE OR REPLACE FUNCTION public.etapes_pretes_batch(_objet_ids uuid[])
 RETURNS TABLE(etape_id uuid, objet_id uuid, type_etape fabrication_etape_type, statut fabrication_etape_statut, prete boolean, manques jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    e.id,
    e.objet_id,
    e.type_etape,
    e.statut,
    COALESCE((public.etape_prete(e.id) ->> 'prete')::boolean, true),
    COALESCE(public.etape_prete(e.id) -> 'manques', '[]'::jsonb)
  FROM public.fabrication_etapes e
  WHERE e.objet_id = ANY(COALESCE(_objet_ids, ARRAY[]::uuid[]))
    AND (public.is_admin() OR public.current_user_has_capability('section.planning_fab'));
$function$;

-- Fonctions internes : appelées seulement par triggers, pg_cron ou d'autres fonctions SECURITY DEFINER.
REVOKE EXECUTE ON FUNCTION public.objet_journal_log(uuid,objet_journal_event_type,uuid,integer,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.objet_journal_log(uuid,objet_journal_event_type,uuid,integer,uuid,jsonb) TO service_role;
REVOKE EXECUTE ON FUNCTION public.refresh_affaire_equipe_historique(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_affaire_equipe_historique(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.audit_staffing_divergence() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_staffing_divergence() TO service_role;
REVOKE EXECUTE ON FUNCTION public.etape_prete(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.etape_prete(uuid) TO service_role;

-- Point 3 : retrait du droit anonyme, liste explicite figée le 12/11/2026 (92 fonctions).
-- Gardées pour anon : dispos_public_semaine, dispos_public_identifier, dispos_public_moi, dispos_public_enregistrer, dispos_public_maj_qualifs.
DO $g$
DECLARE s text;
BEGIN
  FOREACH s IN ARRAY ARRAY[
'has_role(uuid,app_role)','is_admin()','is_chef_or_admin()','prevent_delete_signed_opportunite()','preflight_delete_devis(uuid)','delete_devis_atomique(uuid)','delete_my_hors_planning_saisie(uuid)','upsert_feuille_route_ligne(date,uuid,jsonb)','cleanup_fabrication_orphelins(uuid)','import_progbat_atomique(uuid,jsonb,numeric,numeric)','submit_quiz_answer(uuid,integer)','refresh_user_quiz_stats()','upsert_intermittent(text,text,text,text,date,text,text,boolean,numeric,numeric,text)','signer_contrat_employe(uuid,text,text,text,text,text)','signer_contrat_employeur(uuid,text,text,text,text,text)','set_contrat_pdf_url(uuid,integer,text)','annuler_contrat_intermittent(uuid,text)','create_contrat_intermittent(uuid,uuid,date,date,numeric,uuid)','update_objet_statut_chef(uuid,objet_fab_statut_chef,text)','create_contrat_template_version(text,text,boolean,jsonb,text)','set_contrat_template_version_id()','is_chef_on_affaire(uuid,uuid)','current_user_is_chef_on_affaire(uuid)','mes_affaires_chef(uuid)','audit_heures_validation()','is_chef_global()','soft_delete_affaire_document(uuid)','soft_delete_objet_photo(uuid)','trg_aeh_on_assignation()','trg_aeh_on_affaire()','get_mon_equipe_type(text,integer,integer)','is_feature_flag_enabled(text)','role_capabilities_set_audit()','user_has_capability(uuid,text)','current_user_has_capability(text)','run_staffing_divergence_audit()','get_inbox_items(integer)','get_inbox_count()','dismiss_inbox_item(text)','restore_inbox_item(text)','trg_fab_etapes_journal()','trg_fab_objets_journal()','trg_objet_commentaires_journal()','trg_fab_photos_journal()','trg_spa_journal()','trg_staffing_plan_journal()','enforce_objet_equipe_strict()','resolve_saisie_heures(uuid,uuid,date,uuid)','sync_equipes_from_plan(uuid,uuid)','sync_equipes_from_plan(uuid,uuid,text)','detect_equipe_overrides(uuid)','get_active_phases_for_affaire(uuid)','user_has_cap(text)','user_cap_scope(text)','replace_user_roles(uuid,app_role[])','get_user_effective_caps(uuid)','sign_opportunite(uuid)','archive_affaire(uuid)','resolve_notification_link(uuid,text)','notifications_resolve_lien()','current_user_metier_principal()','objet_matches_user_metier(uuid)','reject_employe_metier_principal_duplicate()','cleanup_employe_metier_on_principal_change()','user_is_on_fab_objet(uuid)','fab_objet_affaire_id(uuid)','tg_emails_match_client()','detect_client_duplicates(real)','merge_clients(uuid,uuid)','import_clients_bulk(jsonb)','sync_objet_heures_colonnes()','guard_objet_lot_meme_affaire()','etapes_pretes_batch(uuid[])','valider_etape(uuid,text)','invalider_etape(uuid,text)','sync_etape_from_heures_metier()','terminer_etape(uuid,text)','guard_note_frais()','devis_on_opportunite_perdue()','devis_marquer_humain_devis()','devis_marquer_humain_enfant()','planning_terrain_lire_autorise()','planning_terrain_ecrire_autorise()','planning_terrain_references()','planning_terrain_importer(jsonb,text)','planning_terrain_semaine(date,date)','planning_terrain_affecter(uuid,date,uuid,text,text)','planning_terrain_historique_lire(integer,jsonb)','planning_terrain_historique_exporter()','planning_terrain_historique_compteurs()','planning_terrain_historique_compteurs(boolean)','planning_terrain_deplacer_affectations()'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon', s);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', s);
  END LOOP;
END
$g$;