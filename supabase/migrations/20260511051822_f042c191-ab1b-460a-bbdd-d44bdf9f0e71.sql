-- ============================================================
-- v0.43 — Historique équipe par chantier
-- ============================================================

-- 1. Table principale ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.affaire_equipe_historique (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affaire_id uuid NOT NULL,
  affaire_numero text,
  client text,
  typologie text,
  phase text,
  affaire_statut text,
  affaire_cloturee boolean NOT NULL DEFAULT false,
  date_debut_affaire date,
  date_fin_affaire date,

  chef_id uuid NOT NULL,                     -- employes.id
  chef_role text NOT NULL,                   -- 'chef_chantier' | 'responsable_montage' | 'responsable_demontage' | 'chef_projet' | 'charge_affaires'

  employe_id uuid NOT NULL,
  metier_principal_id integer,
  type_contrat text,

  nb_demi_jours integer NOT NULL DEFAULT 0,
  nb_jours_distincts integer NOT NULL DEFAULT 0,
  premier_jour date,
  dernier_jour date,
  presence_pct_moyen numeric NOT NULL DEFAULT 100,
  a_refuse boolean NOT NULL DEFAULT false,
  a_ete_absent boolean NOT NULL DEFAULT false,

  derniere_assignation_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT aeh_uniq UNIQUE (affaire_id, chef_id, chef_role, employe_id)
);

CREATE INDEX IF NOT EXISTS idx_aeh_chef_typo ON public.affaire_equipe_historique (chef_id, typologie);
CREATE INDEX IF NOT EXISTS idx_aeh_chef_employe ON public.affaire_equipe_historique (chef_id, employe_id);
CREATE INDEX IF NOT EXISTS idx_aeh_affaire ON public.affaire_equipe_historique (affaire_id);
CREATE INDEX IF NOT EXISTS idx_aeh_client_typo ON public.affaire_equipe_historique (client, typologie);
CREATE INDEX IF NOT EXISTS idx_aeh_dernier_jour ON public.affaire_equipe_historique (dernier_jour DESC);

ALTER TABLE public.affaire_equipe_historique ENABLE ROW LEVEL SECURITY;

-- RLS : lecture chef/admin OU employé concerné OU utilisateur ayant accès à l'affaire
DROP POLICY IF EXISTS aeh_select ON public.affaire_equipe_historique;
CREATE POLICY aeh_select ON public.affaire_equipe_historique
  FOR SELECT TO authenticated
  USING (
    is_chef_or_admin()
    OR employe_id IN (SELECT id FROM employes WHERE profile_id = auth.uid())
    OR user_has_affaire_access(affaire_id)
  );

-- Aucune écriture client : table maintenue par trigger SECURITY DEFINER.

