ALTER TABLE public.emails_entrants ADD COLUMN IF NOT EXISTS internet_message_id text;
UPDATE public.emails_entrants SET internet_message_id = NULLIF(raw_payload->>'internetMessageId', '') WHERE internet_message_id IS NULL AND NULLIF(raw_payload->>'internetMessageId', '') IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS emails_entrants_internet_message_id_key ON public.emails_entrants (internet_message_id) WHERE internet_message_id IS NOT NULL;
COMMENT ON COLUMN public.emails_entrants.internet_message_id IS 'Stable RFC Message-ID from Outlook internetMessageId; deduplication survives mailbox moves.';
COMMENT ON COLUMN public.emails_entrants.archived_outlook IS 'Historical archive flag only: mailbox imports are read-only and must never write this field.';