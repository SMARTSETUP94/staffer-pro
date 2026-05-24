
-- Sprint B / B1 — Fonction interne sync_equipes_from_plan
-- Appelée par publishStaffingPlan (sur status='published') ET backfill (status préservé)
-- SECURITY DEFINER pour bypass le trigger enforce_objet_equipe_strict de façon atomique.

CREATE OR REPLACE FUNCTION public.sync_equipes_from_plan(p_plan_id uuid, p_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_affaire_id uuid;
  v_n2 int := 0;
  v_n3 int := 0;
  v_phase_updates int := 0;
BEGIN
  -- Activer le bypass pour cette session/transaction
  PERFORM set_config('app.bypass_objet_equipe_strict', 'true', true);

  SELECT affaire_id INTO v_affaire_id
  FROM staffing_plan WHERE id = p_plan_id;

  IF v_affaire_id IS NULL THEN
    RETURN jsonb_build_object('n2_upserts', 0, 'n3_upserts', 0, 'phase_updates', 0);
  END IF;

  -- N2 : affaire_equipe (1 ligne par employe × phase normalisée)
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

  -- N3 : fabrication_objet_equipe (1 ligne par employe × objet)
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
    'n2_upserts', v_n2,
    'n3_upserts', v_n3,
    'phase_updates', v_phase_updates
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sync_equipes_from_plan(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_equipes_from_plan(uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.sync_equipes_from_plan(uuid, uuid) IS
'Sprint B / B1 — Sync équipes 3 niveaux (N2 affaire_equipe + N3 objet_equipe) + propagation phase sur assignations. Idempotent. Ne modifie PAS staffing_plan.status. Appelable sur draft ou published.';
