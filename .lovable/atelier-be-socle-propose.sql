-- PROPOSITION UNIQUEMENT — non appliquée.
-- Aucun changement des tables/colonnes existantes ni de leurs droits.
ALTER TABLE public.affaire_planning_metier
  ADD COLUMN IF NOT EXISTS heures_prevues numeric
  CHECK (heures_prevues IS NULL OR heures_prevues >= 0);

ALTER TABLE public.affaires
  ADD COLUMN IF NOT EXISTS atelier_date_debut date,
  ADD COLUMN IF NOT EXISTS atelier_date_fin date,
  ADD COLUMN IF NOT EXISTS atelier_heures_prevues numeric
  CHECK (atelier_heures_prevues IS NULL OR atelier_heures_prevues >= 0);

ALTER TABLE public.role_referents
  ADD COLUMN IF NOT EXISTS capacite_be_pct numeric NOT NULL DEFAULT 100
  CHECK (capacite_be_pct >= 0 AND capacite_be_pct <= 100);

COMMENT ON COLUMN public.affaire_planning_metier.heures_prevues IS
  'Planning atelier simple : heures prévues par métier, sans staffing nominatif';
COMMENT ON COLUMN public.affaires.atelier_date_debut IS
  'Planning atelier simple : début global validé manuellement';
COMMENT ON COLUMN public.affaires.atelier_date_fin IS
  'Planning atelier simple : fin globale validée manuellement';
COMMENT ON COLUMN public.affaires.atelier_heures_prevues IS
  'Planning atelier simple : estimation globale facultative en heures';
COMMENT ON COLUMN public.role_referents.capacite_be_pct IS
  'Capacité de planification BE en pourcentage, sans lien avec le contrat ni la rémunération';