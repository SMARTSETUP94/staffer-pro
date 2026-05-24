-- Lot 8.2c — Fiche objet : dimensions + matériaux + finition détaillée
ALTER TABLE public.fabrication_objets
  ADD COLUMN IF NOT EXISTS largeur_mm      integer,
  ADD COLUMN IF NOT EXISTS longueur_mm     integer,
  ADD COLUMN IF NOT EXISTS hauteur_mm      integer,
  ADD COLUMN IF NOT EXISTS materiaux       text,
  ADD COLUMN IF NOT EXISTS finition_detail text;

-- Contrainte : dimensions strictement positives si renseignées
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fab_obj_dims_positives'
  ) THEN
    ALTER TABLE public.fabrication_objets
      ADD CONSTRAINT fab_obj_dims_positives CHECK (
        (largeur_mm  IS NULL OR largeur_mm  > 0) AND
        (longueur_mm IS NULL OR longueur_mm > 0) AND
        (hauteur_mm  IS NULL OR hauteur_mm  > 0)
      );
  END IF;
END $$;

-- Index trigram pour recherche fuzzy (sprint analytique à venir)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_fab_obj_materiaux_trgm
  ON public.fabrication_objets USING gin (materiaux gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_fab_obj_finition_detail_trgm
  ON public.fabrication_objets USING gin (finition_detail gin_trgm_ops);