-- v0.29.2 — Chantier 1 : Typologie future opportunités + suggestion intelligente

-- 1) Colonne typologie_future sur opportunités (affaires phase=opportunite)
ALTER TABLE public.affaires
  ADD COLUMN IF NOT EXISTS typologie_future text;

-- Trigger de validation (jamais CHECK car règle métier évolutive)
CREATE OR REPLACE FUNCTION public.validate_typologie_future()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.typologie_future IS NOT NULL
     AND NEW.typologie_future NOT IN ('prototype','non_operationnel','montage_demontage','fabrication','stockage') THEN
    RAISE EXCEPTION 'typologie_future invalide : %', NEW.typologie_future
      USING HINT = 'Valeurs acceptées : prototype, non_operationnel, montage_demontage, fabrication, stockage';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_typologie_future ON public.affaires;
CREATE TRIGGER trg_validate_typologie_future
  BEFORE INSERT OR UPDATE OF typologie_future ON public.affaires
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_typologie_future();

COMMENT ON COLUMN public.affaires.typologie_future IS
  'v0.29.2 — Typologie cible déclarée par le CA quand l''opportunité est encore 9XXX, '
  'utilisée pour suggérer le préfixe du code 5XXX/4XXX/etc. à la signature. '
  'Valeurs : prototype | non_operationnel | montage_demontage | fabrication | stockage.';

-- 2) Helper SQL : get_last_used_codes(prefix int, n int)
--    Retourne les N derniers codes affaires utilisés pour un préfixe donné,
--    avec le client associé et la date de signature, triés du plus récent.
CREATE OR REPLACE FUNCTION public.get_last_used_codes(_prefix int, _n int DEFAULT 5)
RETURNS TABLE(code text, client text, signed_at timestamptz, nom text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.numero AS code,
         a.client,
         a.signed_at,
         a.nom
  FROM public.affaires a
  WHERE a.numero LIKE (_prefix::text || '%')
    AND (
      -- préfixe 2 → 5 chiffres (stockage), autres → 4 chiffres
      (_prefix = 2 AND length(a.numero) = 5)
      OR (_prefix <> 2 AND length(a.numero) = 4)
    )
    AND a.phase = 'signe'
  ORDER BY a.signed_at DESC NULLS LAST, a.created_at DESC
  LIMIT GREATEST(1, LEAST(_n, 50));
$$;

REVOKE EXECUTE ON FUNCTION public.get_last_used_codes(int, int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_last_used_codes(int, int) TO authenticated;

COMMENT ON FUNCTION public.get_last_used_codes(int, int) IS
  'v0.29.2 — Renvoie les N derniers codes affaires signés pour un préfixe (ex 5,4,1,3,2). '
  'Utilisé par la modale Signer pour proposer des codes récents cliquables.';
