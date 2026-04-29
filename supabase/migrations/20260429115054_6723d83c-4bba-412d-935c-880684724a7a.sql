ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS dashboard_layout jsonb DEFAULT NULL;

COMMENT ON COLUMN public.profiles.dashboard_layout IS
'Layout dashboard personnalisé par utilisateur. Format: {"visible": ["widget_id", ...], "hidden": [...]}. Si NULL, fallback sur preset par rôle calculé runtime (v0.26.0).';