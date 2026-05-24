-- Lot 8.2c (rattrapage) — DDL fabrication_objets dimensions + matériaux + finition
-- Hotfix audit 23 mai P0#2 : ces colonnes ont été créées via Studio UI sans migration.
-- Idempotent : columns / index IF NOT EXISTS.

ALTER TABLE public.fabrication_objets
  ADD COLUMN IF NOT EXISTS largeur_mm  integer,
  ADD COLUMN IF NOT EXISTS longueur_mm integer,
  ADD COLUMN IF NOT EXISTS hauteur_mm  integer,
  ADD COLUMN IF NOT EXISTS materiaux        text,
  ADD COLUMN IF NOT EXISTS finition_detail  text;

-- CHECKs ajoutés idempotemment
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fabrication_objets_largeur_mm_positive') THEN
    ALTER TABLE public.fabrication_objets
      ADD CONSTRAINT fabrication_objets_largeur_mm_positive CHECK (largeur_mm IS NULL OR largeur_mm > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fabrication_objets_longueur_mm_positive') THEN
    ALTER TABLE public.fabrication_objets
      ADD CONSTRAINT fabrication_objets_longueur_mm_positive CHECK (longueur_mm IS NULL OR longueur_mm > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fabrication_objets_hauteur_mm_positive') THEN
    ALTER TABLE public.fabrication_objets
      ADD CONSTRAINT fabrication_objets_hauteur_mm_positive CHECK (hauteur_mm IS NULL OR hauteur_mm > 0);
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_fabrication_objets_materiaux_trgm
  ON public.fabrication_objets USING gin (materiaux gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_fabrication_objets_finition_trgm
  ON public.fabrication_objets USING gin (finition_detail gin_trgm_ops);

-- Hotfix audit 23 mai P1.1 : décaler le cron audit divergence à 04h UTC
-- pour éviter la contention avec refresh-objet-heures-consolidees (03h UTC).
DO $$
DECLARE
  jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'staffing-divergence-audit';
  IF jid IS NOT NULL THEN
    PERFORM cron.alter_job(job_id => jid, schedule => '0 4 * * *');
  END IF;
END$$;