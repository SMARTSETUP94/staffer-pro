ALTER FUNCTION public.email_domain(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.normalize_client_name(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.tg_clients_normalize() SET search_path = public, pg_temp;