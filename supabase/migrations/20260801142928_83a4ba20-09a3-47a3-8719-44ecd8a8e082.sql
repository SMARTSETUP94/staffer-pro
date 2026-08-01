ALTER TABLE public.affaires
  ADD COLUMN IF NOT EXISTS montage_nb_techniciens smallint,
  ADD COLUMN IF NOT EXISTS montage_travail_nuit boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS montage_nb_semi smallint,
  ADD COLUMN IF NOT EXISTS montage_nb_20m3 smallint,
  ADD COLUMN IF NOT EXISTS montage_nature_prestation text,
  ADD COLUMN IF NOT EXISTS montage_notes text;