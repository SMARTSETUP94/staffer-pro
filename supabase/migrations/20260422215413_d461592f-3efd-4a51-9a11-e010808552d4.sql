-- v0.19 — Refonte page Demandes transport
-- Ajout des colonnes nécessaires pour le tableau de suivi détaillé.

-- 1. Colonne prestataire : nom du sous-traitant transport (libre)
ALTER TABLE public.trajets
  ADD COLUMN IF NOT EXISTS prestataire text;

-- 2. Colonne aller_retour : flag explicite (au lieu de déduire via parent_trajet_id qui n'existe pas toujours)
ALTER TABLE public.trajets
  ADD COLUMN IF NOT EXISTS aller_retour boolean NOT NULL DEFAULT false;

-- 3. Colonne reference : code lisible auto-généré (ex TR-2026-0001)
ALTER TABLE public.trajets
  ADD COLUMN IF NOT EXISTS reference text;

-- Séquence pour la référence
CREATE SEQUENCE IF NOT EXISTS public.trajet_reference_seq START 1;

-- Trigger : auto-fill reference si NULL à l'insertion
CREATE OR REPLACE FUNCTION public.set_trajet_reference()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.reference IS NULL OR length(trim(NEW.reference)) = 0 THEN
    NEW.reference := 'TR-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.trajet_reference_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_trajet_reference ON public.trajets;
CREATE TRIGGER trg_set_trajet_reference
  BEFORE INSERT ON public.trajets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_trajet_reference();

-- Backfill pour les trajets existants (un seul UPDATE atomique, ordre par created_at pour stabilité)
WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn,
         to_char(created_at, 'YYYY') AS year_str
  FROM public.trajets
  WHERE reference IS NULL
)
UPDATE public.trajets t
   SET reference = 'TR-' || n.year_str || '-' || lpad((nextval('public.trajet_reference_seq'))::text, 5, '0')
  FROM numbered n
 WHERE t.id = n.id;

-- Contrainte unique sur reference (après backfill)
ALTER TABLE public.trajets
  DROP CONSTRAINT IF EXISTS trajets_reference_unique;
ALTER TABLE public.trajets
  ADD CONSTRAINT trajets_reference_unique UNIQUE (reference);

-- Index pour filtrage prestataire
CREATE INDEX IF NOT EXISTS idx_trajets_prestataire ON public.trajets (prestataire) WHERE prestataire IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trajets_statut_soustraitance ON public.trajets (statut_soustraitance);

COMMENT ON COLUMN public.trajets.prestataire IS 'v0.19 — Nom du sous-traitant transport (libre).';
COMMENT ON COLUMN public.trajets.aller_retour IS 'v0.19 — Trajet aller-retour explicite (true) ou aller simple (false).';
COMMENT ON COLUMN public.trajets.reference IS 'v0.19 — Référence lisible auto-générée TR-YYYY-NNNNN.';
