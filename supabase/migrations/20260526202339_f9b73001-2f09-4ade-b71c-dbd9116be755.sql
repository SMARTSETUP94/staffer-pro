
-- ============================================================================
-- L3a — RPCs replace_user_roles + get_user_effective_caps
-- ============================================================================

-- 1. RPC : remplacer l'ensemble des rôles d'un user (préserve chef_metier_scoped legacy)
CREATE OR REPLACE FUNCTION public.replace_user_roles(
  _user_id uuid,
  _roles app_role[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  final_roles app_role[];
BEGIN
  -- Sécurité : seul un admin (cap section.admin) peut appeler
  IF NOT public.user_has_cap('section.admin') THEN
    RAISE EXCEPTION 'forbidden: section.admin required';
  END IF;

  -- Garde-fou : si _roles vide → forcer 'employe'
  IF _roles IS NULL OR array_length(_roles, 1) IS NULL THEN
    final_roles := ARRAY['employe']::app_role[];
  ELSE
    final_roles := _roles;
  END IF;

  -- Supprimer les rôles non désirés (préserve chef_metier_scoped pour rollback L5)
  DELETE FROM public.user_roles
  WHERE user_id = _user_id
    AND role <> ALL (final_roles)
    AND role <> 'chef_metier_scoped'::app_role;

  -- Insérer les nouveaux (idempotent)
  INSERT INTO public.user_roles (user_id, role, status)
  SELECT _user_id, r, 'actif'::user_status
  FROM unnest(final_roles) AS r
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.replace_user_roles(uuid, app_role[]) TO authenticated;

COMMENT ON FUNCTION public.replace_user_roles(uuid, app_role[]) IS
  'L3a — Remplace l''ensemble des rôles d''un utilisateur. Préserve chef_metier_scoped legacy. Force employe si liste vide.';

-- 2. RPC : caps effectives (union union résolue + source_roles)
CREATE OR REPLACE FUNCTION public.get_user_effective_caps(_user_id uuid)
RETURNS TABLE (
  capability text,
  granted boolean,
  scope_resolved text,
  source_roles app_role[]
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    rc.capability,
    BOOL_OR(rc.granted) AS granted,
    CASE
      WHEN BOOL_OR(rc.scope = 'all' AND rc.granted) THEN 'all'
      WHEN BOOL_OR(rc.scope = 'team' AND rc.granted) THEN 'team'
      WHEN BOOL_OR(rc.scope = 'metier' AND rc.granted) THEN 'metier'
      WHEN BOOL_OR(rc.scope = 'own' AND rc.granted) THEN 'own'
      ELSE 'none'
    END AS scope_resolved,
    ARRAY_AGG(DISTINCT ur.role) FILTER (WHERE rc.granted) AS source_roles
  FROM public.user_roles ur
  JOIN public.role_capabilities rc ON rc.role = ur.role
  WHERE ur.user_id = _user_id
  GROUP BY rc.capability
  ORDER BY rc.capability;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_effective_caps(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_user_effective_caps(uuid) IS
  'L3a — Caps effectives d''un user : union granted + scope résolu (all > team > metier > own) + source_roles.';
