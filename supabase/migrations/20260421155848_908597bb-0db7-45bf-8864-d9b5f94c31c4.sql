-- v0.15.1 — Étape 1 : enum + colonnes uniquement (commit avant usage des nouvelles valeurs)

ALTER TYPE public.devis_statut ADD VALUE IF NOT EXISTS 'en_cours';
ALTER TYPE public.devis_statut ADD VALUE IF NOT EXISTS 'termine';
ALTER TYPE public.devis_statut ADD VALUE IF NOT EXISTS 'cloture';

ALTER TABLE public.devis
  ADD COLUMN IF NOT EXISTS date_debut_phase date,
  ADD COLUMN IF NOT EXISTS date_fin_phase   date,
  ADD COLUMN IF NOT EXISTS livre_le         timestamp with time zone,
  ADD COLUMN IF NOT EXISTS livre_par        uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.devis.date_debut_phase IS 'v0.15 — début de la phase de chantier portée par ce lot';
COMMENT ON COLUMN public.devis.date_fin_phase   IS 'v0.15 — fin prévue de la phase';
COMMENT ON COLUMN public.devis.livre_le         IS 'v0.15 — timestamp de passage en statut termine';
COMMENT ON COLUMN public.devis.livre_par        IS 'v0.15 — auteur du passage en termine';

-- assignations.devis_id : la colonne existe déjà dans types.ts, on ajoute FK + index
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'assignations' AND column_name = 'devis_id'
  ) THEN
    ALTER TABLE public.assignations ADD COLUMN devis_id uuid;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'assignations'
      AND constraint_name = 'assignations_devis_id_fkey'
  ) THEN
    ALTER TABLE public.assignations
      ADD CONSTRAINT assignations_devis_id_fkey
      FOREIGN KEY (devis_id) REFERENCES public.devis(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_assignations_devis_id ON public.assignations(devis_id);

-- heures_saisies.devis_id : nouveau
ALTER TABLE public.heures_saisies
  ADD COLUMN IF NOT EXISTS devis_id uuid REFERENCES public.devis(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.heures_saisies.devis_id IS 'v0.15 — devis (lot) auquel cette saisie est rattachée';

CREATE INDEX IF NOT EXISTS idx_heures_saisies_devis_id ON public.heures_saisies(devis_id);
