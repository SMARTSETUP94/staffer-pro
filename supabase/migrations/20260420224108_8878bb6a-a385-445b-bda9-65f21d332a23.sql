-- 1. Enum statut utilisateur
CREATE TYPE public.user_status AS ENUM ('invite', 'actif', 'desactive');

-- 2. Colonnes sur user_roles
ALTER TABLE public.user_roles
  ADD COLUMN status public.user_status NOT NULL DEFAULT 'actif',
  ADD COLUMN invited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN invited_at timestamptz,
  ADD COLUMN activated_at timestamptz;

-- 3. Colonne dernière connexion sur profiles
ALTER TABLE public.profiles
  ADD COLUMN derniere_connexion_le timestamptz;

-- 4. Mise à jour de handle_new_user pour gérer les invités
-- Si l'utilisateur a été créé via inviteUserByEmail, raw_user_meta_data contient { invited: true, role: '...' }
-- Sinon (signup classique), on garde le comportement actuel
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _is_invited boolean;
  _role public.app_role;
  _employe_id uuid;
BEGIN
  _is_invited := COALESCE((NEW.raw_user_meta_data->>'invited')::boolean, false);
  _role := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'role', '')::public.app_role,
    'employe'::public.app_role
  );

  -- Profil
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  )
  ON CONFLICT (id) DO NOTHING;

  -- Si invité : le user_role a déjà été créé par l'edge function invite-user
  -- Sinon : créer un user_role par défaut en 'actif'
  IF _is_invited THEN
    -- Tentative de liaison immédiate avec un employé existant
    SELECT id INTO _employe_id
    FROM public.employes
    WHERE lower(email) = lower(NEW.email)
      AND profile_id IS NULL
    LIMIT 1;

    IF _employe_id IS NOT NULL THEN
      UPDATE public.employes SET profile_id = NEW.id, updated_at = now()
      WHERE id = _employe_id;
    END IF;
  ELSE
    INSERT INTO public.user_roles (user_id, role, status)
    VALUES (NEW.id, _role, 'actif')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- 5. Trigger à la connexion : passe le statut à 'actif' + auto-lie l'employé + maj derniere_connexion
-- On déclenche sur UPDATE de auth.users.last_sign_in_at
CREATE OR REPLACE FUNCTION public.handle_user_sign_in()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _employe_id uuid;
BEGIN
  -- Détecte une nouvelle connexion (last_sign_in_at change)
  IF NEW.last_sign_in_at IS DISTINCT FROM OLD.last_sign_in_at
     AND NEW.last_sign_in_at IS NOT NULL THEN

    -- Maj date dernière connexion
    UPDATE public.profiles
       SET derniere_connexion_le = NEW.last_sign_in_at,
           updated_at = now()
     WHERE id = NEW.id;

    -- Si statut 'invite' → bascule en 'actif' + active_at
    UPDATE public.user_roles
       SET status = 'actif',
           activated_at = COALESCE(activated_at, now())
     WHERE user_id = NEW.id
       AND status = 'invite';

    -- Auto-liaison employé via email (lowercase) si pas encore lié
    SELECT id INTO _employe_id
    FROM public.employes
    WHERE lower(email) = lower(NEW.email)
      AND profile_id IS NULL
    LIMIT 1;

    IF _employe_id IS NOT NULL THEN
      UPDATE public.employes
         SET profile_id = NEW.id, updated_at = now()
       WHERE id = _employe_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_sign_in ON auth.users;
CREATE TRIGGER on_auth_user_sign_in
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_sign_in();

-- 6. Index pour perf
CREATE INDEX IF NOT EXISTS idx_user_roles_status ON public.user_roles(status);
CREATE INDEX IF NOT EXISTS idx_employes_email_lower ON public.employes(lower(email));