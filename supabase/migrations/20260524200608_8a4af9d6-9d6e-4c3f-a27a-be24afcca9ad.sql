-- Sprint C / C1+C2 — Capability affaire.team.manage + extension sync_equipes_from_plan(p_strategy)

-- 0) Crée la cap dans le catalogue capabilities (FK requise)
INSERT INTO public.capabilities (key, label, description, category, sort_order)
VALUES (
  'affaire.team.manage',
  'Gérer le casting d''affaire',
  'Ajouter/retirer/modifier les personnes dans le casting d''une affaire (niveau 2, par phase).',
  'affaires',
  46
)
ON CONFLICT (key) DO NOTHING;

-- 1) Grant aux mêmes rôles que objet.team.manage
INSERT INTO public.role_capabilities (role, capability, granted)
SELECT role, 'affaire.team.manage', granted
FROM public.role_capabilities
WHERE capability = 'objet.team.manage'
ON CONFLICT (role, capability) DO UPDATE SET granted = EXCLUDED.granted, updated_at = now();

-- 2) Extension sync_equipes_from_plan : nouveau param p_strategy
CREATE OR REPLACE FUNCTION public.sync_equipes_from_plan(
  p_plan_id uuid,
  p_user_id uuid DEFAULT NULL::uuid,
  p_strategy text DEFAULT 'auto'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_affaire_id uuid;
  v_n2 int := 0;
  v_n2_fab int := 0;
  v_n3 int := 0;
  v_phase_updates int := 0;
  v_strategy text := COALESCE(p_strategy, 'auto');
BEGIN
  IF v_strategy NOT IN ('auto','merge','manual') THEN
    RAISE EXCEPTION 'sync_equipes_from_plan: strategy invalide %', v_strategy;
  END IF;

  SELECT affaire_id INTO v_affaire_id FROM staffing_plan WHERE id = p_plan_id;

  IF v_affaire_id IS NULL THEN
    RETURN jsonb_build_object('n2_upserts', 0, 'n3_upserts', 0, 'phase_updates', 0, 'strategy', v_strategy);
  END IF;

  IF v_strategy <> 'manual' THEN
    WITH ups AS (
      INSERT INTO affaire_equipe (affaire_id, employe_id, phase, added_by, removed_at, removed_by)
      SELECT DISTINCT
        v_affaire_id, a.employe_id,
        CASE WHEN s.phase IN ('commercial_etude','fabrication','montage','demontage') THEN s.phase ELSE 'fabrication' END,
        p_user_id, NULL::timestamptz, NULL::uuid
      FROM staffing_plan_assignment a
      JOIN staffing_plan_step s ON s.id = a.step_id
      WHERE s.plan_id = p_plan_id
      ON CONFLICT (affaire_id, employe_id, phase) DO UPDATE
        SET removed_at = CASE WHEN v_strategy = 'merge' THEN affaire_equipe.removed_at ELSE NULL END,
            removed_by = CASE WHEN v_strategy = 'merge' THEN affaire_equipe.removed_by ELSE NULL END,
            updated_at = now()
      RETURNING 1
    )
    SELECT count(*) INTO v_n2 FROM ups;

    WITH ups AS (
      INSERT INTO affaire_equipe (affaire_id, employe_id, phase, added_by, removed_at, removed_by)
      SELECT DISTINCT
        v_affaire_id, a.employe_id, 'fabrication', p_user_id, NULL::timestamptz, NULL::uuid
      FROM staffing_plan_assignment a
      JOIN staffing_plan_step s ON s.id = a.step_id
      WHERE s.plan_id = p_plan_id AND s.objet_id IS NOT NULL
      ON CONFLICT (affaire_id, employe_id, phase) DO UPDATE
        SET removed_at = CASE WHEN v_strategy = 'merge' THEN affaire_equipe.removed_at ELSE NULL END,
            removed_by = CASE WHEN v_strategy = 'merge' THEN affaire_equipe.removed_by ELSE NULL END,
            updated_at = now()
      RETURNING 1
    )
    SELECT count(*) INTO v_n2_fab FROM ups;

    WITH ups AS (
      INSERT INTO fabrication_objet_equipe (objet_id, employe_id, added_by, removed_at, removed_by)
      SELECT DISTINCT s.objet_id, a.employe_id, p_user_id, NULL::timestamptz, NULL::uuid
      FROM staffing_plan_assignment a
      JOIN staffing_plan_step s ON s.id = a.step_id
      WHERE s.plan_id = p_plan_id AND s.objet_id IS NOT NULL
      ON CONFLICT (objet_id, employe_id) DO UPDATE
        SET removed_at = CASE WHEN v_strategy = 'merge' THEN fabrication_objet_equipe.removed_at ELSE NULL END,
            removed_by = CASE WHEN v_strategy = 'merge' THEN fabrication_objet_equipe.removed_by ELSE NULL END,
            updated_at = now()
      RETURNING 1
    )
    SELECT count(*) INTO v_n3 FROM ups;
  END IF;

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
    'phase_updates', v_phase_updates,
    'strategy', v_strategy
  );
