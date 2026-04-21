ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS password_set_done boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS password_set_at timestamptz;

-- Backfill : tous les profils existants sont considérés comme ayant déjà un mot de passe
-- (ils se sont connectés au moins une fois avant le déploiement de cette feature)
UPDATE public.profiles
SET password_set_done = true, password_set_at = COALESCE(derniere_connexion_le, created_at)
WHERE password_set_done = false;