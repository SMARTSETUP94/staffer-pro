-- 1. Unicité (employe_id, assignation_id) — empêche les doublons d'autofill / double-clic
-- Index partiel pour ne s'appliquer qu'aux saisies rattachées à une assignation
CREATE UNIQUE INDEX IF NOT EXISTS uq_heures_saisies_employe_assignation
  ON public.heures_saisies (employe_id, assignation_id)
  WHERE assignation_id IS NOT NULL;

-- 2. Garde-fou : heures_reelles >= 0
ALTER TABLE public.heures_saisies
  ADD CONSTRAINT chk_heures_saisies_heures_positives
  CHECK (heures_reelles IS NULL OR heures_reelles >= 0)
  NOT VALID;

-- Valide la contrainte sur l'existant (déjà vérifié : 0 lignes négatives)
ALTER TABLE public.heures_saisies
  VALIDATE CONSTRAINT chk_heures_saisies_heures_positives;