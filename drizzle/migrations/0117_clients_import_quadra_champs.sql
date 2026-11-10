ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS raison_sociale text,
  ADD COLUMN IF NOT EXISTS comptes_auxiliaires text[],
  ADD COLUMN IF NOT EXISTS plateforme_facturation text,
  ADD COLUMN IF NOT EXISTS import_compta_remarques text,
  ADD COLUMN IF NOT EXISTS import_lot text;
COMMENT ON COLUMN public.clients.comptes_auxiliaires IS 'Codes auxiliaires Quadra (0A/0V/0D…), distincts du futur 411 Pennylane';
COMMENT ON COLUMN public.clients.import_lot IS 'Traçabilité du lot d''import ayant créé ou complété la fiche';
CREATE INDEX IF NOT EXISTS clients_comptes_aux_gin ON public.clients USING gin (comptes_auxiliaires);