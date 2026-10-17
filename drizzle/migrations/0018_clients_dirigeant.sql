ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS dirigeant text;
COMMENT ON COLUMN public.clients.dirigeant IS 'Nom du dirigeant confirmé par le client ou une source juridique publique.';