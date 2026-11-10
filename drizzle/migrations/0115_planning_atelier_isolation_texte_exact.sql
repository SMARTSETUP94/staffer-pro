CREATE OR REPLACE FUNCTION public.audit_staffing_divergence()
 RETURNS TABLE(run_id uuid, total_findings integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_run_id uuid := gen_random_uuid();
  v_count integer := 0;
  v_added integer;
BEGIN
  -- MISSING_ASSIGNATION : spa publié mais pas d'assignation terrain
  WITH ins AS (
    INSERT INTO public.staffing_divergence_log
      (run_id, code, severity, affaire_id, plan_id, step_id, employe_id, date, metier_id, objet_id, details)
    SELECT v_run_id, 'MISSING_ASSIGNATION', 'error',
      p.affaire_id, p.id, st.id, spa.employe_id, spa.date, st.metier_id, st.objet_id,
      jsonb_build_object('presence_pct', spa.presence_pct, 'h_par_jour', st.h_par_jour,
                         'manual_origin', spa.manual_assignment_origin)
    FROM public.staffing_plan_assignment spa
    JOIN public.staffing_plan_step st ON st.id = spa.step_id
    JOIN public.staffing_plan p ON p.id = st.plan_id
    WHERE p.status = 'published'
      AND NOT EXISTS (SELECT 1 FROM public.assignations a
        WHERE a.affaire_id = p.affaire_id AND a.employe_id = spa.employe_id AND a.date = spa.date
          AND a.pole_planning IS NULL)
    RETURNING 1
  ) SELECT COUNT(*)::int INTO v_added FROM ins;
  v_count := v_count + v_added;

  -- ORPHAN_ASSIGNATION : assignation terrain sans spa correspondant
  WITH ins AS (
    INSERT INTO public.staffing_divergence_log
      (run_id, code, severity, affaire_id, plan_id, assignation_id, employe_id, date, metier_id, details)
    SELECT v_run_id, 'ORPHAN_ASSIGNATION', 'warning',
      a.affaire_id, a.staffing_plan_id, a.id, a.employe_id, a.date, a.metier_id,
      jsonb_build_object('heures', a.heures, 'demi_journee', a.demi_journee)
    FROM public.assignations a
    JOIN public.staffing_plan p ON p.id = a.staffing_plan_id
    WHERE p.status = 'published'
      AND NOT EXISTS (SELECT 1
        FROM public.staffing_plan_assignment spa
        JOIN public.staffing_plan_step st ON st.id = spa.step_id
        WHERE st.plan_id = p.id AND spa.employe_id = a.employe_id AND spa.date = a.date)
    RETURNING 1
  ) SELECT COUNT(*)::int INTO v_added FROM ins;
  v_count := v_count + v_added;

  -- PRESENCE_MISMATCH : heures attendues vs planifiées
  -- Lot 8.3b : on EXCLUT les spa marqués manual_assignment_origin (saisie libre légitime)
  WITH spa_agg AS (
    SELECT p.affaire_id, p.id AS plan_id, spa.employe_id, spa.date,
           SUM(spa.presence_pct * st.h_par_jour / 100.0) AS h_attendues
    FROM public.staffing_plan_assignment spa
    JOIN public.staffing_plan_step st ON st.id = spa.step_id
    JOIN public.staffing_plan p ON p.id = st.plan_id
    WHERE p.status = 'published'
      AND spa.manual_assignment_origin = false
    GROUP BY p.affaire_id, p.id, spa.employe_id, spa.date
  ),
  ass_agg AS (
    SELECT a.affaire_id, a.employe_id, a.date, SUM(a.heures) AS h_planifiees
    FROM public.assignations a WHERE a.pole_planning IS NULL GROUP BY a.affaire_id, a.employe_id, a.date
  ),
  ins AS (
    INSERT INTO public.staffing_divergence_log
      (run_id, code, severity, affaire_id, plan_id, employe_id, date, details)
    SELECT v_run_id, 'PRESENCE_MISMATCH', 'warning',
      s.affaire_id, s.plan_id, s.employe_id, s.date,
      jsonb_build_object('h_attendues', ROUND(s.h_attendues,2),
                         'h_planifiees', ROUND(COALESCE(aa.h_planifiees,0),2))
    FROM spa_agg s
    LEFT JOIN ass_agg aa ON aa.affaire_id = s.affaire_id AND aa.employe_id = s.employe_id AND aa.date = s.date
    WHERE ABS(s.h_attendues - COALESCE(aa.h_planifiees, 0)) > 0.5
    RETURNING 1
  ) SELECT COUNT(*)::int INTO v_added FROM ins;
  v_count := v_count + v_added;

  -- OBJET_LINK_MISSING : assignation existe mais lien objet manquant
  WITH ins AS (
    INSERT INTO public.staffing_divergence_log
      (run_id, code, severity, affaire_id, plan_id, step_id, assignation_id, employe_id, date, metier_id, objet_id, details)
    SELECT DISTINCT v_run_id, 'OBJET_LINK_MISSING', 'info',
      p.affaire_id, p.id, st.id, a.id, a.employe_id, a.date, st.metier_id, st.objet_id,
      jsonb_build_object('reason','step.objet_id non répercuté sur assignation_objets')
    FROM public.staffing_plan_assignment spa
    JOIN public.staffing_plan_step st ON st.id = spa.step_id
    JOIN public.staffing_plan p ON p.id = st.plan_id
    JOIN public.assignations a ON a.affaire_id = p.affaire_id AND a.employe_id = spa.employe_id AND a.date = spa.date
      AND a.pole_planning IS NULL
    WHERE p.status = 'published' AND st.objet_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.assignation_objets ao
        WHERE ao.assignation_id = a.id AND ao.objet_id = st.objet_id)
    RETURNING 1
  ) SELECT COUNT(*)::int INTO v_added FROM ins;
  v_count := v_count + v_added;

  -- CUMUL_OVER_100 : SUM(presence_pct) > 100 pour employé × date sur plans publiés
  WITH cumul AS (
    SELECT p.affaire_id, spa.employe_id, spa.date,
           SUM(spa.presence_pct) AS total_pct,
           COUNT(*) AS nb_steps,
           array_agg(DISTINCT st.metier_id) AS metiers,
           array_agg(DISTINCT st.objet_id) FILTER (WHERE st.objet_id IS NOT NULL) AS objets,
           bool_or(spa.manual_assignment_origin) AS has_manual
    FROM public.staffing_plan_assignment spa
    JOIN public.staffing_plan_step st ON st.id = spa.step_id
    JOIN public.staffing_plan p ON p.id = st.plan_id
    WHERE p.status = 'published'
    GROUP BY p.affaire_id, spa.employe_id, spa.date
    HAVING SUM(spa.presence_pct) > 100
  ),
  ins AS (
    INSERT INTO public.staffing_divergence_log
      (run_id, code, severity, affaire_id, employe_id, date, details)
    SELECT v_run_id, 'CUMUL_OVER_100',
      CASE WHEN c.total_pct > 150 THEN 'error' ELSE 'warning' END,
      c.affaire_id, c.employe_id, c.date,
      jsonb_build_object('total_pct', c.total_pct, 'nb_steps', c.nb_steps,
                         'metiers', c.metiers, 'objets', c.objets,
                         'has_manual_origin', c.has_manual)
    FROM cumul c
    RETURNING 1
  ) SELECT COUNT(*)::int INTO v_added FROM ins;
  v_count := v_count + v_added;

  RETURN QUERY SELECT v_run_id, v_count;
