REVOKE EXECUTE ON FUNCTION public.mcp_dispatch_write(text,jsonb,uuid,uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.mcp_execute_write_locked(uuid,text,text,jsonb,jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.mcp_write_preview(text,text,jsonb,uuid,uuid,text,jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.mcp_assert_write(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.mcp_safe_diff(jsonb) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.mcp_safe_diff(jsonb) TO authenticated, service_role;