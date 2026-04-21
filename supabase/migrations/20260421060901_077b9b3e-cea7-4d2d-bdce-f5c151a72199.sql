-- Auto-lie les employés orphelins (profile_id IS NULL) aux profiles existants
-- via correspondance email case-insensitive.
-- Idempotent : safe à rejouer.

UPDATE public.employes e
SET 
  profile_id = p.id,
  updated_at = now()
FROM public.profiles p
WHERE e.profile_id IS NULL
  AND e.email IS NOT NULL
  AND p.email IS NOT NULL
  AND lower(trim(e.email)) = lower(trim(p.email))
  -- Évite de lier 2 employés au même profile (premier matché gagne)
  AND NOT EXISTS (
    SELECT 1 FROM public.employes e2
    WHERE e2.profile_id = p.id
  );