END;
$function$;

-- 3) detect_equipe_overrides
CREATE OR REPLACE FUNCTION public.detect_equipe_overrides(p_plan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_affaire_id uuid;
  v_n2_removed int := 0;
  v_n2_added int := 0;
  v_n3_removed int := 0;
  v_n3_added int := 0;
  v_total_slots int := 0;
BEGIN
  SELECT affaire_id INTO v_affaire_id FROM staffing_plan WHERE id = p_plan_id;
  IF v_affaire_id IS NULL THEN
    RETURN jsonb_build_object('overrides', 0, 'total_slots', 0, 'ratio', 0);
  END IF;

  WITH plan_n2 AS (
    SELECT DISTINCT
      a.employe_id,
      CASE WHEN s.phase IN ('commercial_etude','fabrication','montage','demontage') THEN s.phase ELSE 'fabrication' END AS phase
    FROM staffing_plan_assignment a
    JOIN staffing_plan_step s ON s.id = a.step_id
    WHERE s.plan_id = p_plan_id
  ),
  current_n2 AS (
    SELECT employe_id, phase, removed_at FROM affaire_equipe WHERE affaire_id = v_affaire_id
  )
  SELECT
    (SELECT count(*) FROM plan_n2 p
     JOIN current_n2 c ON c.employe_id = p.employe_id AND c.phase = p.phase
     WHERE c.removed_at IS NOT NULL),
    (SELECT count(*) FROM current_n2 c
     WHERE c.removed_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM plan_n2 p WHERE p.employe_id = c.employe_id AND p.phase = c.phase))
  INTO v_n2_removed, v_n2_added;

  WITH plan_n3 AS (
    SELECT DISTINCT s.objet_id, a.employe_id
    FROM staffing_plan_assignment a
    JOIN staffing_plan_step s ON s.id = a.step_id
    WHERE s.plan_id = p_plan_id AND s.objet_id IS NOT NULL
  ),
  current_n3 AS (
    SELECT foe.objet_id, foe.employe_id, foe.removed_at
    FROM fabrication_objet_equipe foe
    JOIN fabrication_objets fo ON fo.id = foe.objet_id
    WHERE fo.affaire_id = v_affaire_id
  )
  SELECT
    (SELECT count(*) FROM plan_n3 p
     JOIN current_n3 c ON c.objet_id = p.objet_id AND c.employe_id = p.employe_id
     WHERE c.removed_at IS NOT NULL),
    (SELECT count(*) FROM current_n3 c
     WHERE c.removed_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM plan_n3 p WHERE p.objet_id = c.objet_id AND p.employe_id = c.employe_id))
  INTO v_n3_removed, v_n3_added;

  SELECT
    (SELECT count(*) FROM (
      SELECT DISTINCT a.employe_id,
        CASE WHEN s.phase IN ('commercial_etude','fabrication','montage','demontage') THEN s.phase ELSE 'fabrication' END
      FROM staffing_plan_assignment a JOIN staffing_plan_step s ON s.id = a.step_id
      WHERE s.plan_id = p_plan_id
    ) t)
    +
    (SELECT count(*) FROM (
      SELECT DISTINCT s.objet_id, a.employe_id
      FROM staffing_plan_assignment a JOIN staffing_plan_step s ON s.id = a.step_id
      WHERE s.plan_id = p_plan_id AND s.objet_id IS NOT NULL
    ) t)
  INTO v_total_slots;

  RETURN jsonb_build_object(
    'overrides', v_n2_removed + v_n2_added + v_n3_removed + v_n3_added,
    'n2_removed', v_n2_removed,
    'n2_added', v_n2_added,
    'n3_removed', v_n3_removed,
    'n3_added', v_n3_added,
    'total_slots', v_total_slots,
    'ratio', CASE WHEN v_total_slots = 0 THEN 0
                  ELSE round( ((v_n2_removed + v_n2_added + v_n3_removed + v_n3_added)::numeric / v_total_slots) * 100, 2)
             END
  );
END;
$function$;