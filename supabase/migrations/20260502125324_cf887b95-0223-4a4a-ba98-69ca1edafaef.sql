
-- v0.35.5 — Sprint 5 : publication plan staffing
-- 1. Colonne assignations.staffing_plan_id (lien vers plan source pour cleanup republish + badge)
ALTER TABLE public.assignations
  ADD COLUMN IF NOT EXISTS staffing_plan_id uuid NULL REFERENCES public.staffing_plan(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_assignations_staffing_plan ON public.assignations(staffing_plan_id) WHERE staffing_plan_id IS NOT NULL;

-- 2. Notification type 'staffing_publie'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'staffing_publie' AND enumtypid = 'notification_type'::regtype) THEN
    ALTER TYPE notification_type ADD VALUE 'staffing_publie';
  END IF;
END $$;

-- 3. staffing_plan_snapshot.reason — pas de contrainte stricte, mais on documente les valeurs autorisées
COMMENT ON COLUMN public.staffing_plan_snapshot.reason IS 'initial_calc | manual_edit | publish | restore';
