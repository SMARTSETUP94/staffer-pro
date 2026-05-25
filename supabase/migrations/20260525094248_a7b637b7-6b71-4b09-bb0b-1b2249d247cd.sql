-- Sprint D / Batch 2 finition — Correctif formule capacité + vue per-métier
-- 1. Refonte v_affaire_equipe_capacite avec fenêtres temporelles contextuelles
--    et nouveau statut 'dates_manquantes'
-- 2. Nouvelle vue v_affaire_equipe_capacite_metier pour décomposition Fab UI

DROP VIEW IF EXISTS public.v_affaire_equipe_capacite CASCADE;

CREATE VIEW public.v_affaire_equipe_capacite
WITH (security_invoker = true)
AS
WITH plan_fab AS (
  SELECT DISTINCT ON (affaire_id)
    affaire_id, date_debut_fab, date_fin_fab
  FROM public.staffing_plan
  WHERE status = 'published'
  ORDER BY affaire_id, published_at DESC NULLS LAST
),
phase_def AS (
  -- commercial_etude : created_at → COALESCE(signed_at, today())
  SELECT a.id AS affaire_id, 'commercial_etude'::text AS phase,
         a.created_at::date AS phase_start,
         COALESCE(a.signed_at::date, CURRENT_DATE) AS phase_end,
         NULL::numeric AS heures_prevues
  FROM public.affaires a
  UNION ALL
  -- fabrication : plan publié sinon signed_at → date_montage
  SELECT a.id, 'fabrication',
         COALESCE(pf.date_debut_fab, a.signed_at::date),
         COALESCE(pf.date_fin_fab, a.date_montage),
         COALESCE((
           SELECT SUM(COALESCE(fo.heures_prevues_be,0)
                    + COALESCE(fo.heures_prevues_numerique,0)
                    + COALESCE(fo.heures_prevues_bois,0)
                    + COALESCE(fo.heures_prevues_metal,0)
                    + COALESCE(fo.heures_prevues_peinture,0)
                    + COALESCE(fo.heures_prevues_tapisserie,0)
                    + COALESCE(fo.heures_prevues_manutention,0))
           FROM public.fabrication_objets fo
           WHERE fo.affaire_id = a.id AND fo.archive = false
         ), 0)
  FROM public.affaires a
  LEFT JOIN plan_fab pf ON pf.affaire_id = a.id
  UNION ALL
  -- logistique : min(plan_start, signed_at) → date_demontage + 2j
  SELECT a.id, 'logistique',
         LEAST(
           COALESCE((SELECT date_debut_fab FROM plan_fab pf WHERE pf.affaire_id = a.id), a.signed_at::date),
           a.signed_at::date
         ),
         a.date_demontage + INTERVAL '2 days',
         NULL::numeric
  FROM public.affaires a
  UNION ALL
  -- montage
  SELECT a.id, 'montage', a.date_montage, a.date_demontage,
         COALESCE(a.heures_prevues_montage, 0)
  FROM public.affaires a
  UNION ALL
  -- demontage
  SELECT a.id, 'demontage', a.date_demontage,
         (a.date_demontage + INTERVAL '2 days')::date,
         COALESCE(a.heures_prevues_demontage, 0)
  FROM public.affaires a
),
casting AS (
  SELECT ae.affaire_id, ae.phase,
         COUNT(DISTINCT ae.employe_id)::int AS nb_personnes
  FROM public.affaire_equipe ae
  WHERE ae.removed_at IS NULL
  GROUP BY ae.affaire_id, ae.phase
)
SELECT
  p.affaire_id,
  p.phase,
  COALESCE(c.nb_personnes, 0) AS nb_personnes_castees,
  p.heures_prevues,
  CASE WHEN p.phase_start IS NULL OR p.phase_end IS NULL OR p.phase_end::date < p.phase_start::date
       THEN 0
       ELSE public.jours_ouvres_entre(p.phase_start::date, p.phase_end::date)
  END AS jours_ouvres_phase,
  CASE WHEN p.heures_prevues IS NULL OR p.phase_start IS NULL OR p.phase_end IS NULL THEN NULL
       ELSE (COALESCE(c.nb_personnes,0) * public.jours_ouvres_entre(p.phase_start::date, p.phase_end::date) * 8)::numeric
  END AS capacite_estimee_h,
  CASE
    WHEN p.phase_start IS NULL OR p.phase_end IS NULL THEN 'dates_manquantes'
    WHEN p.heures_prevues IS NULL OR p.heures_prevues = 0 THEN NULL
    WHEN COALESCE(c.nb_personnes,0) = 0 THEN 'fortement_sous_dim'
    WHEN (COALESCE(c.nb_personnes,0) * public.jours_ouvres_entre(p.phase_start::date, p.phase_end::date) * 8) >= p.heures_prevues THEN 'ok'
    WHEN (COALESCE(c.nb_personnes,0) * public.jours_ouvres_entre(p.phase_start::date, p.phase_end::date) * 8) >= (0.8 * p.heures_prevues) THEN 'sous_dim'
    ELSE 'fortement_sous_dim'
  END AS statut,
  CASE
    WHEN p.heures_prevues IS NULL OR p.heures_prevues = 0 OR p.phase_start IS NULL OR p.phase_end IS NULL THEN NULL
    ELSE ROUND((COALESCE(c.nb_personnes,0) * public.jours_ouvres_entre(p.phase_start::date, p.phase_end::date) * 8)::numeric / NULLIF(p.heures_prevues,0), 2)
  END AS ratio_capacite_vs_prevu,
  p.phase_start::date AS phase_start,
  p.phase_end::date AS phase_end
