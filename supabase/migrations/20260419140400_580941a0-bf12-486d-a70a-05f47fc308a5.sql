ALTER TABLE public.affaires
  ADD COLUMN IF NOT EXISTS date_montage DATE NULL,
  ADD COLUMN IF NOT EXISTS date_demontage DATE NULL;

COMMENT ON COLUMN public.affaires.date_montage IS 'Date de montage saisie manuellement par le chef de chantier lors de la validation du devis';
COMMENT ON COLUMN public.affaires.date_demontage IS 'Date de démontage (optionnelle) saisie manuellement par le chef de chantier';