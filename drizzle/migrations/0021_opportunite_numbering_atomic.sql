CREATE OR REPLACE FUNCTION public.next_affaire_numero(_prefix integer)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _min int; _max int; _next int;
BEGIN
  IF NOT public.is_chef_or_admin() THEN
    RAISE EXCEPTION 'Action réservée aux chefs et admins.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _prefix NOT IN (1, 3, 4, 5, 6, 9) THEN RAISE EXCEPTION 'Préfixe non supporté: %', _prefix; END IF;
  _min := _prefix * 1000; _max := _min + 999;
  SELECT COALESCE(MAX(code::int), _min - 1) + 1 INTO _next
  FROM (
    SELECT numero AS code FROM public.affaires
    UNION ALL
    SELECT code_opportunite AS code FROM public.affaires WHERE _prefix = 9
  ) codes
  WHERE code ~ '^[0-9]{4}$' AND CASE WHEN code ~ '^[0-9]{4}$' THEN code::int BETWEEN _min AND _max ELSE false END;
  IF _next > _max THEN RAISE EXCEPTION 'Plage % épuisée.', _prefix; END IF;
  RETURN _next::text;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_opportunite(_client text, _nom text, _code text, _charge_affaires_id uuid, _taille public.opportunite_taille, _date_opportunite date, _commentaires text DEFAULT NULL::text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _id uuid; _allocated_code text;
BEGIN
  IF NOT public.is_chef_or_admin() THEN
    RAISE EXCEPTION 'Action réservée aux chefs et admins.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _code IS NULL OR _code !~ '^9[0-9]{3}$' THEN
    RAISE EXCEPTION 'Code opportunité invalide (attendu 9XXX). Reçu: %', _code USING ERRCODE = 'check_violation';
  END IF;
  LOCK TABLE public.affaires IN SHARE ROW EXCLUSIVE MODE;
  _allocated_code := public.next_affaire_numero(9);
  INSERT INTO public.affaires (numero, nom, client, phase, statut_opportunite, charge_affaires_id, taille, date_opportunite, notes, statut)
  VALUES (_allocated_code, COALESCE(NULLIF(trim(_nom), ''), _client), _client, 'opportunite', 'a_faire', _charge_affaires_id, _taille, COALESCE(_date_opportunite, CURRENT_DATE), _commentaires, 'prospect')
  RETURNING id INTO _id;
  RETURN _id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_recent_opportunite_codes()
RETURNS TABLE(code text, nom text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_chef_or_admin() THEN
    RAISE EXCEPTION 'Action réservée aux chefs et admins.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY SELECT codes.used_code, MAX(codes.used_nom)
  FROM (
    SELECT a.numero AS used_code, a.nom AS used_nom FROM public.affaires a
    UNION ALL
    SELECT a.code_opportunite AS used_code, a.nom AS used_nom FROM public.affaires a
  ) codes
  WHERE codes.used_code ~ '^9[0-9]{3}$'
  GROUP BY codes.used_code ORDER BY codes.used_code DESC LIMIT 5;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_recent_opportunite_codes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_recent_opportunite_codes() TO authenticated, service_role;
COMMENT ON FUNCTION public.create_opportunite(text,text,text,uuid,public.opportunite_taille,date,text) IS 'Allocates the next 9XXX at insertion under a table lock; supplied code is only a preview. Historical code_opportunite values are never reused.';