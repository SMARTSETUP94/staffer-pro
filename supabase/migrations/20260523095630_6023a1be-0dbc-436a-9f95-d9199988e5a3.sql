-- ============================================================
-- Feature Flags — Bloc 0 refonte UX v0.49
-- ============================================================

CREATE TABLE IF NOT EXISTS public.feature_flags (
  flag_key text PRIMARY KEY,
  description text,
  enabled_globally boolean NOT NULL DEFAULT false,
  enabled_for_user_ids uuid[] NOT NULL DEFAULT '{}',
  enabled_for_roles text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.feature_flags IS
  'Feature flags pour activer/désactiver des fonctionnalités à la volée. Lecture par tout utilisateur connecté, écriture admin only.';

-- updated_at trigger (réutilise la fonction publique existante du projet)
DROP TRIGGER IF EXISTS trg_feature_flags_updated_at ON public.feature_flags;
CREATE TRIGGER trg_feature_flags_updated_at
BEFORE UPDATE ON public.feature_flags
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- Helper SECURITY DEFINER : utilisable dans RLS, server functions, client
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_feature_flag_enabled(_flag_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.feature_flags ff
    WHERE ff.flag_key = _flag_key
      AND (
        ff.enabled_globally = true
        OR auth.uid() = ANY (ff.enabled_for_user_ids)
        OR EXISTS (
          SELECT 1
          FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role::text = ANY (ff.enabled_for_roles)
        )
      )
  );
$$;

COMMENT ON FUNCTION public.is_feature_flag_enabled(text) IS
  'Renvoie true si le flag est actif globalement OU pour l''utilisateur courant OU pour son rôle.';

GRANT EXECUTE ON FUNCTION public.is_feature_flag_enabled(text) TO authenticated;

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS feature_flags_select_authenticated ON public.feature_flags;
CREATE POLICY feature_flags_select_authenticated
  ON public.feature_flags
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS feature_flags_admin_modify ON public.feature_flags;
CREATE POLICY feature_flags_admin_modify
  ON public.feature_flags
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
