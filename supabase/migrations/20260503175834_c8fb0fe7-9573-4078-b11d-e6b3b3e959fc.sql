-- v0.38.0 — Granularité demi-journée auto-staffing
-- Ajoute start_half_day (AM/PM) et span_demi_jours sur staffing_plan_step.
-- COEXISTENCE : span_days reste pour rollback. Backfill span_demi_jours = span_days * 2.

ALTER TABLE public.staffing_plan_step
  ADD COLUMN IF NOT EXISTS start_half_day TEXT NOT NULL DEFAULT 'AM',
  ADD COLUMN IF NOT EXISTS span_demi_jours INTEGER;

-- Backfill : 1 jour plein = 2 demi-journées
UPDATE public.staffing_plan_step
SET span_demi_jours = COALESCE(span_demi_jours, span_days * 2)
WHERE span_demi_jours IS NULL;

-- Contrainte format AM/PM
ALTER TABLE public.staffing_plan_step
  DROP CONSTRAINT IF EXISTS sps_start_half_day_chk;
ALTER TABLE public.staffing_plan_step
  ADD CONSTRAINT sps_start_half_day_chk
  CHECK (start_half_day IN ('AM','PM'));

-- span_demi_jours > 0
ALTER TABLE public.staffing_plan_step
  DROP CONSTRAINT IF EXISTS sps_span_demi_jours_chk;
ALTER TABLE public.staffing_plan_step
  ADD CONSTRAINT sps_span_demi_jours_chk
  CHECK (span_demi_jours IS NULL OR span_demi_jours >= 1);
