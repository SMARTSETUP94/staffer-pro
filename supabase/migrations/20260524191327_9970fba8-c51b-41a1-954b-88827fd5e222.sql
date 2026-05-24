-- ============================================================
-- Sprint C / C4 — Retrait du flag bypass enforce_objet_equipe_strict
-- ============================================================
-- Pré-requis vérifié : 0 lignes orphelines dans fabrication_objet_equipe
-- (audit du 2026-05-24 : 0 mismatched).
--
-- 1) Refonte sync_equipes_from_plan : la fonction garantit elle-même
--    qu'une ligne affaire_equipe(phase='fabrication') existe avant
--    d'insérer dans fabrication_objet_equipe. Plus besoin du bypass.
-- 2) Refonte enforce_objet_equipe_strict : suppression du test bypass.
--    Le trigger redevient autoritaire et non contournable.

CREATE OR REPLACE FUNCTION public.sync_equipes_from_plan(p_plan_id uuid, p_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_affaire_id uuid;
  v_n2 int := 0;
  v_n2_fab int := 0;
  v_n3 int := 0;
  v_phase_updates int := 0;
BEGIN
  SELECT affaire_id INTO v_affaire_id
  FROM staffing_plan WHERE id = p_plan_id;

  IF v_affaire_id IS NULL THEN
    RETURN jsonb_build_object('n2_upserts', 0, 'n3_upserts', 0, 'phase_updates', 0);
  END IF;

  -- N2 : affaire_equipe (1 ligne par employe × phase normalisée du step)
  WITH ups AS (
    INSERT INTO affaire_equipe (affaire_id, employe_id, phase, added_by, removed_at, removed_by)
    SELECT DISTINCT
      v_affaire_id,
      a.employe_id,
      CASE
        WHEN s.phase IN ('commercial_etude','fabrication','montage','demontage') THEN s.phase
        ELSE 'fabrication'
      END AS phase,
      p_user_id,
      NULL::timestamptz,
      NULL::uuid
    FROM staffing_plan_assignment a
    JOIN staffing_plan_step s ON s.id = a.step_id
    WHERE s.plan_id = p_plan_id
    ON CONFLICT (affaire_id, employe_id, phase) DO UPDATE
      SET removed_at = NULL, removed_by = NULL, updated_at = now()
    RETURNING 1
  )
  SELECT count(*) INTO v_n2 FROM ups;

  -- N2-bis : garantit phase='fabrication' pour TOUT employé qui sera inséré en N3,
  -- y compris si le step a une phase != 'fabrication' (cas rare montage/demontage
  -- avec objet_id). Pré-requis du trigger enforce_objet_equipe_strict.
  WITH ups AS (
    INSERT INTO affaire_equipe (affaire_id, employe_id, phase, added_by, removed_at, removed_by)
    SELECT DISTINCT
      v_affaire_id,
      a.employe_id,
      'fabrication',
      p_user_id,
      NULL::timestamptz,
      NULL::uuid
    FROM staffing_plan_assignment a
    JOIN staffing_plan_step s ON s.id = a.step_id
    WHERE s.plan_id = p_plan_id AND s.objet_id IS NOT NULL
    ON CONFLICT (affaire_id, employe_id, phase) DO UPDATE
      SET removed_at = NULL, removed_by = NULL, updated_at = now()
    RETURNING 1
  )
  SELECT count(*) INTO v_n2_fab FROM ups;

  -- N3 : fabrication_objet_equipe (1 ligne par employe × objet)
  -- Trigger enforce_objet_equipe_strict passe naturellement grâce à N2-bis.
  WITH ups AS (
    INSERT INTO fabrication_objet_equipe (objet_id, employe_id, added_by, removed_at, removed_by)
    SELECT DISTINCT
      s.objet_id,
      a.employe_id,
      p_user_id,
      NULL::timestamptz,
      NULL::uuid
    FROM staffing_plan_assignment a
    JOIN staffing_plan_step s ON s.id = a.step_id
    WHERE s.plan_id = p_plan_id AND s.objet_id IS NOT NULL
    ON CONFLICT (objet_id, employe_id) DO UPDATE
      SET removed_at = NULL, removed_by = NULL, updated_at = now()
    RETURNING 1
  )
  SELECT count(*) INTO v_n3 FROM ups;

  -- Propagation phase steps → assignations (seulement celles sans phase déjà)
  WITH upd AS (
    UPDATE assignations asg
    SET phase = s.phase
    FROM staffing_plan_step s
    WHERE asg.staffing_plan_id = p_plan_id
      AND asg.metier_id = s.metier_id
      AND s.plan_id = p_plan_id
      AND s.phase IS NOT NULL
      AND asg.phase IS NULL
    RETURNING 1
  )
  SELECT count(*) INTO v_phase_updates FROM upd;

  RETURN jsonb_build_object(
    'n2_upserts', v_n2 + v_n2_fab,
    'n3_upserts', v_n3,
    'phase_updates', v_phase_updates
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sync_equipes_from_plan(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_equipes_from_plan(uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.sync_equipes_from_plan(uuid, uuid) IS
'Sprint C / C4 — Sync équipes 3 niveaux (N2 affaire_equipe + N3 objet_equipe) + propagation phase sur assignations. Idempotent. Cascade explicite N2(fabrication) avant N3 pour respecter enforce_objet_equipe_strict sans bypass. Ne modifie PAS staffing_plan.status.';

-- ------------------------------------------------------------
-- Trigger autoritaire : retrait du test de bypass.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_objet_equipe_strict()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_affaire_id uuid;
  v_exists boolean;
BEGIN
  SELECT affaire_id INTO v_affaire_id
  FROM fabrication_objets WHERE id = NEW.objet_id;

  IF v_affaire_id IS NULL THEN
    RAISE EXCEPTION 'enforce_objet_equipe_strict: objet % introuvable', NEW.objet_id;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM affaire_equipe
    WHERE affaire_id = v_affaire_id
      AND employe_id = NEW.employe_id
      AND phase = 'fabrication'
      AND removed_at IS NULL
  ) INTO v_exists;

  IF NOT v_exists THEN
    RAISE EXCEPTION 'enforce_objet_equipe_strict: employe % non présent dans affaire_equipe (affaire=%, phase=fabrication). Ajoutez via affaire_equipe d''abord.',
      NEW.employe_id, v_affaire_id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_objet_equipe_strict() IS
'Sprint C / C4 — Trigger autoritaire (plus de bypass). Toute insertion dans fabrication_objet_equipe requiert une ligne affaire_equipe(phase=fabrication) active.';
