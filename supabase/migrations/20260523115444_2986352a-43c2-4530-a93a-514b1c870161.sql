-- Table de journal
CREATE TABLE IF NOT EXISTS public.staffing_divergence_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  code text NOT NULL CHECK (code IN (
    'MISSING_ASSIGNATION','ORPHAN_ASSIGNATION','PRESENCE_MISMATCH','OBJET_LINK_MISSING'
  )),
  severity text NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','error')),
  affaire_id uuid,
  plan_id uuid,
  step_id uuid,
  assignation_id uuid,
  employe_id uuid,
  date date,
  metier_id integer,
  objet_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  resolved_at timestamptz,
  notes text
);

CREATE INDEX IF NOT EXISTS idx_sdl_run ON public.staffing_divergence_log(run_id);
CREATE INDEX IF NOT EXISTS idx_sdl_detected ON public.staffing_divergence_log(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_sdl_affaire ON public.staffing_divergence_log(affaire_id);
CREATE INDEX IF NOT EXISTS idx_sdl_unresolved ON public.staffing_divergence_log(detected_at DESC) WHERE resolved_at IS NULL;

ALTER TABLE public.staffing_divergence_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sdl_select_chef_admin ON public.staffing_divergence_log;
CREATE POLICY sdl_select_chef_admin ON public.staffing_divergence_log
  FOR SELECT TO authenticated USING (is_chef_or_admin());

DROP POLICY IF EXISTS sdl_update_admin ON public.staffing_divergence_log;
CREATE POLICY sdl_update_admin ON public.staffing_divergence_log
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE OR REPLACE FUNCTION public.audit_staffing_divergence()
RETURNS TABLE(run_id uuid, total_findings integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_run_id uuid := gen_random_uuid();
  v_count integer := 0;
  v_added integer;
BEGIN
  WITH ins AS (
    INSERT INTO public.staffing_divergence_log
      (run_id, code, severity, affaire_id, plan_id, step_id, employe_id, date, metier_id, objet_id, details)
    SELECT v_run_id, 'MISSING_ASSIGNATION', 'error',
      p.affaire_id, p.id, st.id, spa.employe_id, spa.date, st.metier_id, st.objet_id,
      jsonb_build_object('presence_pct', spa.presence_pct, 'h_par_jour', st.h_par_jour)
    FROM public.staffing_plan_assignment spa
    JOIN public.staffing_plan_step st ON st.id = spa.step_id
    JOIN public.staffing_plan p ON p.id = st.plan_id
    WHERE p.status = 'published'
      AND NOT EXISTS (SELECT 1 FROM public.assignations a
        WHERE a.affaire_id = p.affaire_id AND a.employe_id = spa.employe_id AND a.date = spa.date)
    RETURNING 1
  ) SELECT COUNT(*)::int INTO v_added FROM ins;
  v_count := v_count + v_added;

  WITH ins AS (
    INSERT INTO public.staffing_divergence_log
      (run_id, code, severity, affaire_id, plan_id, assignation_id, employe_id, date, metier_id, details)
    SELECT v_run_id, 'ORPHAN_ASSIGNATION', 'warning',
      a.affaire_id, a.staffing_plan_id, a.id, a.employe_id, a.date, a.metier_id,
      jsonb_build_object('heures', a.heures, 'demi_journee', a.demi_journee)
    FROM public.assignations a
    JOIN public.staffing_plan p ON p.id = a.staffing_plan_id
    WHERE p.status = 'published'
      AND NOT EXISTS (SELECT 1
        FROM public.staffing_plan_assignment spa
        JOIN public.staffing_plan_step st ON st.id = spa.step_id
        WHERE st.plan_id = p.id AND spa.employe_id = a.employe_id AND spa.date = a.date)
    RETURNING 1
  ) SELECT COUNT(*)::int INTO v_added FROM ins;
  v_count := v_count + v_added;

  WITH spa_agg AS (
    SELECT p.affaire_id, p.id AS plan_id, spa.employe_id, spa.date,
           SUM(spa.presence_pct * st.h_par_jour / 100.0) AS h_attendues
    FROM public.staffing_plan_assignment spa
    JOIN public.staffing_plan_step st ON st.id = spa.step_id
    JOIN public.staffing_plan p ON p.id = st.plan_id
    WHERE p.status = 'published'
    GROUP BY p.affaire_id, p.id, spa.employe_id, spa.date
  ),
  ass_agg AS (
    SELECT a.affaire_id, a.employe_id, a.date, SUM(a.heures) AS h_planifiees
    FROM public.assignations a GROUP BY a.affaire_id, a.employe_id, a.date
  ),
  ins AS (
    INSERT INTO public.staffing_divergence_log
      (run_id, code, severity, affaire_id, plan_id, employe_id, date, details)
    SELECT v_run_id, 'PRESENCE_MISMATCH', 'warning',
      s.affaire_id, s.plan_id, s.employe_id, s.date,
      jsonb_build_object('h_attendues', ROUND(s.h_attendues,2), 'h_planifiees', ROUND(COALESCE(aa.h_planifiees,0),2))
    FROM spa_agg s
    LEFT JOIN ass_agg aa ON aa.affaire_id = s.affaire_id AND aa.employe_id = s.employe_id AND aa.date = s.date
    WHERE ABS(s.h_attendues - COALESCE(aa.h_planifiees, 0)) > 0.5
    RETURNING 1
  ) SELECT COUNT(*)::int INTO v_added FROM ins;
  v_count := v_count + v_added;

  WITH ins AS (
    INSERT INTO public.staffing_divergence_log
      (run_id, code, severity, affaire_id, plan_id, step_id, assignation_id, employe_id, date, metier_id, objet_id, details)
    SELECT DISTINCT v_run_id, 'OBJET_LINK_MISSING', 'info',
      p.affaire_id, p.id, st.id, a.id, a.employe_id, a.date, st.metier_id, st.objet_id,
      jsonb_build_object('reason','step.objet_id non répercuté sur assignation_objets')
    FROM public.staffing_plan_assignment spa
    JOIN public.staffing_plan_step st ON st.id = spa.step_id
    JOIN public.staffing_plan p ON p.id = st.plan_id
    JOIN public.assignations a ON a.affaire_id = p.affaire_id AND a.employe_id = spa.employe_id AND a.date = spa.date
    WHERE p.status = 'published' AND st.objet_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.assignation_objets ao
        WHERE ao.assignation_id = a.id AND ao.objet_id = st.objet_id)
    RETURNING 1
  ) SELECT COUNT(*)::int INTO v_added FROM ins;
  v_count := v_count + v_added;

  RETURN QUERY SELECT v_run_id, v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.run_staffing_divergence_audit()
RETURNS TABLE(run_id uuid, total_findings integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Accès refusé : admin requis';
  END IF;
  RETURN QUERY SELECT * FROM public.audit_staffing_divergence();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.audit_staffing_divergence() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_staffing_divergence_audit() TO authenticated;

-- Backfill assignation_objets pour plans publiés
INSERT INTO public.assignation_objets (assignation_id, objet_id, created_by)
SELECT DISTINCT a.id, st.objet_id, NULL::uuid
FROM public.staffing_plan_assignment spa
JOIN public.staffing_plan_step st ON st.id = spa.step_id
JOIN public.staffing_plan p ON p.id = st.plan_id
JOIN public.assignations a
  ON a.affaire_id = p.affaire_id AND a.employe_id = spa.employe_id AND a.date = spa.date
WHERE p.status = 'published' AND st.objet_id IS NOT NULL
ON CONFLICT (assignation_id, objet_id) DO NOTHING;

-- pg_cron daily 3am UTC
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'staffing-divergence-audit') THEN
      PERFORM cron.unschedule('staffing-divergence-audit');
    END IF;
    PERFORM cron.schedule('staffing-divergence-audit','0 3 * * *',
      $cron$SELECT public.audit_staffing_divergence();$cron$);
  END IF;
END;
$$;