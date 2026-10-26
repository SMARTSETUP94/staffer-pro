-- Contrôle de droits en lecture seule pour l'aperçu MCP : mêmes règles que app_assert_affaire_write, sans écriture.
CREATE OR REPLACE FUNCTION public.mcp_preview_assert_affaire(_id uuid, _cap text)
 RETURNS void LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $function$
DECLARE a public.affaires;
BEGIN
  IF NOT public.user_has_cap(_cap) THEN RAISE EXCEPTION 'Droit métier insuffisant'; END IF;
  SELECT * INTO a FROM affaires WHERE id=_id AND archived_at IS NULL;
  IF NOT FOUND OR NOT (public.user_cap_scope(_cap)='all' OR (public.user_cap_scope(_cap)='own' AND a.charge_affaires_id=auth.uid()) OR (public.user_cap_scope(_cap) IN ('team','affaire','assigned') AND public.user_has_affaire_access(_id))) THEN RAISE EXCEPTION 'Accès affaire refusé'; END IF;
END $function$;
REVOKE ALL ON FUNCTION public.mcp_preview_assert_affaire(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mcp_preview_assert_affaire(uuid,text) TO authenticated, service_role;