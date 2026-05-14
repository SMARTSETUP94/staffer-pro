
-- v0.48 — RPC vue planning par pôle consolidée

CREATE OR REPLACE FUNCTION public.staffing_par_pole_consolide(
  p_periode_debut date,
  p_periode_fin   date,
  p_inclure_opportunites boolean DEFAULT false,
  p_filtres_chantier_ids uuid[]    DEFAULT NULL,
  p_filtres_metier_ids   integer[] DEFAULT NULL,
  p_filtres_statut       text[]    DEFAULT NULL
)
RETURNS TABLE (
  chantier_id        uuid,
  chantier_numero    text,
  chantier_nom       text,
  chantier_typologie text,
  chantier_statut    text,
  metier_id          integer,
  metier_libelle     text,
  metier_couleur     text,
  metier_ordre       integer,
  nb_personnes       integer,
  total_demi_jours   integer,
  total_heures       numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
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
    AND (p_inclure_opportunites OR af.numero NOT LIKE '9%')
    AND (p_filtres_chantier_ids IS NULL OR af.id = ANY(p_filtres_chantier_ids))
    AND (p_filtres_metier_ids   IS NULL OR m.id  = ANY(p_filtres_metier_ids))
    AND (p_filtres_statut       IS NULL OR af.statut::text = ANY(p_filtres_statut))
  GROUP BY af.id, af.numero, af.nom, af.typologie, af.statut, m.id, m.libelle, m.couleur, m.ordre
  ORDER BY af.numero, m.ordre;
$$;

GRANT EXECUTE ON FUNCTION public.staffing_par_pole_consolide(date, date, boolean, uuid[], integer[], text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.capacite_par_metier()
RETURNS TABLE (
  metier_id        integer,
  metier_libelle   text,
  metier_couleur   text,
  metier_ordre     integer,
  capacite_cdi_cdd integer,
  capacite_interim integer,
  capacite_totale  integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    m.id, m.libelle, m.couleur, m.ordre,
    COUNT(*) FILTER (WHERE e.type_contrat IN ('CDI','CDD'))::int AS capacite_cdi_cdd,
    COUNT(*) FILTER (WHERE e.type_contrat = 'Interim')::int       AS capacite_interim,
    COUNT(*)::int AS capacite_totale
  FROM metiers m
  LEFT JOIN employes e
    ON e.metier_principal_id = m.id
   AND e.actif = true
   AND e.non_staffing = false
  GROUP BY m.id, m.libelle, m.couleur, m.ordre
  ORDER BY m.ordre;
$$;

GRANT EXECUTE ON FUNCTION public.capacite_par_metier() TO authenticated;
