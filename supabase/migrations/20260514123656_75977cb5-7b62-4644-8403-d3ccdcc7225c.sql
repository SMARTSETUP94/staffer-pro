
CREATE OR REPLACE FUNCTION public.staffing_par_pole_jours(
  p_periode_debut date,
  p_periode_fin   date,
  p_inclure_opportunites boolean DEFAULT false,
  p_filtres_metier_ids   integer[] DEFAULT NULL,
  p_filtres_statut       text[]    DEFAULT NULL
)
RETURNS TABLE (
  metier_id        integer,
  metier_libelle   text,
  metier_couleur   text,
  metier_ordre     integer,
  date_jour        date,
  nb_personnes     integer,
  personnes        jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.staffing_par_pole_jours(date, date, boolean, integer[], text[]) TO authenticated;
