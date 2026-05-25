-- Sécurité : vue en SECURITY INVOKER (RLS du caller) + search_path figé sur la fn.
ALTER VIEW public.v_affaire_equipe_capacite SET (security_invoker = on);

CREATE OR REPLACE FUNCTION public.jours_ouvres_entre(_d1 date, _d2 date)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _d1 IS NULL OR _d2 IS NULL OR _d2 < _d1 THEN 0
    ELSE (
      SELECT COUNT(*)::int
      FROM generate_series(_d1, _d2, interval '1 day') AS g(d)
      WHERE EXTRACT(ISODOW FROM g.d) < 6
    )
  END;
$$;