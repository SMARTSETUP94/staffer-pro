ALTER TABLE public.mcp_write_external_keys ALTER COLUMN affaire_id DROP NOT NULL;

ALTER TABLE public.mcp_write_external_keys
  ADD CONSTRAINT mcp_write_external_keys_affaire_requise
  CHECK (affaire_id IS NOT NULL OR tool = 'traiter_demande');