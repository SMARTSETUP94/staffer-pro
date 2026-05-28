-- Bloc 10.2 — Cleanup Risque #1 + extension inbox opp_action
-- 1) Colonne archived_at + index sur affaires
ALTER TABLE public.affaires ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL;
CREATE INDEX IF NOT EXISTS idx_affaires_active ON public.affaires (phase, statut) WHERE archived_at IS NULL;

-- 2) Index couvrant pour la CTE opp_action de l'inbox
CREATE INDEX IF NOT EXISTS idx_opp_actions_due
  ON public.opportunite_actions (affaire_id, date DESC)
  WHERE prochaine_action_due_le IS NOT NULL;

-- 3) RPC archive_affaire (cap-gated, admin only)
CREATE OR REPLACE FUNCTION public.archive_affaire(_affaire_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission denied: archive_affaire requires admin';
  END IF;
  UPDATE public.affaires
     SET archived_at = now()
   WHERE id = _affaire_id
     AND archived_at IS NULL;
END;
$$;
GRANT EXECUTE ON FUNCTION public.archive_affaire(uuid) TO authenticated;

-- 4) Archivage massif des 191 opps orphelines termine
UPDATE public.affaires
   SET archived_at = now()
 WHERE phase = 'opportunite'
   AND charge_affaires_id IS NULL
   AND statut_opportunite = 'termine'
   AND archived_at IS NULL;

