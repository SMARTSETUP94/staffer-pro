CREATE INDEX IF NOT EXISTS idx_trajets_date
  ON public.trajets (date);

CREATE INDEX IF NOT EXISTS idx_trajets_vehicule_date
  ON public.trajets (vehicule_id, date);