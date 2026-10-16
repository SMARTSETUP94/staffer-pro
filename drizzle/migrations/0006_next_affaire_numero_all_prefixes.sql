CREATE OR REPLACE FUNCTION public.next_affaire_numero(_prefix integer)
 RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _min int; _max int; _next int;
BEGIN
  IF NOT public.is_chef_or_admin() THEN
    RAISE EXCEPTION 'Action réservée aux chefs et admins.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _prefix NOT IN (1, 3, 4, 5, 6, 9) THEN
    RAISE EXCEPTION 'Préfixe non supporté: %', _prefix;
  END IF;
  _min := _prefix * 1000; _max := _min + 999;
  SELECT COALESCE(MAX(numero::int), _min - 1) + 1 INTO _next
    FROM public.affaires WHERE numero ~ '^[0-9]{4}$' AND numero::int BETWEEN _min AND _max;
  IF _next > _max THEN RAISE EXCEPTION 'Plage % épuisée.', _prefix; END IF;
  RETURN _next::text;
END;
$function$;