-- 5) Réécriture de get_inbox_items avec CTE opp_action + filtre archived_at
CREATE OR REPLACE FUNCTION public.get_inbox_items(p_limit integer DEFAULT 50)
 RETURNS TABLE(item_key text, source text, source_id uuid, severity text, title text, subtitle text, affaire_id uuid, affaire_numero text, action_route text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid              uuid    := auth.uid();
  v_is_admin         boolean := public.is_admin();
  v_is_chef_or_admin boolean := public.is_chef_or_admin();
  v_flag_active      boolean := public.is_feature_flag_enabled('equipes_3_niveaux_alertes');
  v_cap_mission_pose       boolean := public.user_has_cap('inbox.mission_pose');
  v_cap_validation_heures  boolean := public.user_has_cap('inbox.validation_heures');
  v_cap_be_attente         boolean := public.user_has_cap('inbox.be_attente');
  v_cap_devis_brouillon    boolean := public.user_has_cap('inbox.devis_brouillon');
  v_cap_heures_saisir      boolean := public.user_has_cap('inbox.heures_saisir');
  v_cap_rh_contrats        boolean := public.user_has_cap('inbox.rh_contrats');
  v_cap_opp_action         boolean := public.user_has_cap('inbox.opp_action');
  v_cap_opp_read_all       boolean := public.user_has_cap('opportunites.read.all');
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH dismissed AS (
    SELECT d.item_key FROM public.inbox_dismissed d WHERE d.user_id = v_uid
  ),
  refus AS (
    SELECT
      'assignation_refus:' || a.id::text,
      'assignation_refus'::text,
      a.id, 'high'::text,
      ('Refus de ' || e.prenom || ' ' || e.nom),
      ('Chantier ' || COALESCE(af.numero,'?') || ' le ' || to_char(a.date,'DD/MM') || COALESCE(' — ' || a.motif_refus,'')),
      a.affaire_id, af.numero,
      ('/affaires/' || a.affaire_id::text || '/staffing'),
      COALESCE(a.refusee_le, a.updated_at)
    FROM public.assignations a
    JOIN public.employes e ON e.id = a.employe_id
    LEFT JOIN public.affaires af ON af.id = a.affaire_id
    WHERE v_is_chef_or_admin AND a.statut_confirmation = 'refusee'
      AND a.date >= CURRENT_DATE - INTERVAL '30 days'
  ),
  diverg AS (
    SELECT
      'divergence:' || d.id::text, 'divergence'::text, d.id,
      d.severity::text, ('Divergence : ' || d.code), COALESCE(d.notes, d.details->>'message', 'Voir détails dans /admin/audit') AS subtitle,
      d.affaire_id, af.numero,
      CASE WHEN d.affaire_id IS NOT NULL THEN '/affaires/' || d.affaire_id::text || '/staffing' ELSE '/admin/audit' END,
      d.detected_at
    FROM public.staffing_divergence_log d
    LEFT JOIN public.affaires af ON af.id = d.affaire_id
    WHERE v_is_chef_or_admin AND d.resolved_at IS NULL
      AND d.code <> 'CUMUL_OVER_100'
  ),
  abs_pending AS (
    SELECT
      'absence:' || ab.id::text, 'absence_pending'::text, ab.id, 'medium'::text,
      ('Absence à valider : ' || e.prenom || ' ' || e.nom),
      (ab.type::text || ' du ' || to_char(ab.date_debut,'DD/MM') || ' au ' || to_char(ab.date_fin,'DD/MM') || COALESCE(' — ' || ab.motif,'')),
      NULL::uuid, NULL::text, '/absences'::text, ab.created_at
    FROM public.absences ab
    JOIN public.employes e ON e.id = ab.employe_id
    WHERE v_is_chef_or_admin AND ab.valide = false
      AND ab.date_fin >= CURRENT_DATE - INTERVAL '7 days'
  ),
  fb AS (
    SELECT
      'feedback:' || f.id::text, 'feedback'::text, f.id,
      CASE f.priorite::text WHEN 'haute' THEN 'high' WHEN 'basse' THEN 'low' ELSE 'medium' END,
      ('Feedback : ' || f.titre), f.description,
      NULL::uuid, NULL::text, '/admin/feedback'::text, f.created_at
    FROM public.feedbacks f
    WHERE v_is_admin AND f.statut = 'nouveau'
  ),
  alerte_sous_dim AS (
    SELECT
      'alerte_sous_dim:' || vc.affaire_id::text || ':' || vc.phase,
      'alerte_sous_dim'::text,
      vc.affaire_id,
      CASE vc.statut WHEN 'fortement_sous_dim' THEN 'high' ELSE 'medium' END,
      ('Équipe sous-dim — ' || af.numero || ' / ' || vc.phase),
      (COALESCE(vc.nb_personnes_castees,0)::text || ' pers. — capacité ' ||
        COALESCE(vc.capacite_estimee_h::text,'?') || 'h vs ' || COALESCE(vc.heures_prevues::text,'?') || 'h prévues'),
      vc.affaire_id, af.numero,
      ('/affaires/' || vc.affaire_id::text || '/casting'),
      now()
    FROM public.v_affaire_equipe_capacite vc
    JOIN public.affaires af ON af.id = vc.affaire_id
    JOIN public.affaire_alertes_optin opt
      ON opt.affaire_id = vc.affaire_id AND opt.alerte_code = 'sous_dim' AND opt.active = true
    WHERE v_is_chef_or_admin AND v_flag_active
      AND vc.statut IN ('sous_dim','fortement_sous_dim')
      AND af.statut = 'en_cours'
  ),
  alerte_depassement AS (
    SELECT
      'alerte_depassement:' || agg.devis_id::text,
      'alerte_depassement'::text,
      agg.devis_id,
      CASE WHEN agg.pct >= 1.30 THEN 'high' ELSE 'medium' END,
      ('Dépassement +' || ROUND((agg.pct - 1) * 100)::text || '% — ' || af.numero),
      ('Devis ' || COALESCE(agg.devis_numero,'?') || ' · ' ||
        ROUND(agg.h_consommees)::text || 'h consommées / ' ||
        ROUND(agg.h_prevues)::text || 'h prévues'),
      agg.affaire_id, af.numero,
      ('/affaires/' || agg.affaire_id::text || '/devis'),
      now()
    FROM (
      SELECT
        vdc.devis_id, vdc.affaire_id, vdc.devis_numero,
        SUM(COALESCE(vdc.heures_prevues,0))                                     AS h_prevues,
        SUM(COALESCE(vdc.heures_reelles_validees,0) + COALESCE(vdc.heures_reelles_soumises,0)) AS h_consommees,
        CASE WHEN SUM(COALESCE(vdc.heures_prevues,0)) > 0
             THEN SUM(COALESCE(vdc.heures_reelles_validees,0) + COALESCE(vdc.heures_reelles_soumises,0))
                  / NULLIF(SUM(COALESCE(vdc.heures_prevues,0)),0)
             ELSE NULL END                                                       AS pct
      FROM public.v_devis_consommation vdc
      GROUP BY vdc.devis_id, vdc.affaire_id, vdc.devis_numero
    ) agg
    JOIN public.affaires af ON af.id = agg.affaire_id
    JOIN public.affaire_alertes_optin opt
      ON opt.affaire_id = agg.affaire_id AND opt.alerte_code = 'depassement' AND opt.active = true
    WHERE v_is_chef_or_admin AND v_flag_active
      AND agg.pct > 1.15
      AND af.statut = 'en_cours'
  ),
  alerte_cumul AS (
    SELECT
      'alerte_cumul_100:' || d.id::text,
      'alerte_cumul_100'::text,
      d.id,
      CASE d.severity WHEN 'high' THEN 'high' ELSE 'medium' END,
      ('Conflit cumul — ' || COALESCE(e.prenom || ' ' || e.nom, 'employé') ||
        COALESCE(' à ' || (d.details->>'pct') || '%', '')),
      ('Semaine du ' || to_char(COALESCE(d.date, d.detected_at::date), 'DD/MM') ||
        COALESCE(' · ' || af.numero, '')),
      d.affaire_id, af.numero,
      COALESCE(
        '/planning?employe=' || d.employe_id::text ||
          COALESCE('&date=' || to_char(d.date,'YYYY-MM-DD'),''),
        '/planning'
      ),
      d.detected_at
    FROM public.staffing_divergence_log d
    LEFT JOIN public.affaires af ON af.id = d.affaire_id
    LEFT JOIN public.employes e ON e.id = d.employe_id
    LEFT JOIN public.affaire_alertes_optin opt
      ON opt.affaire_id = d.affaire_id AND opt.alerte_code = 'cumul_100' AND opt.active = true
    WHERE v_is_chef_or_admin AND v_flag_active
      AND d.code = 'CUMUL_OVER_100'
      AND d.resolved_at IS NULL
      AND (d.affaire_id IS NULL OR opt.id IS NOT NULL)
  ),
  alerte_hors_equipe AS (
    SELECT
      'alerte_hors_equipe:' || hs.id::text,
      'alerte_hors_equipe'::text,
      hs.id,
      'medium'::text,
      ('Saisie hors équipe — ' || e.prenom || ' ' || e.nom),
      (af.numero || ' le ' || to_char(hs.date,'DD/MM') ||
        ' · ' || COALESCE(hs.heures_reelles::text,'?') || 'h'),
      hs.affaire_id, af.numero,
      ('/affaires/' || hs.affaire_id::text || '/casting'),
      hs.created_at
    FROM public.heures_saisies hs
    JOIN public.employes e   ON e.id  = hs.employe_id
    JOIN public.affaires af  ON af.id = hs.affaire_id
    JOIN public.affaire_alertes_optin opt
      ON opt.affaire_id = hs.affaire_id AND opt.alerte_code = 'hors_equipe' AND opt.active = true
    WHERE v_is_chef_or_admin AND v_flag_active
      AND hs.statut IN ('soumis','valide')
      AND hs.date >= CURRENT_DATE - INTERVAL '30 days'
      AND af.statut = 'en_cours'
      AND NOT EXISTS (
        SELECT 1 FROM public.affaire_equipe ae
        WHERE ae.affaire_id = hs.affaire_id
          AND ae.employe_id = hs.employe_id
          AND ae.removed_at IS NULL
      )
  ),
  mission_pose AS (
    SELECT
      'mission_pose:' || ae.id::text,
      'mission_pose'::text,
      ae.id,
      CASE
        WHEN (ae.phase = 'montage'   AND af.date_montage   = CURRENT_DATE)
          OR (ae.phase = 'demontage' AND af.date_demontage = CURRENT_DATE) THEN 'high'
        WHEN (ae.phase = 'montage'   AND af.date_montage   <= CURRENT_DATE + INTERVAL '3 days')
          OR (ae.phase = 'demontage' AND af.date_demontage <= CURRENT_DATE + INTERVAL '3 days') THEN 'medium'
        ELSE 'low'
      END::text,
      ('Mission ' || ae.phase || ' — ' || COALESCE(af.numero, '?')),
      (COALESCE(
         CASE ae.phase
           WHEN 'montage'   THEN to_char(af.date_montage,   'DD/MM')
           WHEN 'demontage' THEN to_char(af.date_demontage, 'DD/MM')
         END, '?') || ' · ' || e.prenom || ' ' || e.nom),
      ae.affaire_id, af.numero,
      ('/affaires/' || ae.affaire_id::text),
      ae.added_at
    FROM public.affaire_equipe ae
    JOIN public.employes e ON e.id = ae.employe_id
    LEFT JOIN public.affaires af ON af.id = ae.affaire_id
    WHERE v_cap_mission_pose
      AND ae.phase IN ('montage','demontage')
      AND ae.removed_at IS NULL
      AND (
        (ae.phase = 'montage'   AND af.date_montage   BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '14 days')
        OR (ae.phase = 'demontage' AND af.date_demontage BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '14 days')
      )
  ),
  val_heures AS (
    SELECT
      'validation_heures:' || h.id::text,
      'validation_heures'::text,
      h.id,
      CASE WHEN h.created_at < now() - INTERVAL '7 days' THEN 'high' ELSE 'medium' END::text,
      ('Heures à valider — ' || e.prenom || ' ' || e.nom),
      (to_char(h.date,'DD/MM') || ' · ' || COALESCE(h.heures_reelles::text,'?') || 'h' ||
        COALESCE(' · ' || af.numero, '')),
      h.affaire_id, af.numero,
      '/audit-heures'::text,
      h.created_at
    FROM public.heures_saisies h
    JOIN public.employes e ON e.id = h.employe_id
    LEFT JOIN public.affaires af ON af.id = h.affaire_id
    WHERE v_cap_validation_heures
      AND h.statut = 'soumis'
      AND h.created_at >= now() - INTERVAL '60 days'
  ),
  be_attente AS (
    SELECT
      'be_attente:' || fo.id::text,
      'be_attente'::text,
      fo.id,
      CASE WHEN af.date_debut IS NOT NULL AND af.date_debut <= CURRENT_DATE + INTERVAL '7 days' THEN 'high' ELSE 'medium' END::text,
      ('BE en attente — ' || fo.nom),
      (COALESCE(af.numero,'?') || ' · ref ' || COALESCE(fo.reference,'?') ||
        COALESCE(' · début ' || to_char(af.date_debut,'DD/MM'), '')),
      fo.affaire_id, af.numero,
      ('/affaires/' || fo.affaire_id::text || '/fabrication'),
      fo.created_at
    FROM public.fabrication_objets fo
    LEFT JOIN public.affaires af ON af.id = fo.affaire_id
    WHERE v_cap_be_attente
      AND fo.respo_fab_id IS NULL
      AND fo.created_at >= now() - INTERVAL '90 days'
  ),
  devis_brouillon AS (
    SELECT
      'devis_brouillon:' || d.id::text,
      'devis_brouillon'::text,
      d.id,
      'medium'::text,
      ('Devis brouillon — ' || COALESCE(d.numero,'?')),
      (COALESCE(af.numero,'?') || ' · créé ' || to_char(d.created_at,'DD/MM')),
      d.affaire_id, af.numero,
      ('/affaires/' || d.affaire_id::text || '/devis'),
      d.created_at
    FROM public.devis d
    LEFT JOIN public.affaires af ON af.id = d.affaire_id
    WHERE v_cap_devis_brouillon
      AND d.statut = 'brouillon'
      AND d.archive = false
      AND d.created_at >= now() - INTERVAL '90 days'
  ),
  heures_saisir AS (
    SELECT
      'heures_saisir:' || h.id::text,
      'heures_saisir'::text,
      h.id,
      CASE
        WHEN h.date < CURRENT_DATE - INTERVAL '3 days' THEN 'high'
        WHEN h.date < CURRENT_DATE THEN 'medium'
        ELSE 'low'
      END::text,
      ('Heures à saisir — ' || to_char(h.date,'DD/MM')),
      (COALESCE(af.numero,'?') || ' · ' || COALESCE(h.heures_reelles::text,'0') || 'h'),
      h.affaire_id, af.numero,
      '/mes-heures'::text,
      h.created_at
    FROM public.heures_saisies h
    LEFT JOIN public.affaires af ON af.id = h.affaire_id
    WHERE v_cap_heures_saisir
      AND h.statut = 'brouillon'
      AND h.date <= CURRENT_DATE
      AND h.date >= CURRENT_DATE - INTERVAL '30 days'
  ),
  rh_contrats AS (
    SELECT
      'rh_contrats:' || c.id::text,
      'rh_contrats'::text,
      c.id,
      CASE
        WHEN c.date_debut <= CURRENT_DATE + INTERVAL '2 days' THEN 'high'
        WHEN c.date_debut <= CURRENT_DATE + INTERVAL '7 days' THEN 'medium'
        ELSE 'low'
      END::text,
      ('Contrat à signer — ' || e.prenom || ' ' || e.nom),
      ('Début ' || to_char(c.date_debut,'DD/MM') || ' · statut ' || c.statut::text ||
        COALESCE(' · ' || af.numero, '')),
      c.chantier_id, af.numero,
      ('/admin/contrats'),
      c.created_at
    FROM public.contrats_intermittents c
    JOIN public.employes e ON e.id = c.employee_id
    LEFT JOIN public.affaires af ON af.id = c.chantier_id
    WHERE v_cap_rh_contrats
      AND c.statut IN ('a_signer_employe','a_signer_employeur')
      AND c.date_fin >= CURRENT_DATE - INTERVAL '14 days'
  ),
  opp_action AS (
    SELECT
      'opp_action:' || a.id::text,
      'opp_action'::text,
      a.id,
      (CASE
        WHEN oa.prochaine_action_due_le < CURRENT_DATE THEN 'high'
        WHEN oa.prochaine_action_due_le <= CURRENT_DATE + INTERVAL '3 days' THEN 'medium'
        ELSE 'low'
      END)::text,
      ('Action commerciale due — ' || COALESCE(p.full_name, '?')),
      (COALESCE(a.code_opportunite, a.numero, '?') || ' · ' || to_char(oa.prochaine_action_due_le, 'DD/MM')),
      a.id, a.numero,
      ('/opportunites/' || a.id::text),
      oa.created_at
    FROM public.affaires a
    JOIN LATERAL (
      SELECT oa2.prochaine_action_due_le, oa2.created_at
      FROM public.opportunite_actions oa2
      WHERE oa2.affaire_id = a.id
        AND oa2.prochaine_action_due_le IS NOT NULL
      ORDER BY oa2.date DESC
      LIMIT 1
    ) oa ON true
    LEFT JOIN public.profiles p ON p.id = a.charge_affaires_id
    WHERE v_cap_opp_action
      AND a.phase = 'opportunite'
      AND a.archived_at IS NULL
      AND oa.prochaine_action_due_le <= CURRENT_DATE + INTERVAL '7 days'
      AND (v_cap_opp_read_all OR a.charge_affaires_id = v_uid)
  )

  SELECT * FROM (
    SELECT * FROM refus
    UNION ALL SELECT * FROM diverg
    UNION ALL SELECT * FROM abs_pending
    UNION ALL SELECT * FROM fb
    UNION ALL SELECT * FROM alerte_sous_dim
    UNION ALL SELECT * FROM alerte_depassement
    UNION ALL SELECT * FROM alerte_cumul
    UNION ALL SELECT * FROM alerte_hors_equipe
    UNION ALL SELECT * FROM mission_pose
    UNION ALL SELECT * FROM val_heures
    UNION ALL SELECT * FROM be_attente
    UNION ALL SELECT * FROM devis_brouillon
    UNION ALL SELECT * FROM heures_saisir
    UNION ALL SELECT * FROM rh_contrats
    UNION ALL SELECT * FROM opp_action
  ) all_items (item_key, source, source_id, severity, title, subtitle, affaire_id, affaire_numero, action_route, created_at)
  WHERE all_items.item_key NOT IN (SELECT d.item_key FROM dismissed d)
  ORDER BY
    CASE all_items.severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
    all_items.created_at DESC
  LIMIT p_limit;
END;
$function$;