END;
$function$;
CREATE OR REPLACE FUNCTION public.planning_terrain_semaine(_debut date, _fin date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN IF NOT planning_terrain_lire_autorise() OR _fin<_debut OR _fin-_debut>31 THEN RAISE EXCEPTION 'Accès ou période invalide'; END IF; RETURN jsonb_build_object('references',planning_terrain_references(),'affectations',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'employe_id',employe_id,'dispos_intervenant_id',dispos_intervenant_id,'etape_id',etape_logistique_id,'date',date,'affaire_id',affaire_id,'role',role_terrain,'validation',validation_logistique,'confirmation',statut_confirmation,'historique',historique_terrain)) FROM assignations WHERE date BETWEEN _debut AND _fin AND pole_planning IS NULL),'[]'::jsonb),'etapes',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'date',e.date_debut,'fin',coalesce(e.date_fin,e.date_debut),'heure',e.heure_debut,'heure_fin',e.heure_fin,'horaire_libre',e.horaire_libre,'note',e.note,'nb_vehicules',e.nb_vehicules,'nb_chefs_equipe',e.nb_chefs_equipe,'permis_requis',e.permis_requis,'caces_requis',e.caces_requis,'caces_autre_requis',e.caces_autre_requis,'vehicule',coalesce(v.nom,e.immatriculation_libre),'type',e.type,'nb_personnes',e.nb_personnes,'responsable',e.responsable,'lieu',coalesce(e.lieu_libre,a.lieu),'numero',a.numero,'nom',a.nom,'affaire_id',a.id)) FROM affaire_etapes_logistiques e JOIN affaires a ON a.id=e.affaire_id LEFT JOIN vehicules v ON v.id=e.vehicule_id WHERE e.date_debut<=_fin AND coalesce(e.date_fin,e.date_debut)>=_debut AND e.statut<>'annule'),'[]'::jsonb),'dispos',coalesce((SELECT jsonb_agg(jsonb_build_object('intervenant_id',d.intervenant_id,'employe_id',i.employe_id,'jour',d.jour,'journee',d.journee,'soiree',d.soiree,'pas_dispo',d.pas_dispo)) FROM dispos_jours d JOIN dispos_intervenants i ON i.id=d.intervenant_id WHERE d.jour BETWEEN _debut AND _fin),'[]'::jsonb)); END $function$;