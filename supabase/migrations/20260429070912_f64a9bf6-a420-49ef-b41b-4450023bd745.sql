-- Function: compute_affaire_typologie
-- Mappe le numéro d'affaire vers une typologie selon les règles métier Setup Paris
CREATE OR REPLACE FUNCTION public.compute_affaire_typologie(num text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  trimmed text;
  first_char text;
BEGIN
  IF num IS NULL THEN
    RETURN NULL;
  END IF;

  trimmed := trim(num);
  IF length(trimmed) = 0 THEN
    RETURN NULL;
  END IF;

  first_char := substring(trimmed FROM 1 FOR 1);

  -- Codes 5 chiffres commençant par 2 -> stockage (ex: 2XXXX)
  IF length(trimmed) = 5 AND first_char = '2' THEN
    RETURN 'stockage';
  END IF;

  -- Codes 4 chiffres : routing par premier chiffre
  IF length(trimmed) = 4 THEN
    CASE first_char
      WHEN '1' THEN RETURN 'non_operationnel';
      WHEN '3' THEN RETURN 'non_operationnel';
      WHEN '4' THEN RETURN 'montage_demontage';
      WHEN '5' THEN RETURN 'fabrication';
      WHEN '9' THEN RETURN 'prototype';
      ELSE RETURN NULL;
    END CASE;
  END IF;

  RETURN NULL;
END;
$$;

-- Colonne générée STORED
ALTER TABLE public.affaires
  ADD COLUMN typologie text GENERATED ALWAYS AS (public.compute_affaire_typologie(numero)) STORED;

-- Index pour filtrage rapide
CREATE INDEX idx_affaires_typologie ON public.affaires(typologie);