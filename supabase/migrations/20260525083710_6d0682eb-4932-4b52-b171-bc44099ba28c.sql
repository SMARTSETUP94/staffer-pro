-- Sprint D / Batch 1 — Vue de capacité équipe par phase opérationnelle.
-- Formule V1 : capacité = nb_personnes castées × jours_ouvrés_phase × 8 h.
-- Statuts : ok (≥100 %), sous_dim (≥80 %), fortement_sous_dim (<80 %).
-- Renvoyée NULL quand on n'a ni dates ni heures prévues exploitables.

CREATE OR REPLACE FUNCTION public.jours_ouvres_entre(_d1 date, _d2 date)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN _d1 IS NULL OR _d2 IS NULL OR _d2 < _d1 THEN 0
    ELSE (
      SELECT COUNT(*)::int
      FROM generate_series(_d1, _d2, interval '1 day') AS g(d)
      WHERE EXTRACT(ISODOW FROM g.d) < 6
    )
  END;
$$;

CREATE OR REPLACE VIEW public.v_affaire_equipe_capacite AS
WITH phase_def AS (
  SELECT
    a.id AS affaire_id,
    'fabrication'::text AS phase,
    a.date_debut AS phase_start,
    a.date_montage AS phase_end,
    COALESCE((
      SELECT SUM(
        COALESCE(fo.heures_prevues_be, 0)
        + COALESCE(fo.heures_prevues_numerique, 0)
        + COALESCE(fo.heures_prevues_bois, 0)
        + COALESCE(fo.heures_prevues_metal, 0)
        + COALESCE(fo.heures_prevues_peinture, 0)
        + COALESCE(fo.heures_prevues_tapisserie, 0)
        + COALESCE(fo.heures_prevues_manutention, 0)
      )
      FROM public.fabrication_objets fo
      WHERE fo.affaire_id = a.id AND fo.archive = false
    ), 0) AS heures_prevues
  FROM public.affaires a
  UNION ALL
  SELECT
    a.id,
    'montage',
    a.date_montage,
    a.date_demontage,
    COALESCE(a.heures_prevues_montage, 0)
  FROM public.affaires a
  UNION ALL
  SELECT
    a.id,
    'demontage',
    a.date_demontage,
    a.date_fin_prevue,
    COALESCE(a.heures_prevues_demontage, 0)
  FROM public.affaires a
),
casting AS (
  SELECT
    ae.affaire_id,
    ae.phase,
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
  public.jours_ouvres_entre(p.phase_start, p.phase_end) AS jours_ouvres_phase,
  (COALESCE(c.nb_personnes, 0) * public.jours_ouvres_entre(p.phase_start, p.phase_end) * 8)::numeric AS capacite_estimee_h,
  CASE
    WHEN p.heures_prevues IS NULL OR p.heures_prevues = 0 THEN NULL
    WHEN COALESCE(c.nb_personnes, 0) = 0 THEN 'fortement_sous_dim'
    WHEN (COALESCE(c.nb_personnes, 0) * public.jours_ouvres_entre(p.phase_start, p.phase_end) * 8) >= p.heures_prevues THEN 'ok'
    WHEN (COALESCE(c.nb_personnes, 0) * public.jours_ouvres_entre(p.phase_start, p.phase_end) * 8) >= 0.8 * p.heures_prevues THEN 'sous_dim'
    ELSE 'fortement_sous_dim'
  END AS statut,
  CASE
    WHEN p.heures_prevues IS NULL OR p.heures_prevues = 0 THEN NULL
    ELSE ROUND(
      (COALESCE(c.nb_personnes, 0) * public.jours_ouvres_entre(p.phase_start, p.phase_end) * 8)::numeric
      / NULLIF(p.heures_prevues, 0),
      2
    )
  END AS ratio_capacite_vs_prevu,
  p.phase_start,
  p.phase_end
FROM phase_def p
LEFT JOIN casting c
  ON c.affaire_id = p.affaire_id AND c.phase = p.phase;

COMMENT ON VIEW public.v_affaire_equipe_capacite IS
'Sprint D / Batch 1 — Capacité équipe par phase. Formule V1 : nb_personnes × jours_ouvrés × 8h, comparée aux heures prévues. Filtrée par RLS des tables sources (affaires, fabrication_objets, affaire_equipe).';

GRANT SELECT ON public.v_affaire_equipe_capacite TO authenticated;