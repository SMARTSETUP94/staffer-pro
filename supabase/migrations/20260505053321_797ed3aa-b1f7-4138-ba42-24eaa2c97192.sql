ALTER TABLE public.staffing_plan
  ADD COLUMN IF NOT EXISTS is_manut_absorbed boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.staffing_plan.is_manut_absorbed IS
  'v0.40 — Si true, les heures Manut DEBUT (35%) + TRANSFERT (15%) de chaque objet sont absorbées par Bois/Peint/Tap au prorata. Manut FIN (50%) reste agrégée chantier. Si false, comportement v0.37 legacy (3 phases Manut par objet).';