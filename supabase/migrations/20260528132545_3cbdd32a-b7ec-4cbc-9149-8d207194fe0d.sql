-- RPC list_opportunites_active : 1 query enrichie via LEFT JOIN LATERAL
CREATE OR REPLACE FUNCTION public.list_opportunites_active()
RETURNS TABLE (
  id uuid,
  numero text,
  nom text,
  client text,
  charge_affaires_id uuid,
  taille opportunite_taille,
  statut_opportunite opportunite_statut,
  date_opportunite date,
  date_pat date,
  date_montage date,
  date_demontage date,
  notes text,
  typologie_future text,
  next_action_due_le date,
  next_action_text text,
  last_jalon_etape text,
  last_jalon_date_atteinte date,
  actions_count integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    a.id,
    a.numero,
    a.nom,
    a.client,
    a.charge_affaires_id,
    a.taille,
    a.statut_opportunite,
    a.date_opportunite,
    a.date_pat,
    a.date_montage,
    a.date_demontage,
    a.notes,
    a.typologie_future,
    na.prochaine_action_due_le AS next_action_due_le,
    na.texte AS next_action_text,
    lj.etape::text AS last_jalon_etape,
    lj.date_atteinte AS last_jalon_date_atteinte,
    COALESCE(ac.cnt, 0)::int AS actions_count
  FROM public.affaires a
  LEFT JOIN LATERAL (
    SELECT oa.prochaine_action_due_le, oa.texte
    FROM public.opportunite_actions oa
    WHERE oa.affaire_id = a.id
      AND oa.prochaine_action_due_le IS NOT NULL
    ORDER BY oa.created_at DESC
    LIMIT 1
  ) na ON TRUE
  LEFT JOIN LATERAL (
    SELECT oj.etape, oj.date_atteinte
    FROM public.opportunite_jalons oj
    WHERE oj.affaire_id = a.id
      AND oj.date_atteinte IS NOT NULL
    ORDER BY oj.date_atteinte DESC
    LIMIT 1
  ) lj ON TRUE
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt
    FROM public.opportunite_actions oa2
    WHERE oa2.affaire_id = a.id
  ) ac ON TRUE
  WHERE a.phase = 'opportunite'
    AND a.archived_at IS NULL
  ORDER BY a.date_opportunite DESC NULLS LAST, a.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_opportunites_active() TO authenticated;

-- Index pour accélérer les LEFT JOIN LATERAL
CREATE INDEX IF NOT EXISTS idx_opportunite_actions_affaire_due
  ON public.opportunite_actions (affaire_id, prochaine_action_due_le)
  WHERE prochaine_action_due_le IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_opportunite_actions_affaire_created
  ON public.opportunite_actions (affaire_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_opportunite_jalons_affaire_atteinte
  ON public.opportunite_jalons (affaire_id, date_atteinte DESC)
  WHERE date_atteinte IS NOT NULL;