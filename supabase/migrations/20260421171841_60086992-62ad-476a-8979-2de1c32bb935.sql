ALTER TABLE public.vehicules
  ADD COLUMN IF NOT EXISTS date_debut_location date,
  ADD COLUMN IF NOT EXISTS date_fin_location date,
  ADD COLUMN IF NOT EXISTS prestataire_location text,
  ADD COLUMN IF NOT EXISTS reference_contrat text;

-- Index pour le filtrage planning par plage de dates (véhicules loués actifs sur période)
CREATE INDEX IF NOT EXISTS idx_vehicules_location_periode
  ON public.vehicules (date_debut_location, date_fin_location)
  WHERE proprietaire IN ('location', 'sous_traitance');

COMMENT ON COLUMN public.vehicules.date_debut_location IS
  'Date début de la location (véhicules loués/sous-traités). Hors plage = masqué du planning flotte.';
COMMENT ON COLUMN public.vehicules.date_fin_location IS
  'Date fin de la location (incluse). Hors plage = masqué du planning flotte.';
COMMENT ON COLUMN public.vehicules.prestataire_location IS
  'Nom du prestataire/loueur (ex. Europcar, Rentacar).';
COMMENT ON COLUMN public.vehicules.reference_contrat IS
  'Référence du contrat de location ou bon de commande.';