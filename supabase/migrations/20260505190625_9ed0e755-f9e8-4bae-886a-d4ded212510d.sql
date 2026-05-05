-- ============================================================================
-- Sprint 3b.1 — Autorisations véhicules par employé
-- ============================================================================

-- 1. Enum type d'autorisation
CREATE TYPE public.autorisation_vehicule_type AS ENUM (
  'PERMIS_B',
  'PERMIS_C',
  'PERMIS_CE',
  'PERMIS_D',
  'CACES_R489',
  'CACES_R486',
  'CACES_R484'
);

-- 2. Table principale
CREATE TABLE public.employes_autorisations_vehicules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employe_id UUID NOT NULL REFERENCES public.employes(id) ON DELETE CASCADE,
  type_autorisation public.autorisation_vehicule_type NOT NULL,
  numero TEXT,
  date_obtention DATE,
  date_expiration DATE,
  fichier_url TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 3. Index : 1 seule autorisation active par type par employé
-- (les renouvellements écrasent l'existant; historique conservé via audit applicatif)
CREATE UNIQUE INDEX uq_eav_employe_type
  ON public.employes_autorisations_vehicules(employe_id, type_autorisation);

CREATE INDEX idx_eav_expiration
  ON public.employes_autorisations_vehicules(date_expiration)
  WHERE date_expiration IS NOT NULL;

-- 4. Trigger updated_at
CREATE TRIGGER trg_eav_updated_at
  BEFORE UPDATE ON public.employes_autorisations_vehicules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 5. RLS
ALTER TABLE public.employes_autorisations_vehicules ENABLE ROW LEVEL SECURITY;

CREATE POLICY eav_select_authenticated
  ON public.employes_autorisations_vehicules
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY eav_modify_chef_admin
  ON public.employes_autorisations_vehicules
  FOR ALL TO authenticated
  USING (public.is_chef_or_admin())
  WITH CHECK (public.is_chef_or_admin());

-- 6. Vue helper : autorisations actives (non expirées)
CREATE OR REPLACE VIEW public.v_employes_autorisations_actives AS
SELECT
  eav.*,
  CASE
    WHEN eav.date_expiration IS NULL THEN 'valide'
    WHEN eav.date_expiration < CURRENT_DATE THEN 'expire'
    WHEN eav.date_expiration < CURRENT_DATE + INTERVAL '30 days' THEN 'expiration_proche'
    ELSE 'valide'
  END AS statut_validite,
  CASE
    WHEN eav.date_expiration IS NULL THEN NULL
    ELSE (eav.date_expiration - CURRENT_DATE)
  END AS jours_restants
FROM public.employes_autorisations_vehicules eav;

GRANT SELECT ON public.v_employes_autorisations_actives TO authenticated;

-- 7. Backfill depuis employes.categories_permis (sans dates)
INSERT INTO public.employes_autorisations_vehicules (employe_id, type_autorisation, notes)
SELECT
  e.id,
  CASE p
    WHEN 'B' THEN 'PERMIS_B'::public.autorisation_vehicule_type
    WHEN 'C' THEN 'PERMIS_C'::public.autorisation_vehicule_type
    WHEN 'CE' THEN 'PERMIS_CE'::public.autorisation_vehicule_type
    WHEN 'D' THEN 'PERMIS_D'::public.autorisation_vehicule_type
  END,
  'Reprise automatique depuis categories_permis (compléter dates et numéro)'
FROM public.employes e,
LATERAL unnest(e.categories_permis) AS p
WHERE e.categories_permis IS NOT NULL
  AND array_length(e.categories_permis, 1) > 0
ON CONFLICT (employe_id, type_autorisation) DO NOTHING;