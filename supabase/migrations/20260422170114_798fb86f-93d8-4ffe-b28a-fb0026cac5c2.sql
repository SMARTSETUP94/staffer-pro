-- v0.18.1 — Fix agrégat heures staffées : inclure les assignations sans devis_id
-- Cause racine : la vue v_devis_consommation filtrait WHERE a.devis_id = d.id, donc
-- ignorait toutes les assignations créées sans rattachement explicite à un devis
-- (cas le plus fréquent du staffing direct depuis Planning).
--
-- Stratégie : pour chaque poste devis (devis_id, metier_id), une assignation compte si :
--   - elle référence ce devis explicitement, OU
--   - elle n'a aucun devis_id ET appartient à la même affaire+même métier ET ce devis
--     est le PREMIER devis (par created_at) de l'affaire ayant ce métier (évite double
--     comptage si l'affaire a plusieurs devis sur le même métier).

DROP VIEW IF EXISTS public.v_devis_consommation CASCADE;

CREATE VIEW public.v_devis_consommation AS
WITH first_devis_par_metier AS (
  SELECT DISTINCT ON (d.affaire_id, dp.metier_id)
    d.affaire_id,
    dp.metier_id,
    d.id AS first_devis_id
  FROM public.devis d
  JOIN public.devis_postes dp ON dp.devis_id = d.id
  ORDER BY d.affaire_id, dp.metier_id, d.created_at ASC, d.id ASC
)
SELECT
  d.id AS devis_id,
  d.affaire_id,
  d.numero AS devis_numero,
  m.id AS metier_id,
  m.libelle AS metier,
  m.couleur,
  m.ordre,
  dp.heures_prevues,
  COALESCE((
    SELECT SUM(a.heures)
    FROM public.assignations a
    LEFT JOIN first_devis_par_metier fd
      ON fd.affaire_id = a.affaire_id AND fd.metier_id = a.metier_id
    WHERE a.metier_id = m.id
      AND (
        a.devis_id = d.id
        OR (a.devis_id IS NULL AND a.affaire_id = d.affaire_id AND fd.first_devis_id = d.id)
      )
  ), 0::numeric) AS heures_assignees,
  COALESCE((
    SELECT SUM(hs.heures_reelles)
    FROM public.heures_saisies hs
    LEFT JOIN public.assignations a ON a.id = hs.assignation_id
    LEFT JOIN first_devis_par_metier fd
      ON fd.affaire_id = hs.affaire_id AND fd.metier_id = a.metier_id
    WHERE hs.statut = 'valide'
      AND (
        (a.devis_id = d.id AND a.metier_id = m.id)
        OR (
          hs.devis_id = d.id
        )
        OR (
          a.devis_id IS NULL AND hs.devis_id IS NULL
          AND hs.affaire_id = d.affaire_id
          AND a.metier_id = m.id
          AND fd.first_devis_id = d.id
        )
      )
  ), 0::numeric) AS heures_reelles_validees,
  COALESCE((
    SELECT SUM(hs.heures_reelles)
    FROM public.heures_saisies hs
    LEFT JOIN public.assignations a ON a.id = hs.assignation_id
    LEFT JOIN first_devis_par_metier fd
      ON fd.affaire_id = hs.affaire_id AND fd.metier_id = a.metier_id
    WHERE hs.statut = 'soumis'
      AND (
        (a.devis_id = d.id AND a.metier_id = m.id)
        OR (hs.devis_id = d.id)
        OR (
          a.devis_id IS NULL AND hs.devis_id IS NULL
          AND hs.affaire_id = d.affaire_id
          AND a.metier_id = m.id
          AND fd.first_devis_id = d.id
        )
      )
  ), 0::numeric) AS heures_reelles_soumises,
  dp.heures_prevues - COALESCE((
    SELECT SUM(a.heures)
    FROM public.assignations a
    LEFT JOIN first_devis_par_metier fd
      ON fd.affaire_id = a.affaire_id AND fd.metier_id = a.metier_id
    WHERE a.metier_id = m.id
      AND (
        a.devis_id = d.id
        OR (a.devis_id IS NULL AND a.affaire_id = d.affaire_id AND fd.first_devis_id = d.id)
      )
  ), 0::numeric) AS heures_restantes,
  dp.heures_prevues - COALESCE((
    SELECT SUM(hs.heures_reelles)
    FROM public.heures_saisies hs
    LEFT JOIN public.assignations a ON a.id = hs.assignation_id
    LEFT JOIN first_devis_par_metier fd
      ON fd.affaire_id = hs.affaire_id AND fd.metier_id = a.metier_id
    WHERE hs.statut = 'valide'
      AND (
        (a.devis_id = d.id AND a.metier_id = m.id)
        OR (hs.devis_id = d.id)
        OR (
          a.devis_id IS NULL AND hs.devis_id IS NULL
          AND hs.affaire_id = d.affaire_id
          AND a.metier_id = m.id
          AND fd.first_devis_id = d.id
        )
      )
  ), 0::numeric) AS heures_restantes_vs_validees,
  CASE
    WHEN dp.heures_prevues = 0::numeric THEN 0::numeric
    ELSE round(COALESCE((
      SELECT SUM(a.heures)
      FROM public.assignations a
      LEFT JOIN first_devis_par_metier fd
        ON fd.affaire_id = a.affaire_id AND fd.metier_id = a.metier_id
      WHERE a.metier_id = m.id
        AND (
          a.devis_id = d.id
          OR (a.devis_id IS NULL AND a.affaire_id = d.affaire_id AND fd.first_devis_id = d.id)
        )
    ), 0::numeric) / dp.heures_prevues * 100::numeric, 1)
  END AS pct_consomme,
  CASE
    WHEN dp.heures_prevues = 0::numeric THEN 0::numeric
    ELSE round(COALESCE((
      SELECT SUM(hs.heures_reelles)
      FROM public.heures_saisies hs
      LEFT JOIN public.assignations a ON a.id = hs.assignation_id
      LEFT JOIN first_devis_par_metier fd
        ON fd.affaire_id = hs.affaire_id AND fd.metier_id = a.metier_id
      WHERE hs.statut = 'valide'
        AND (
          (a.devis_id = d.id AND a.metier_id = m.id)
          OR (hs.devis_id = d.id)
          OR (
            a.devis_id IS NULL AND hs.devis_id IS NULL
            AND hs.affaire_id = d.affaire_id
            AND a.metier_id = m.id
            AND fd.first_devis_id = d.id
          )
        )
    ), 0::numeric) / dp.heures_prevues * 100::numeric, 1)
  END AS pct_consomme_reel
