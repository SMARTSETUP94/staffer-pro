ALTER TABLE public.fabrication_objets
  ADD COLUMN IF NOT EXISTS plan_url text,
  ADD COLUMN IF NOT EXISTS plan_publie_le timestamptz,
  ADD COLUMN IF NOT EXISTS plan_publie_par uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TYPE public.objet_journal_event_type ADD VALUE IF NOT EXISTS 'plan_publie';