FROM phase_def p
LEFT JOIN casting c ON c.affaire_id = p.affaire_id AND c.phase = p.phase;

GRANT SELECT ON public.v_affaire_equipe_capacite TO authenticated;

COMMENT ON VIEW public.v_affaire_equipe_capacite IS
'Sprint D / Batch 2 finition — Capacité équipe par phase. Fenêtres contextuelles : commercial(created→signed/today), fabrication(plan ou signed→montage), logistique(min(plan,signed)→démontage+2), montage(montage→démontage), démontage(démontage→+2j). Statut dates_manquantes si fenêtre invalide.';

-- =========================================================================
-- Nouvelle vue : capacité par métier (fabrication) pour décomposition UI Casting
-- =========================================================================
DROP VIEW IF EXISTS public.v_affaire_equipe_capacite_metier CASCADE;

CREATE VIEW public.v_affaire_equipe_capacite_metier
WITH (security_invoker = true)
AS
WITH plan_fab AS (
  SELECT DISTINCT ON (affaire_id) affaire_id, date_debut_fab, date_fin_fab
  FROM public.staffing_plan WHERE status = 'published'
  ORDER BY affaire_id, published_at DESC NULLS LAST
),
fab_window AS (
  SELECT a.id AS affaire_id,
         COALESCE(pf.date_debut_fab, a.signed_at::date) AS phase_start,
         COALESCE(pf.date_fin_fab, a.date_montage) AS phase_end
  FROM public.affaires a
  LEFT JOIN plan_fab pf ON pf.affaire_id = a.id
),
heures AS (
  -- 1 ligne par (affaire, metier_id) avec heures prévues totales pour ce métier
  SELECT fo.affaire_id, 4 AS metier_id, SUM(COALESCE(fo.heures_prevues_numerique,0))::numeric AS heures_prevues
    FROM public.fabrication_objets fo WHERE fo.archive = false GROUP BY fo.affaire_id
  UNION ALL
  SELECT fo.affaire_id, 1, SUM(COALESCE(fo.heures_prevues_bois,0))::numeric
    FROM public.fabrication_objets fo WHERE fo.archive = false GROUP BY fo.affaire_id
  UNION ALL
  SELECT fo.affaire_id, 2, SUM(COALESCE(fo.heures_prevues_metal,0))::numeric
    FROM public.fabrication_objets fo WHERE fo.archive = false GROUP BY fo.affaire_id
  UNION ALL
  SELECT fo.affaire_id, 3, SUM(COALESCE(fo.heures_prevues_peinture,0))::numeric
    FROM public.fabrication_objets fo WHERE fo.archive = false GROUP BY fo.affaire_id
  UNION ALL
  SELECT fo.affaire_id, 5, SUM(COALESCE(fo.heures_prevues_tapisserie,0))::numeric
    FROM public.fabrication_objets fo WHERE fo.archive = false GROUP BY fo.affaire_id
  UNION ALL
  -- impression UV : pas de colonne dédiée → NULL (heures non saisies)
  SELECT fo.affaire_id, 9, NULL::numeric
    FROM public.fabrication_objets fo WHERE fo.archive = false GROUP BY fo.affaire_id
),
pers AS (
  SELECT ae.affaire_id, e.metier_principal_id AS metier_id,
         COUNT(DISTINCT ae.employe_id)::int AS nb_personnes
  FROM public.affaire_equipe ae
  JOIN public.employes e ON e.id = ae.employe_id
  WHERE ae.removed_at IS NULL AND ae.phase = 'fabrication'
  GROUP BY ae.affaire_id, e.metier_principal_id
),
metiers_fab AS (
  SELECT unnest(ARRAY[4,1,2,3,5,9]) AS metier_id
)
SELECT
  h.affaire_id,
  h.metier_id,
  COALESCE(p.nb_personnes, 0) AS nb_personnes_castees,
  h.heures_prevues,
  CASE WHEN fw.phase_start IS NULL OR fw.phase_end IS NULL OR fw.phase_end < fw.phase_start
       THEN 0
       ELSE public.jours_ouvres_entre(fw.phase_start, fw.phase_end)
  END AS jours_ouvres_phase,
  CASE WHEN h.heures_prevues IS NULL OR fw.phase_start IS NULL OR fw.phase_end IS NULL THEN NULL
       ELSE (COALESCE(p.nb_personnes,0) * public.jours_ouvres_entre(fw.phase_start, fw.phase_end) * 8)::numeric
  END AS capacite_estimee_h,
  CASE
    WHEN fw.phase_start IS NULL OR fw.phase_end IS NULL THEN 'dates_manquantes'
    WHEN h.heures_prevues IS NULL OR h.heures_prevues = 0 THEN NULL
    WHEN COALESCE(p.nb_personnes,0) = 0 THEN 'fortement_sous_dim'
    WHEN (COALESCE(p.nb_personnes,0) * public.jours_ouvres_entre(fw.phase_start, fw.phase_end) * 8) >= h.heures_prevues THEN 'ok'
    WHEN (COALESCE(p.nb_personnes,0) * public.jours_ouvres_entre(fw.phase_start, fw.phase_end) * 8) >= (0.8 * h.heures_prevues) THEN 'sous_dim'
    ELSE 'fortement_sous_dim'
  END AS statut,
  CASE
    WHEN h.heures_prevues IS NULL OR h.heures_prevues = 0 OR fw.phase_start IS NULL OR fw.phase_end IS NULL THEN NULL
    ELSE ROUND((COALESCE(p.nb_personnes,0) * public.jours_ouvres_entre(fw.phase_start, fw.phase_end) * 8)::numeric / NULLIF(h.heures_prevues,0), 2)
  END AS ratio_capacite_vs_prevu
FROM heures h
JOIN fab_window fw ON fw.affaire_id = h.affaire_id
LEFT JOIN pers p ON p.affaire_id = h.affaire_id AND p.metier_id = h.metier_id
WHERE h.metier_id IN (SELECT metier_id FROM metiers_fab);

GRANT SELECT ON public.v_affaire_equipe_capacite_metier TO authenticated;

COMMENT ON VIEW public.v_affaire_equipe_capacite_metier IS
'Sprint D / Batch 2 finition — Capacité par métier (fabrication uniquement). Une ligne par (affaire_id, metier_id) pour les 6 métiers fab : numérique(4), bois(1), métal(2), peinture(3), tapisserie(5), impression UV(9).';