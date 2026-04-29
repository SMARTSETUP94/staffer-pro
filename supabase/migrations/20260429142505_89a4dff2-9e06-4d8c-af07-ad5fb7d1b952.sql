-- v0.26.2 — Audit Auth admin only
-- 3 RPC SECURITY DEFINER pour exposer données auth (audit_log_entries + users)

-- Index utile sur audit_log_entries (created_at DESC) si pas déjà présent
-- Note : on ne peut pas CREATE INDEX sur le schéma auth en migration standard, on s'en passe
-- (table déjà indexée nativement par Supabase sur created_at + instance_id)

-- ============================================
-- RPC 1 : événements auth paginés/filtrés
-- ============================================
CREATE OR REPLACE FUNCTION public.admin_get_auth_events(
  p_types text[] DEFAULT NULL,
  p_from timestamptz DEFAULT (now() - interval '30 days'),
  p_to timestamptz DEFAULT now(),
  p_limit int DEFAULT 500,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  action text,
  log_type text,
  actor_id uuid,
  actor_email text,
  actor_name text,
  ip_address text,
  raw_payload jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden: admin only';
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.created_at,
    (a.payload::jsonb)->>'action' AS action,
    (a.payload::jsonb)->>'log_type' AS log_type,
    NULLIF((a.payload::jsonb)->>'actor_id', '')::uuid AS actor_id,
    (a.payload::jsonb)->>'actor_username' AS actor_email,
    (a.payload::jsonb)->>'actor_name' AS actor_name,
    a.ip_address::text AS ip_address,
    a.payload::jsonb AS raw_payload
  FROM auth.audit_log_entries a
  WHERE a.created_at >= p_from
    AND a.created_at <= p_to
    AND (p_types IS NULL OR (a.payload::jsonb)->>'action' = ANY(p_types))
  ORDER BY a.created_at DESC
  LIMIT GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_auth_events(text[], timestamptz, timestamptz, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_auth_events(text[], timestamptz, timestamptz, int, int) TO authenticated;

-- ============================================
-- RPC 2 : stats connexions par utilisateur
-- ============================================
CREATE OR REPLACE FUNCTION public.admin_get_user_connection_stats()
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text,
  avatar_url text,
  role text,
  status text,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz,
  created_at timestamptz,
  sessions_30d bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden: admin only';
  END IF;

  RETURN QUERY
  SELECT
    u.id AS user_id,
    u.email::text,
    p.full_name,
    p.avatar_url,
    ur.role::text AS role,
    ur.status::text AS status,
    u.last_sign_in_at,
    u.email_confirmed_at,
    u.created_at,
    COALESCE((
      SELECT COUNT(*)
      FROM auth.audit_log_entries a
      WHERE NULLIF((a.payload::jsonb)->>'actor_id', '')::uuid = u.id
        AND (a.payload::jsonb)->>'action' = 'login'
        AND a.created_at > now() - interval '30 days'
    ), 0) AS sessions_30d
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  LEFT JOIN public.user_roles ur ON ur.user_id = u.id
  ORDER BY u.last_sign_in_at DESC NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_user_connection_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_user_connection_stats() TO authenticated;

-- ============================================
-- RPC 3 : invitations + statut calculé
-- ============================================
CREATE OR REPLACE FUNCTION public.admin_get_invitations()
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text,
  role text,
  invited_at timestamptz,
  invited_by uuid,
  invited_by_name text,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz,
  statut text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden: admin only';
  END IF;

  RETURN QUERY
  SELECT
    u.id AS user_id,
    u.email::text,
    p.full_name,
    ur.role::text,
    ur.invited_at,
    ur.invited_by,
    inviter.full_name AS invited_by_name,
    u.last_sign_in_at,
    u.email_confirmed_at,
    CASE
      WHEN u.last_sign_in_at IS NOT NULL OR ur.activated_at IS NOT NULL OR ur.status = 'actif' THEN 'accepte'
      WHEN ur.invited_at IS NOT NULL AND ur.invited_at < now() - interval '7 days' THEN 'expire'
      ELSE 'envoye'
    END AS statut
  FROM public.user_roles ur
  JOIN auth.users u ON u.id = ur.user_id
  LEFT JOIN public.profiles p ON p.id = u.id
  LEFT JOIN public.profiles inviter ON inviter.id = ur.invited_by
  WHERE ur.invited_at IS NOT NULL OR ur.status = 'invite'
  ORDER BY ur.invited_at DESC NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_invitations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_invitations() TO authenticated;