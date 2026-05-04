-- v0.39.0d — Override manuel du span (en demi-journées) à pers constant
-- Permet au chef de chantier d'étendre/réduire la durée d'une étape via ±demi-jour
-- sans toucher au nombre de personnes. Persisté côté serveur comme manual_shift/manual_pers.

ALTER TABLE public.staffing_plan_step
  ADD COLUMN IF NOT EXISTS manual_span_demi INTEGER;

ALTER TABLE public.staffing_plan_step
  DROP CONSTRAINT IF EXISTS sps_manual_span_demi_chk;

ALTER TABLE public.staffing_plan_step
  ADD CONSTRAINT sps_manual_span_demi_chk
  CHECK (manual_span_demi IS NULL OR (manual_span_demi >= 1 AND manual_span_demi <= 200));

COMMENT ON COLUMN public.staffing_plan_step.manual_span_demi IS
  'Override manuel de la durée en demi-journées (NULL = auto). À pers constant : modifie span_demi_jours sticky.';