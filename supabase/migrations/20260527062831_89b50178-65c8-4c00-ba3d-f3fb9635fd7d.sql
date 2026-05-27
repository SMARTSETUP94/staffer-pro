-- L4a-bis — Extension get_inbox_items avec 6 nouvelles sources gated par cap.
-- Note L4a-bis (27 mai 2026) :
-- 3 sources prévues à la matrice (opp_action, echantillons, plan_lacune)
-- sont différées car tables métier non créées.
-- Voir mem://debts/inbox-opp-action-create-table et 2 autres.
-- 1 source (alertes_equipe) est déjà couverte par les CTE legacy
-- alerte_sous_dim / alerte_depassement / alerte_cumul / alerte_hors_equipe.

CREATE OR REPLACE FUNCTION public.get_inbox_items(p_limit integer DEFAULT 100)
 RETURNS TABLE(item_key text, source text, source_id uuid, severity text, title text, subtitle text, affaire_id uuid, affaire_numero text, action_route text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean := is_admin();
  v_is_chef_or_admin boolean := is_chef_or_admin();
  v_flag_active boolean := COALESCE(
    (SELECT enabled_globally FROM feature_flags WHERE flag_key='equipes_3_niveaux_alertes'),
    false
  );
  -- L4a-bis : caps gating pour les nouvelles sources
  v_cap_mission_pose       boolean := public.user_has_cap('inbox.mission_pose');
  v_cap_validation_heures  boolean := public.user_has_cap('inbox.validation_heures');
  v_cap_be_attente         boolean := public.user_has_cap('inbox.be_attente');
  v_cap_devis_brouillon    boolean := public.user_has_cap('inbox.devis_brouillon');
  v_cap_heures_saisir      boolean := public.user_has_cap('inbox.heures_saisir');
  v_cap_rh_contrats        boolean := public.user_has_cap('inbox.rh_contrats');
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
      d.severity::text, ('Divergence : ' || d.code), d.description,
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

  -- === SOURCE: mission_pose === (L4a-bis)
  -- Cap requise : inbox.mission_pose
  -- Affectations montage/démontage à venir dans les 14 prochains jours.
  mission_pose AS (
    SELECT
      'mission_pose:' || a.id::text,
      'mission_pose'::text,
      a.id,
      CASE
        WHEN a.date = CURRENT_DATE THEN 'high'
        WHEN a.date <= CURRENT_DATE + INTERVAL '3 days' THEN 'medium'
        ELSE 'low'
      END::text,
      ('Mission ' || a.phase || ' — ' || COALESCE(af.numero,'?')),
      (to_char(a.date,'DD/MM') || ' · ' || e.prenom || ' ' || e.nom ||
        COALESCE(' · ' || af.lieu, '')),
      a.affaire_id, af.numero,
      ('/affaires/' || a.affaire_id::text || '/staffing'),
      COALESCE(a.updated_at, a.created_at)
    FROM public.assignations a
    JOIN public.employes e ON e.id = a.employe_id
    LEFT JOIN public.affaires af ON af.id = a.affaire_id
    WHERE v_cap_mission_pose
      AND a.phase IN ('montage','demontage')
      AND a.date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '14 days'
      AND a.statut_confirmation <> 'refusee'
  ),

  -- === SOURCE: validation_heures === (L4a-bis)
  -- Cap requise : inbox.validation_heures
  -- Heures soumises par les employés en attente de validation chef/admin.
  val_heures AS (
    SELECT
      'validation_heures:' || h.id::text,
      'validation_heures'::text,
      h.id,
      CASE
        WHEN h.created_at < now() - INTERVAL '7 days' THEN 'high'
        ELSE 'medium'
      END::text,
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

  -- === SOURCE: be_attente === (L4a-bis)
  -- Cap requise : inbox.be_attente
  -- Objets de fabrication sans responsable fab assigné (BE attend prise en charge).
  be_attente AS (
    SELECT
      'be_attente:' || fo.id::text,
      'be_attente'::text,
      fo.id,
      CASE
        WHEN af.date_debut IS NOT NULL AND af.date_debut <= CURRENT_DATE + INTERVAL '7 days' THEN 'high'
        ELSE 'medium'
      END::text,
      ('BE en attente — ' || fo.nom),
      (COALESCE(af.numero,'?') || ' · ref ' || COALESCE(fo.reference,'?') ||
        COALESCE(' · début ' || to_char(af.date_debut,'DD/MM'), '')),
      fo.affaire_id, af.numero,
      ('/affaires/' || fo.affaire_id::text || '/fabrication'),
      fo.created_at
    FROM public.fabrication_objets fo
    LEFT JOIN public.affaires af ON af.id = fo.affaire_id
    WHERE v_cap_be_attente
      AND fo.archive = false
      AND fo.respo_fab_id IS NULL
      AND fo.created_at >= now() - INTERVAL '90 days'
  ),

  -- === SOURCE: devis_brouillon === (L4a-bis)
  -- Cap requise : inbox.devis_brouillon
  -- Devis en statut brouillon à compléter / publier.
  devis_brouillon AS (
    SELECT
      'devis_brouillon:' || d.id::text,
      'devis_brouillon'::text,
      d.id,
      CASE
        WHEN d.created_at < now() - INTERVAL '7 days' THEN 'high'
        WHEN d.created_at < now() - INTERVAL '3 days' THEN 'medium'
        ELSE 'low'
      END::text,
      ('Devis brouillon — ' || COALESCE(d.numero,'?')),
      (COALESCE(d.libelle, '') ||
        COALESCE(' · ' || af.numero, '') ||
        COALESCE(' · ' || ROUND(d.montant_ht)::text || ' € HT', '')),
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

  -- === SOURCE: heures_saisir === (L4a-bis)
  -- Cap requise : inbox.heures_saisir
  -- Heures en brouillon pour un jour passé/présent (own : RLS filtre par employé).
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

  -- === SOURCE: rh_contrats === (L4a-bis)
  -- Cap requise : inbox.rh_contrats
  -- Contrats intermittents en attente de signature (employé ou employeur).
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
      ('Début ' || to_char(c.date_debut,'DD/MM') ||
        ' · statut ' || c.statut::text ||
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
  ) all_items (item_key, source, source_id, severity, title, subtitle, affaire_id, affaire_numero, action_route, created_at)
  WHERE all_items.item_key NOT IN (SELECT d.item_key FROM dismissed d)
  ORDER BY CASE all_items.severity WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
           all_items.created_at DESC
  LIMIT p_limit;
END;
$function$;