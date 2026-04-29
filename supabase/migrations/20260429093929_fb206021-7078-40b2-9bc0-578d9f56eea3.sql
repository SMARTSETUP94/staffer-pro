-- v0.25.0 — Onboarding profil utilisateur

-- 1. Champs profil
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS telephone text,
  ADD COLUMN IF NOT EXISTS date_naissance date,
  ADD COLUMN IF NOT EXISTS bio_courte text,
  ADD COLUMN IF NOT EXISTS adresse_rue text,
  ADD COLUMN IF NOT EXISTS adresse_code_postal text,
  ADD COLUMN IF NOT EXISTS adresse_ville text,
  ADD COLUMN IF NOT EXISTS adresse_pays text DEFAULT 'France',
  ADD COLUMN IF NOT EXISTS contact_urgence_nom text,
  ADD COLUMN IF NOT EXISTS contact_urgence_telephone text,
  ADD COLUMN IF NOT EXISTS contact_urgence_lien text,
  ADD COLUMN IF NOT EXISTS rgpd_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS profile_completed_at timestamptz;

-- 2. Helper is_profile_complete
CREATE OR REPLACE FUNCTION public.is_profile_complete(p_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_id
      AND p.telephone IS NOT NULL AND length(trim(p.telephone)) > 0
      AND p.adresse_rue IS NOT NULL AND length(trim(p.adresse_rue)) > 0
      AND p.adresse_code_postal IS NOT NULL AND length(trim(p.adresse_code_postal)) > 0
      AND p.adresse_ville IS NOT NULL AND length(trim(p.adresse_ville)) > 0
      AND p.contact_urgence_nom IS NOT NULL AND length(trim(p.contact_urgence_nom)) > 0
      AND p.contact_urgence_telephone IS NOT NULL AND length(trim(p.contact_urgence_telephone)) > 0
      AND p.rgpd_consent_at IS NOT NULL
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_profile_complete(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_profile_complete(uuid) TO authenticated;

-- 3. Bucket avatars (public read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- RLS storage avatars : lecture publique, écriture par owner uniquement (path = {user_id}/...)
CREATE POLICY "avatars_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

CREATE POLICY "avatars_owner_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "avatars_owner_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "avatars_owner_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
