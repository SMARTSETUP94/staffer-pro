-- Finding #7 : index pour les requêtes (employe_id, date BETWEEN) — saisie /mes-heures
CREATE INDEX IF NOT EXISTS idx_hs_employe_date
  ON public.heures_saisies (employe_id, date);

-- Finding #7 : index pour les requêtes (statut, date BETWEEN) — validation chef + export
CREATE INDEX IF NOT EXISTS idx_hs_statut_date
  ON public.heures_saisies (statut, date);

-- Finding #12 : index pour les jointures historique → saisie, ordonnées par date
CREATE INDEX IF NOT EXISTS idx_hsh_heure_saisie
  ON public.heures_saisies_historique (heure_saisie_id, created_at DESC);