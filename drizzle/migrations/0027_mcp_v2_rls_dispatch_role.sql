DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mcp_business_rls') THEN CREATE ROLE mcp_business_rls NOLOGIN NOBYPASSRLS; END IF; END $$;
GRANT authenticated TO mcp_business_rls;
GRANT mcp_business_rls TO CURRENT_USER;
GRANT USAGE ON SCHEMA public TO mcp_business_rls;