FROM public.devis d
JOIN public.devis_postes dp ON dp.devis_id = d.id
JOIN public.metiers m ON m.id = dp.metier_id;

ALTER VIEW public.v_devis_consommation SET (security_invoker = true);

-- v_affaire_consommation : déjà correcte (filtre uniquement par affaire_id), on la
-- recrée à l'identique pour rétablir les dépendances cassées par le DROP CASCADE.
DROP VIEW IF EXISTS public.v_affaire_consommation CASCADE;

CREATE VIEW public.v_affaire_consommation AS
SELECT
  aff.id AS affaire_id,
  aff.numero,
  aff.nom,
  COALESCE((
    SELECT SUM(dp.heures_prevues)
    FROM public.devis d
    JOIN public.devis_postes dp ON dp.devis_id = d.id
    WHERE d.affaire_id = aff.id
  ), 0::numeric) AS total_heures_prevues,
  COALESCE((
    SELECT SUM(a.heures)
    FROM public.assignations a
    WHERE a.affaire_id = aff.id
  ), 0::numeric) AS total_heures_assignees,
  COALESCE((
    SELECT SUM(hs.heures_reelles)
    FROM public.heures_saisies hs
    WHERE hs.affaire_id = aff.id
      AND hs.statut = 'valide'
  ), 0::numeric) AS total_heures_reelles_validees,
  COALESCE((
    SELECT SUM(hs.heures_reelles)
    FROM public.heures_saisies hs
    WHERE hs.affaire_id = aff.id
      AND hs.statut = 'soumis'
  ), 0::numeric) AS total_heures_reelles_soumises
FROM public.affaires aff;

ALTER VIEW public.v_affaire_consommation SET (security_invoker = true);