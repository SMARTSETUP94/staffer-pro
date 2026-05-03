ALTER TABLE public.staffing_plan
  ADD COLUMN IF NOT EXISTS include_weekends boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.staffing_plan.include_weekends IS
  'v0.35.12 — Si true, l''algo de staffing peut planifier sur samedi/dimanche (jours fériés FR restent exclus).';