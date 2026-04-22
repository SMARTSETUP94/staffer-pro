-- v0.18.1 — Bloc 3 : catégories de permis sur employés
-- Bloc 1.5 : table lieux (ATELIER/STOCKAGE)

-- 1. Enum categorie_permis (B / C / CE / D)
DO $$ BEGIN
  CREATE TYPE public.categorie_permis AS ENUM ('B', 'C', 'CE', 'D');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Colonne categories_permis sur employes (array, default empty)
ALTER TABLE public.employes
  ADD COLUMN IF NOT EXISTS categories_permis public.categorie_permis[] NOT NULL DEFAULT '{}'::public.categorie_permis[];

COMMENT ON COLUMN public.employes.categories_permis IS
  'v0.18.1 — catégories de permis détenues par l''employé (B/C/CE/D). Visible/utile uniquement si est_livreur=true.';

-- 3. Enum lieu_type pour la table lieux
DO $$ BEGIN
  CREATE TYPE public.lieu_type AS ENUM ('atelier', 'stockage');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. Table lieux (paramétrage entreprise — ATELIER unique, STOCKAGE 1..N)
CREATE TABLE IF NOT EXISTS public.lieux (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type public.lieu_type NOT NULL,
  label text NOT NULL,
  adresse_complete text NOT NULL,
  latitude numeric,
  longitude numeric,
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Garde-fou : un seul ATELIER actif à la fois
CREATE UNIQUE INDEX IF NOT EXISTS lieux_one_active_atelier
  ON public.lieux (type)
  WHERE type = 'atelier' AND actif = true;

-- 5. RLS lieux : lecture par tous les authentifiés, écriture admin uniquement
ALTER TABLE public.lieux ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lieux_select_authenticated ON public.lieux;
CREATE POLICY lieux_select_authenticated
  ON public.lieux FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS lieux_admin_modify ON public.lieux;
CREATE POLICY lieux_admin_modify
  ON public.lieux FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 6. Trigger updated_at
DROP TRIGGER IF EXISTS update_lieux_updated_at ON public.lieux;
CREATE TRIGGER update_lieux_updated_at
  BEFORE UPDATE ON public.lieux
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();