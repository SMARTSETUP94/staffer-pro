REVOKE EXECUTE ON FUNCTION public.activate_contrat_template(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.create_contrat_template_version(text, text, boolean) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_active_contrat_template_id() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.set_single_active_contrat_template() FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.activate_contrat_template(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_contrat_template_version(text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_contrat_template_id() TO authenticated;