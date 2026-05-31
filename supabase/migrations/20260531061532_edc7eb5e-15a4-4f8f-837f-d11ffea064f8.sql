
ALTER TABLE public.emails_entrants
  ADD COLUMN IF NOT EXISTS body_full text,
  ADD COLUMN IF NOT EXISTS body_content_type text;