-- 2. Fonction de recalcul atomique pour une affaire ---------------------
CREATE OR REPLACE FUNCTION public.refresh_affaire_equipe_historique(_affaire_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_typologie text;
  v_client text;
  v_phase text;
  v_statut text;
  v_numero text;
  v_date_debut date;
  v_date_fin date;
  v_cloturee boolean;
BEGIN
  -- Snapshot affaire
  SELECT
    compute_affaire_typologie(a.numero),
    a.client,
    a.phase::text,
    a.statut::text,
    a.numero,
    a.date_debut,
    a.date_fin_prevue,
    (a.statut::text IN ('termine','annule'))
  INTO v_typologie, v_client, v_phase, v_statut, v_numero, v_date_debut, v_date_fin, v_cloturee
  FROM affaires a
  WHERE a.id = _affaire_id;

  IF NOT FOUND THEN
    -- Affaire supprimée → on purge l'historique associé
    DELETE FROM affaire_equipe_historique WHERE affaire_id = _affaire_id;
    RETURN;
  END IF;

  -- Purge puis recalcul
  DELETE FROM affaire_equipe_historique WHERE affaire_id = _affaire_id;

  WITH chefs AS (
    SELECT chef_chantier_id AS chef_id, 'chef_chantier'::text AS chef_role FROM affaires WHERE id = _affaire_id AND chef_chantier_id IS NOT NULL
    UNION ALL
    SELECT responsable_montage_id, 'responsable_montage'::text FROM affaires WHERE id = _affaire_id AND responsable_montage_id IS NOT NULL
    UNION ALL
    SELECT responsable_demontage_id, 'responsable_demontage'::text FROM affaires WHERE id = _affaire_id AND responsable_demontage_id IS NOT NULL
    UNION ALL
    SELECT chef_projet_id, 'chef_projet'::text FROM affaires WHERE id = _affaire_id AND chef_projet_id IS NOT NULL
    UNION ALL
    SELECT charge_affaires_id, 'charge_affaires'::text FROM affaires WHERE id = _affaire_id AND charge_affaires_id IS NOT NULL
  ),
  agg AS (
    SELECT
      a.employe_id,
      e.metier_principal_id,
      e.type_contrat::text AS type_contrat,
      COUNT(*)::int AS nb_demi_jours,
      COUNT(DISTINCT a.date)::int AS nb_jours_distincts,
      MIN(a.date) AS premier_jour,
      MAX(a.date) AS dernier_jour,
      COALESCE(AVG(NULLIF(a.heures,0) / 4.0 * 100.0), 100)::numeric AS presence_pct_moyen,
      bool_or(a.statut_confirmation = 'refusee') AS a_refuse,
      MAX(a.updated_at) AS derniere_assignation_at
    FROM assignations a
    JOIN employes e ON e.id = a.employe_id
    WHERE a.affaire_id = _affaire_id
    GROUP BY a.employe_id, e.metier_principal_id, e.type_contrat
  ),
  absent_flags AS (
    SELECT DISTINCT a.employe_id
    FROM assignations a
    JOIN absences ab ON ab.employe_id = a.employe_id
                    AND ab.valide = true
                    AND a.date BETWEEN ab.date_debut AND ab.date_fin
    WHERE a.affaire_id = _affaire_id
  )
  INSERT INTO affaire_equipe_historique (
    affaire_id, affaire_numero, client, typologie, phase, affaire_statut, affaire_cloturee,
    date_debut_affaire, date_fin_affaire,
    chef_id, chef_role,
    employe_id, metier_principal_id, type_contrat,
    nb_demi_jours, nb_jours_distincts, premier_jour, dernier_jour,
    presence_pct_moyen, a_refuse, a_ete_absent,
    derniere_assignation_at
  )
  SELECT
    _affaire_id, v_numero, v_client, v_typologie, v_phase, v_statut, v_cloturee,
    v_date_debut, v_date_fin,
    c.chef_id, c.chef_role,
    g.employe_id, g.metier_principal_id, g.type_contrat,
    g.nb_demi_jours, g.nb_jours_distincts, g.premier_jour, g.dernier_jour,
    g.presence_pct_moyen, g.a_refuse,
    (af.employe_id IS NOT NULL),
    g.derniere_assignation_at
  FROM chefs c
  CROSS JOIN agg g
  LEFT JOIN absent_flags af ON af.employe_id = g.employe_id
  WHERE c.chef_id <> g.employe_id;  -- on ne se compte pas soi-même
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_affaire_equipe_historique(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_affaire_equipe_historique(uuid) TO authenticated, service_role;

-- 3. Triggers temps réel -------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_aeh_on_assignation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM refresh_affaire_equipe_historique(OLD.affaire_id);
    RETURN OLD;
  END IF;
  PERFORM refresh_affaire_equipe_historique(NEW.affaire_id);
  IF TG_OP = 'UPDATE' AND OLD.affaire_id <> NEW.affaire_id THEN
    PERFORM refresh_affaire_equipe_historique(OLD.affaire_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_aeh_assignations ON public.assignations;
CREATE TRIGGER trg_aeh_assignations
  AFTER INSERT OR UPDATE OR DELETE ON public.assignations
  FOR EACH ROW EXECUTE FUNCTION public.trg_aeh_on_assignation();

CREATE OR REPLACE FUNCTION public.trg_aeh_on_affaire()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM affaire_equipe_historique WHERE affaire_id = OLD.id;
    RETURN OLD;
  END IF;
  -- Refresh seulement si une dimension snapshot a changé
  IF TG_OP = 'INSERT'
     OR OLD.client IS DISTINCT FROM NEW.client
     OR OLD.numero IS DISTINCT FROM NEW.numero
     OR OLD.statut IS DISTINCT FROM NEW.statut
     OR OLD.phase IS DISTINCT FROM NEW.phase
     OR OLD.chef_chantier_id IS DISTINCT FROM NEW.chef_chantier_id
     OR OLD.responsable_montage_id IS DISTINCT FROM NEW.responsable_montage_id
     OR OLD.responsable_demontage_id IS DISTINCT FROM NEW.responsable_demontage_id
     OR OLD.chef_projet_id IS DISTINCT FROM NEW.chef_projet_id
     OR OLD.charge_affaires_id IS DISTINCT FROM NEW.charge_affaires_id
     OR OLD.date_debut IS DISTINCT FROM NEW.date_debut
     OR OLD.date_fin_prevue IS DISTINCT FROM NEW.date_fin_prevue
  THEN
    PERFORM refresh_affaire_equipe_historique(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_aeh_affaires ON public.affaires;
CREATE TRIGGER trg_aeh_affaires
  AFTER INSERT OR UPDATE OR DELETE ON public.affaires
  FOR EACH ROW EXECUTE FUNCTION public.trg_aeh_on_affaire();

-- 4. RPC "Mon équipe type" ---------------------------------------------
CREATE OR REPLACE FUNCTION public.get_mon_equipe_type(
  _typologie text DEFAULT NULL,
  _limit integer DEFAULT 8,
  _months integer DEFAULT 12
)
RETURNS TABLE (
  employe_id uuid,
  prenom text,
  nom text,
  metier_principal_id integer,
  type_contrat text,
  poste_principal text,
  nb_chantiers integer,
  total_demi_jours integer,
  presence_pct_moyen numeric,
  derniere_collab date,
  score numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chef_id uuid;
BEGIN
  SELECT id INTO v_chef_id FROM employes WHERE profile_id = auth.uid() LIMIT 1;
  IF v_chef_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.prenom,
    e.nom,
    e.metier_principal_id,
    e.type_contrat::text,
    e.poste_principal,
    COUNT(DISTINCT h.affaire_id)::int AS nb_chantiers,
    SUM(h.nb_demi_jours)::int AS total_demi_jours,
    ROUND(AVG(h.presence_pct_moyen)::numeric, 1) AS presence_pct_moyen,
    MAX(h.dernier_jour) AS derniere_collab,
    -- score = nb_chantiers * 2 + log(total_demi_jours+1) * 3 + fraicheur (jours récents)
    ROUND(
      (COUNT(DISTINCT h.affaire_id) * 2)
      + (LN(SUM(h.nb_demi_jours) + 1) * 3)
      + GREATEST(0, 30 - EXTRACT(DAY FROM (CURRENT_DATE - MAX(h.dernier_jour))))::numeric / 10
    , 2) AS score
  FROM affaire_equipe_historique h
  JOIN employes e ON e.id = h.employe_id
  WHERE h.chef_id = v_chef_id
    AND (_typologie IS NULL OR h.typologie = _typologie)
    AND h.dernier_jour >= (CURRENT_DATE - (_months || ' months')::interval)
    AND e.actif = true
    AND NOT h.a_refuse
  GROUP BY e.id, e.prenom, e.nom, e.metier_principal_id, e.type_contrat, e.poste_principal
  ORDER BY score DESC
  LIMIT _limit;
END;
$$;

REVOKE ALL ON FUNCTION public.get_mon_equipe_type(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_mon_equipe_type(text, integer, integer) TO authenticated;

-- 5. Backfill initial ---------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT DISTINCT affaire_id FROM assignations LOOP
    PERFORM refresh_affaire_equipe_historique(r.affaire_id);
  END LOOP;
END;
$$;

-- 6. updated_at trigger -------------------------------------------------
CREATE TRIGGER trg_aeh_updated_at
  BEFORE UPDATE ON public.affaire_equipe_historique
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();