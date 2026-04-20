
-- ============================================================
-- v_devis_consommation : ajout des colonnes heures réelles
-- ============================================================
DROP VIEW IF EXISTS public.v_devis_consommation CASCADE;

CREATE VIEW public.v_devis_consommation AS
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
    FROM assignations a
    WHERE a.devis_id = d.id AND a.metier_id = m.id
  ), 0::numeric) AS heures_assignees,
  COALESCE((
    SELECT SUM(hs.heures_reelles)
    FROM heures_saisies hs
    JOIN assignations a ON a.id = hs.assignation_id
    WHERE a.devis_id = d.id AND a.metier_id = m.id
      AND hs.statut = 'valide'
  ), 0::numeric) AS heures_reelles_validees,
  COALESCE((
    SELECT SUM(hs.heures_reelles)
    FROM heures_saisies hs
    JOIN assignations a ON a.id = hs.assignation_id
    WHERE a.devis_id = d.id AND a.metier_id = m.id
      AND hs.statut = 'soumis'
  ), 0::numeric) AS heures_reelles_soumises,
  dp.heures_prevues - COALESCE((
    SELECT SUM(a.heures)
    FROM assignations a
    WHERE a.devis_id = d.id AND a.metier_id = m.id
  ), 0::numeric) AS heures_restantes,
  dp.heures_prevues - COALESCE((
    SELECT SUM(hs.heures_reelles)
    FROM heures_saisies hs
    JOIN assignations a ON a.id = hs.assignation_id
    WHERE a.devis_id = d.id AND a.metier_id = m.id
      AND hs.statut = 'valide'
  ), 0::numeric) AS heures_restantes_vs_validees,
  CASE
    WHEN dp.heures_prevues = 0::numeric THEN 0::numeric
    ELSE round(COALESCE((
      SELECT SUM(a.heures)
      FROM assignations a
      WHERE a.devis_id = d.id AND a.metier_id = m.id
    ), 0::numeric) / dp.heures_prevues * 100::numeric, 1)
  END AS pct_consomme,
  CASE
    WHEN dp.heures_prevues = 0::numeric THEN 0::numeric
    ELSE round(COALESCE((
      SELECT SUM(hs.heures_reelles)
      FROM heures_saisies hs
      JOIN assignations a ON a.id = hs.assignation_id
      WHERE a.devis_id = d.id AND a.metier_id = m.id
        AND hs.statut = 'valide'
    ), 0::numeric) / dp.heures_prevues * 100::numeric, 1)
  END AS pct_consomme_reel
FROM devis d
JOIN devis_postes dp ON dp.devis_id = d.id
JOIN metiers m ON m.id = dp.metier_id;

-- ============================================================
-- v_affaire_consommation : ajout des totaux heures réelles
-- ============================================================
DROP VIEW IF EXISTS public.v_affaire_consommation CASCADE;

CREATE VIEW public.v_affaire_consommation AS
SELECT
  aff.id AS affaire_id,
  aff.numero,
  aff.nom,
  COALESCE((
    SELECT SUM(dp.heures_prevues)
    FROM devis d
    JOIN devis_postes dp ON dp.devis_id = d.id
    WHERE d.affaire_id = aff.id
  ), 0::numeric) AS total_heures_prevues,
  COALESCE((
    SELECT SUM(a.heures)
    FROM assignations a
    WHERE a.affaire_id = aff.id
  ), 0::numeric) AS total_heures_assignees,
  COALESCE((
    SELECT SUM(hs.heures_reelles)
    FROM heures_saisies hs
    WHERE hs.affaire_id = aff.id
      AND hs.statut = 'valide'
  ), 0::numeric) AS total_heures_reelles_validees,
  COALESCE((
    SELECT SUM(hs.heures_reelles)
    FROM heures_saisies hs
    WHERE hs.affaire_id = aff.id
      AND hs.statut = 'soumis'
  ), 0::numeric) AS total_heures_reelles_soumises
FROM affaires aff;
