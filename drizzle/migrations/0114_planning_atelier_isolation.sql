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
      p.affaire_id, p.id, st.id, a.id, a.employe_id, spa.date, st.metier_id, st.objet_id,
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
CREATE OR REPLACE FUNCTION public.notify_assignation_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _profile_id UUID;
  _affaire RECORD;
  _date_fr TEXT;
  _demi TEXT;
BEGIN
  IF coalesce(NEW.pole_planning, OLD.pole_planning) = 'atelier' THEN RETURN coalesce(NEW, OLD); END IF;
  -- Récupérer le profile_id de l'employé
  IF TG_OP = 'DELETE' THEN
    SELECT profile_id INTO _profile_id FROM public.employes WHERE id = OLD.employe_id;
    SELECT numero, nom INTO _affaire FROM public.affaires WHERE id = OLD.affaire_id;
    _date_fr := to_char(OLD.date, 'DD/MM/YYYY');
    _demi := CASE OLD.demi_journee WHEN 'AM' THEN 'matin' WHEN 'PM' THEN 'après-midi' ELSE 'journée' END;
    PERFORM public.create_notification(
      _profile_id,
      'assignation_supprimee'::public.notification_type,
      'Assignation supprimée',
      format('Votre assignation du %s (%s) sur %s — %s a été supprimée.', _date_fr, _demi, COALESCE(_affaire.numero, '?'), COALESCE(_affaire.nom, '')),
      '/mobile/heures',
      jsonb_build_object('affaire_id', OLD.affaire_id, 'date', OLD.date)
    );
    RETURN OLD;
  END IF;

  SELECT profile_id INTO _profile_id FROM public.employes WHERE id = NEW.employe_id;
  SELECT numero, nom INTO _affaire FROM public.affaires WHERE id = NEW.affaire_id;
  _date_fr := to_char(NEW.date, 'DD/MM/YYYY');
  _demi := CASE NEW.demi_journee WHEN 'AM' THEN 'matin' WHEN 'PM' THEN 'après-midi' ELSE 'journée' END;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.create_notification(
      _profile_id,
      'assignation_creee'::public.notification_type,
      'Nouvelle assignation',
      format('Vous êtes assigné le %s (%s) sur %s — %s.', _date_fr, _demi, COALESCE(_affaire.numero, '?'), COALESCE(_affaire.nom, '')),
      '/mobile/heures',
      jsonb_build_object('affaire_id', NEW.affaire_id, 'date', NEW.date, 'assignation_id', NEW.id)
    );
  ELSIF TG_OP = 'UPDATE' AND (
    OLD.affaire_id IS DISTINCT FROM NEW.affaire_id
    OR OLD.date IS DISTINCT FROM NEW.date
    OR OLD.demi_journee IS DISTINCT FROM NEW.demi_journee
    OR OLD.heure_debut IS DISTINCT FROM NEW.heure_debut
    OR OLD.heure_fin IS DISTINCT FROM NEW.heure_fin
  ) THEN
    PERFORM public.create_notification(
      _profile_id,
      'assignation_modifiee'::public.notification_type,
      'Assignation modifiée',
      format('Votre assignation du %s a été modifiée — %s — %s.', _date_fr, COALESCE(_affaire.numero, '?'), COALESCE(_affaire.nom, '')),
      '/mobile/heures',
      jsonb_build_object('affaire_id', NEW.affaire_id, 'date', NEW.date, 'assignation_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.planning_terrain_semaine(_debut date, _fin date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN IF NOT planning_terrain_lire_autorise() OR _fin<_debut OR _fin-_debut>31 THEN RAISE EXCEPTION 'Accès ou période invalide'; END IF; RETURN jsonb_build_object('references',planning_terrain_references(),'affectations',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'employe_id',employe_id,'dispos_intervenant_id',dispos_intervenant_id,'etape_id',etape_logistique_id,'date',date,'affaire_id',affaire_id,'role',role_terrain,'validation',validation_logistique,'confirmation',statut_confirmation,'historique',historique_terrain)) FROM assignations WHERE date BETWEEN _debut AND _fin AND pole_planning IS NULL),'[]'::jsonb),'etapes',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'date',e.date_debut,'fin',coalesce(e.date_fin,e.date_debut),'heure',e.heure_debut,'heure_fin',e.heure_fin,'horaire_libre',e.horaire_libre,'note',e.note,'nb_vehicules',e.nb_vehicules,'nb_chefs_equipe',e.nb_chefs_equipe,'permis_requis',e.permis_requis,'caces_requis',e.caces_autre_requis,'vehicule',coalesce(v.nom,e.immatriculation_libre),'type',e.type,'nb_personnes',e.nb_personnes,'responsable',e.responsable,'lieu',coalesce(e.lieu_libre,a.lieu),'numero',a.numero,'nom',a.nom,'affaire_id',a.id)) FROM affaire_etapes_logistiques e JOIN affaires a ON a.id=e.affaire_id LEFT JOIN vehicules v ON v.id=e.vehicule_id WHERE e.date_debut<=_fin AND coalesce(e.date_fin,e.date_debut)>=_debut AND e.statut<>'annule'),'[]'::jsonb),'dispos',coalesce((SELECT jsonb_agg(jsonb_build_object('intervenant_id',d.intervenant_id,'employe_id',i.employe_id,'jour',d.jour,'journee',d.journee,'soiree',d.soiree,'pas_dispo',d.pas_dispo)) FROM dispos_jours d JOIN dispos_intervenants i ON i.id=d.intervenant_id WHERE d.jour BETWEEN _debut AND _fin),'[]'::jsonb)); END $function$;
CREATE OR REPLACE FUNCTION public.resolve_saisie_heures(p_employe_id uuid, p_affaire_id uuid, p_date date, p_objet_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(niveau integer, source text, autorisee boolean, phase text, role_terrain text, objet_id uuid, details jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_aff_phase_derivee TEXT;
BEGIN
  -- Niveau 3 : équipe objet fabrication (le plus précis)
  IF p_objet_id IS NOT NULL THEN
    RETURN QUERY
    SELECT
      3 AS niveau,
      'fabrication_objet_equipe'::TEXT AS source,
      TRUE AS autorisee,
      'fabrication'::TEXT AS phase,
      NULL::TEXT AS role_terrain,
      foe.objet_id,
      jsonb_build_object('foe_id', foe.id, 'added_at', foe.added_at) AS details
    FROM public.fabrication_objet_equipe foe
    WHERE foe.employe_id = p_employe_id
      AND foe.objet_id = p_objet_id
      AND foe.removed_at IS NULL
    LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  END IF;

  -- Niveau 2 : casting affaire (par phase)
  -- On préfère une ligne casting fraîche au plus proche de p_date, sinon n'importe.
  RETURN QUERY
  SELECT
    2 AS niveau,
    'affaire_equipe'::TEXT AS source,
    TRUE AS autorisee,
    ae.phase,
    ae.role_terrain,
    NULL::UUID AS objet_id,
    jsonb_build_object('ae_id', ae.id, 'added_at', ae.added_at) AS details
  FROM public.affaire_equipe ae
  WHERE ae.employe_id = p_employe_id
    AND ae.affaire_id = p_affaire_id
    AND ae.removed_at IS NULL
  ORDER BY ae.added_at DESC
  LIMIT 1;
  IF FOUND THEN RETURN; END IF;

  -- Niveau 1 : planifié ce jour-là (assignations)
  RETURN QUERY
  SELECT
    1 AS niveau,
    'assignations'::TEXT AS source,
    TRUE AS autorisee,
    a.phase,
    NULL::TEXT AS role_terrain,
    NULL::UUID AS objet_id,
    jsonb_build_object(
      'assignation_id', a.id,
      'demi_journee', a.demi_journee,
      'statut_confirmation', a.statut_confirmation
    ) AS details
  FROM public.assignations a
  WHERE a.employe_id = p_employe_id
    AND a.affaire_id = p_affaire_id
    AND a.date = p_date
    AND a.pole_planning IS NULL
    AND COALESCE(a.statut_confirmation::TEXT, 'en_attente') <> 'refusee'
  ORDER BY a.created_at DESC
  LIMIT 1;
  IF FOUND THEN RETURN; END IF;

  -- Niveau 0 : hors plan — saisie autorisée mais signalée (sera "hors planning")
  RETURN QUERY
  SELECT
    0 AS niveau,
    'hors'::TEXT AS source,
    TRUE AS autorisee,
    NULL::TEXT AS phase,
    NULL::TEXT AS role_terrain,
    NULL::UUID AS objet_id,
    jsonb_build_object('reason', 'no_attachment_found') AS details;
END;
$function$;
CREATE OR REPLACE FUNCTION public.staffing_par_pole_consolide(p_periode_debut date, p_periode_fin date, p_inclure_opportunites boolean DEFAULT false, p_filtres_chantier_ids uuid[] DEFAULT NULL::uuid[], p_filtres_metier_ids integer[] DEFAULT NULL::integer[], p_filtres_statut text[] DEFAULT NULL::text[])
 RETURNS TABLE(chantier_id uuid, chantier_numero text, chantier_nom text, chantier_typologie text, chantier_statut text, metier_id integer, metier_libelle text, metier_couleur text, metier_ordre integer, nb_personnes integer, total_demi_jours integer, total_heures numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT
    af.id  AS chantier_id,
    af.numero AS chantier_numero,
    af.nom AS chantier_nom,
    af.typologie AS chantier_typologie,
    af.statut::text AS chantier_statut,
    m.id   AS metier_id,
    m.libelle AS metier_libelle,
    m.couleur AS metier_couleur,
    m.ordre   AS metier_ordre,
    COUNT(DISTINCT a.employe_id)::int          AS nb_personnes,
    COUNT(*)::int                              AS total_demi_jours,
    (COUNT(*)::numeric * 4)                    AS total_heures
  FROM assignations a
  JOIN affaires af ON af.id = a.affaire_id
  LEFT JOIN employes e ON e.id = a.employe_id
  JOIN metiers m ON m.id = COALESCE(a.metier_id, e.metier_principal_id)
  WHERE a.date BETWEEN p_periode_debut AND p_periode_fin
    AND a.pole_planning IS NULL
    AND (p_inclure_opportunites OR af.numero NOT LIKE '9%')
    AND (p_filtres_chantier_ids IS NULL OR af.id = ANY(p_filtres_chantier_ids))
    AND (p_filtres_metier_ids   IS NULL OR m.id  = ANY(p_filtres_metier_ids))
    AND (p_filtres_statut       IS NULL OR af.statut::text = ANY(p_filtres_statut))
  GROUP BY af.id, af.numero, af.nom, af.typologie, af.statut, m.id, m.libelle, m.couleur, m.ordre
  ORDER BY af.numero, m.ordre;
$function$;
CREATE OR REPLACE FUNCTION public.staffing_par_pole_jours(p_periode_debut date, p_periode_fin date, p_inclure_opportunites boolean DEFAULT false, p_filtres_metier_ids integer[] DEFAULT NULL::integer[], p_filtres_statut text[] DEFAULT NULL::text[])
 RETURNS TABLE(metier_id integer, metier_libelle text, metier_couleur text, metier_ordre integer, date_jour date, nb_personnes integer, personnes jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT
      COALESCE(a.metier_id, e.metier_principal_id) AS metier_id,
      a.date AS date_jour,
      a.employe_id,
      e.prenom,
      e.nom,
      af.id AS chantier_id,
      af.numero AS chantier_numero,
      af.nom AS chantier_nom,
      (af.numero LIKE '9%') AS est_opportunite
    FROM assignations a
    JOIN affaires af ON af.id = a.affaire_id
    LEFT JOIN employes e ON e.id = a.employe_id
    WHERE a.date BETWEEN p_periode_debut AND p_periode_fin
      AND a.pole_planning IS NULL
      AND (p_inclure_opportunites OR af.numero NOT LIKE '9%')
      AND (p_filtres_statut IS NULL OR af.statut::text = ANY(p_filtres_statut))
  ),
  filtered AS (
    SELECT * FROM base
    WHERE metier_id IS NOT NULL
      AND (p_filtres_metier_ids IS NULL OR metier_id = ANY(p_filtres_metier_ids))
  )
  SELECT
    m.id,
    m.libelle,
    m.couleur,
    m.ordre,
    f.date_jour,
    COUNT(DISTINCT f.employe_id)::int AS nb_personnes,
    jsonb_agg(DISTINCT jsonb_build_object(
      'employe_id', f.employe_id,
      'prenom', f.prenom,
      'nom', f.nom,
      'chantier_id', f.chantier_id,
      'chantier_numero', f.chantier_numero,
      'chantier_nom', f.chantier_nom,
      'est_opportunite', f.est_opportunite
    )) AS personnes
  FROM filtered f
  JOIN metiers m ON m.id = f.metier_id
  GROUP BY m.id, m.libelle, m.couleur, m.ordre, f.date_jour
  ORDER BY m.ordre, f.date_jour;
$function$;