
-- ============================================================
-- v0.35.0 — Auto-staffing Fabrication : schéma DB
-- ============================================================

-- 0. Extension colonnes employes
ALTER TABLE public.employes
  ADD COLUMN IF NOT EXISTS metiers_secondaires integer[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS competences_polyvalentes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS niveau_seniorite integer NOT NULL DEFAULT 3
    CHECK (niveau_seniorite BETWEEN 1 AND 5);

-- 1. staffing_plan
CREATE TABLE IF NOT EXISTS public.staffing_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affaire_id uuid NOT NULL REFERENCES public.affaires(id) ON DELETE CASCADE,
  date_debut_fab date NOT NULL,
  date_fin_fab date NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','published','outdated','archived')),
  parent_plan_id uuid REFERENCES public.staffing_plan(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id),
  published_by uuid REFERENCES auth.users(id),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 1 seul plan published par affaire
CREATE UNIQUE INDEX IF NOT EXISTS staffing_plan_unique_published_per_affaire
  ON public.staffing_plan(affaire_id) WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_staffing_plan_affaire ON public.staffing_plan(affaire_id);
CREATE INDEX IF NOT EXISTS idx_staffing_plan_dates ON public.staffing_plan(date_debut_fab, date_fin_fab);

-- 2. staffing_plan_object
CREATE TABLE IF NOT EXISTS public.staffing_plan_object (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.staffing_plan(id) ON DELETE CASCADE,
  objet_id uuid NOT NULL REFERENCES public.fabrication_objets(id) ON DELETE CASCADE,
  included boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, objet_id)
);
CREATE INDEX IF NOT EXISTS idx_staffing_plan_object_plan ON public.staffing_plan_object(plan_id);

