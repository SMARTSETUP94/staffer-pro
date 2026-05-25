ALTER TABLE public.affaires
  ADD COLUMN IF NOT EXISTS date_evenement_debut date,
  ADD COLUMN IF NOT EXISTS date_evenement_fin date;

COMMENT ON COLUMN public.affaires.date_evenement_debut IS 'Sprint D Batch 3 — début de la phase événement (entre montage et démontage)';
COMMENT ON COLUMN public.affaires.date_evenement_fin IS 'Sprint D Batch 3 — fin de la phase événement (entre montage et démontage)';