-- Lock down realtime.messages: app only uses postgres_changes (RLS on
-- underlying tables already scopes payloads). Broadcast/Presence are not
-- used, so deny all access on realtime.messages by default.

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

-- Drop any prior permissive policies we may have added previously
DROP POLICY IF EXISTS "realtime_messages_authenticated_all" ON realtime.messages;
DROP POLICY IF EXISTS "realtime_messages_deny_all" ON realtime.messages;

-- Default-deny: no SELECT / INSERT / UPDATE / DELETE for any role.
-- Postgres_changes does not require a SELECT policy on realtime.messages
-- because it is delivered via the logical replication slot, not by reading
-- this table. If Broadcast/Presence is introduced later, add scoped
-- policies (e.g. topic LIKE 'user:' || auth.uid() || ':%').
CREATE POLICY "realtime_messages_deny_all"
  ON realtime.messages
  AS RESTRICTIVE
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);