-- 3. staffing_plan_step  (metier_id FK metiers, pas string)
CREATE TABLE IF NOT EXISTS public.staffing_plan_step (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.staffing_plan(id) ON DELETE CASCADE,
  objet_id uuid REFERENCES public.fabrication_objets(id) ON DELETE SET NULL,
  metier_id integer NOT NULL REFERENCES public.metiers(id),
  start_date date NOT NULL,
  span_days integer NOT NULL CHECK (span_days > 0),
  pers integer NOT NULL CHECK (pers > 0),
  h_par_jour integer NOT NULL DEFAULT 8 CHECK (h_par_jour BETWEEN 1 AND 12),
  manual_shift integer NOT NULL DEFAULT 0,
  manual_pers boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'auto' CHECK (source IN ('auto','manual','adjusted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staffing_plan_step_plan ON public.staffing_plan_step(plan_id);
CREATE INDEX IF NOT EXISTS idx_staffing_plan_step_window ON public.staffing_plan_step(start_date, span_days);
CREATE INDEX IF NOT EXISTS idx_staffing_plan_step_metier ON public.staffing_plan_step(metier_id);

-- 4. staffing_plan_assignment
CREATE TABLE IF NOT EXISTS public.staffing_plan_assignment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id uuid NOT NULL REFERENCES public.staffing_plan_step(id) ON DELETE CASCADE,
  employe_id uuid NOT NULL REFERENCES public.employes(id) ON DELETE CASCADE,
  date date NOT NULL,
  presence_pct integer NOT NULL DEFAULT 100 CHECK (presence_pct BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (step_id, employe_id, date)
);
CREATE INDEX IF NOT EXISTS idx_staffing_plan_assignment_emp_date ON public.staffing_plan_assignment(employe_id, date);
CREATE INDEX IF NOT EXISTS idx_staffing_plan_assignment_step ON public.staffing_plan_assignment(step_id);

-- 5. machine_reservation (anti-conflit HARD cross-chantiers)
CREATE TABLE IF NOT EXISTS public.machine_reservation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id text NOT NULL DEFAULT 'cnc_principale',
  date date NOT NULL,
  step_id uuid NOT NULL REFERENCES public.staffing_plan_step(id) ON DELETE CASCADE,
  affaire_id uuid NOT NULL REFERENCES public.affaires(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (machine_id, date)
);
CREATE INDEX IF NOT EXISTS idx_machine_reservation_step ON public.machine_reservation(step_id);
CREATE INDEX IF NOT EXISTS idx_machine_reservation_affaire ON public.machine_reservation(affaire_id);

-- 6. staffing_plan_snapshot
CREATE TABLE IF NOT EXISTS public.staffing_plan_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.staffing_plan(id) ON DELETE CASCADE,
  snapshot_data jsonb NOT NULL,
  reason text NOT NULL CHECK (reason IN ('initial_calc','manual_edit','publish','recalc')),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staffing_plan_snapshot_plan ON public.staffing_plan_snapshot(plan_id, created_at DESC);

-- ============================================================
-- Triggers updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_staffing_plan_updated ON public.staffing_plan;
CREATE TRIGGER trg_staffing_plan_updated BEFORE UPDATE ON public.staffing_plan
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_staffing_plan_step_updated ON public.staffing_plan_step;
CREATE TRIGGER trg_staffing_plan_step_updated BEFORE UPDATE ON public.staffing_plan_step
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.staffing_plan             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staffing_plan_object      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staffing_plan_step        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staffing_plan_assignment  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machine_reservation       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staffing_plan_snapshot    ENABLE ROW LEVEL SECURITY;

-- staffing_plan : SELECT filtre accès affaire, INSERT/UPDATE chef+admin, DELETE admin
CREATE POLICY staffing_plan_select ON public.staffing_plan FOR SELECT TO authenticated
  USING (is_chef_or_admin() OR user_has_affaire_access(affaire_id));
CREATE POLICY staffing_plan_insert ON public.staffing_plan FOR INSERT TO authenticated
  WITH CHECK (is_chef_or_admin());
CREATE POLICY staffing_plan_update ON public.staffing_plan FOR UPDATE TO authenticated
  USING (is_chef_or_admin()) WITH CHECK (is_chef_or_admin());
CREATE POLICY staffing_plan_delete ON public.staffing_plan FOR DELETE TO authenticated
  USING (is_admin());

-- staffing_plan_object : suit le plan
CREATE POLICY spo_select ON public.staffing_plan_object FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.staffing_plan p WHERE p.id = plan_id
    AND (is_chef_or_admin() OR user_has_affaire_access(p.affaire_id))));
CREATE POLICY spo_modify ON public.staffing_plan_object FOR ALL TO authenticated
  USING (is_chef_or_admin()) WITH CHECK (is_chef_or_admin());

-- staffing_plan_step
CREATE POLICY sps_select ON public.staffing_plan_step FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.staffing_plan p WHERE p.id = plan_id
    AND (is_chef_or_admin() OR user_has_affaire_access(p.affaire_id))));
CREATE POLICY sps_modify ON public.staffing_plan_step FOR ALL TO authenticated
  USING (is_chef_or_admin()) WITH CHECK (is_chef_or_admin());

-- staffing_plan_assignment : SELECT employé concerné OU chef/admin OU accès affaire
CREATE POLICY spa_select ON public.staffing_plan_assignment FOR SELECT TO authenticated
  USING (
    is_chef_or_admin()
    OR employe_id IN (SELECT id FROM public.employes WHERE profile_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.staffing_plan_step st
               JOIN public.staffing_plan p ON p.id = st.plan_id
               WHERE st.id = step_id AND user_has_affaire_access(p.affaire_id))
  );
CREATE POLICY spa_modify ON public.staffing_plan_assignment FOR ALL TO authenticated
  USING (is_chef_or_admin()) WITH CHECK (is_chef_or_admin());

-- machine_reservation : SELECT chef+admin (vue Charge atelier guard), modify chef+admin
CREATE POLICY mr_select ON public.machine_reservation FOR SELECT TO authenticated
  USING (is_chef_or_admin());
CREATE POLICY mr_modify ON public.machine_reservation FOR ALL TO authenticated
  USING (is_chef_or_admin()) WITH CHECK (is_chef_or_admin());

-- staffing_plan_snapshot : chef+admin
CREATE POLICY sps_snap_select ON public.staffing_plan_snapshot FOR SELECT TO authenticated
  USING (is_chef_or_admin());
CREATE POLICY sps_snap_insert ON public.staffing_plan_snapshot FOR INSERT TO authenticated
  WITH CHECK (is_chef_or_admin());
