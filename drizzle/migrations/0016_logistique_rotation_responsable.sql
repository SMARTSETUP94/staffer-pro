ALTER TYPE public.etape_logistique_type ADD VALUE IF NOT EXISTS 'rotation';
ALTER TABLE public.affaire_etapes_logistiques ADD COLUMN IF NOT EXISTS responsable text;
COMMENT ON COLUMN public.affaire_etapes_logistiques.responsable IS 'Nom du responsable de l''intervention (pas de liste nominative du personnel).';