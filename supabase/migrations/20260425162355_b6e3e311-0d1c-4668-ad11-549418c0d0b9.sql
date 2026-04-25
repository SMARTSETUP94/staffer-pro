ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS est_bureau_etude boolean NOT NULL DEFAULT false;