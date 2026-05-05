-- v0.41.0b Phase 3b.2 — Carnet sous-traitants transport
CREATE TYPE public.sous_traitant_type AS ENUM ('transport', 'manutention', 'fabrication', 'autre');

CREATE TABLE public.sous_traitants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text NOT NULL,
  type public.sous_traitant_type NOT NULL DEFAULT 'transport',
  contact_nom text,
  email text,
  telephone text,
  adresse text,
  siret text,
  tarif_jour_eur numeric,
  tarif_km_eur numeric,
  notes text,
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE UNIQUE INDEX idx_sous_traitants_nom_unique ON public.sous_traitants (lower(nom));
CREATE INDEX idx_sous_traitants_actif ON public.sous_traitants (actif) WHERE actif = true;

ALTER TABLE public.sous_traitants ENABLE ROW LEVEL SECURITY;

CREATE POLICY st_select_authenticated ON public.sous_traitants
  FOR SELECT TO authenticated USING (true);

CREATE POLICY st_modify_chef_admin ON public.sous_traitants
  FOR ALL TO authenticated USING (is_chef_or_admin()) WITH CHECK (is_chef_or_admin());

CREATE TRIGGER trg_sous_traitants_updated_at
  BEFORE UPDATE ON public.sous_traitants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Backfill depuis trajets.prestataire (valeurs distinctes)
INSERT INTO public.sous_traitants (nom, type, notes)
SELECT DISTINCT trim(prestataire), 'transport'::public.sous_traitant_type, 'Importé automatiquement depuis les trajets existants'
FROM public.trajets
WHERE prestataire IS NOT NULL AND trim(prestataire) <> ''
ON CONFLICT DO NOTHING;