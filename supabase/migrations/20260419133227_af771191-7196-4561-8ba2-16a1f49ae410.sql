-- 1. Étendre l'enum contrat_type
ALTER TYPE public.contrat_type ADD VALUE IF NOT EXISTS 'CDD';
ALTER TYPE public.contrat_type ADD VALUE IF NOT EXISTS 'Independant';

-- 2. Ajouter les colonnes nécessaires à l'import RH
ALTER TABLE public.employes
  ADD COLUMN IF NOT EXISTS is_apprenti BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS non_staffing BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sous_type_contrat TEXT,
  ADD COLUMN IF NOT EXISTS date_naissance DATE,
  ADD COLUMN IF NOT EXISTS adresse TEXT,
  ADD COLUMN IF NOT EXISTS mobile TEXT;

-- 3. Index unique partiel sur email (quand renseigné) pour le matching et éviter les doublons
CREATE UNIQUE INDEX IF NOT EXISTS employes_email_unique_idx
  ON public.employes (lower(email))
  WHERE email IS NOT NULL AND email <> '';

-- 4. Index utiles pour la détection de doublons par nom+prénom+DDN
CREATE INDEX IF NOT EXISTS employes_nom_prenom_ddn_idx
  ON public.employes (lower(nom), lower(prenom), date_naissance);