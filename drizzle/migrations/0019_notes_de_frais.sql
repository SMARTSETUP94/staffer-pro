CREATE TYPE public.note_frais_statut AS ENUM ('en_attente','validee','rejetee','remboursee');

CREATE TABLE public.notes_de_frais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  date_depense date NOT NULL DEFAULT current_date,
  fournisseur text NOT NULL,
  categorie text NOT NULL DEFAULT 'autre',
  montant_ttc numeric(12,2) NOT NULL CHECK (montant_ttc >= 0),
  taux_tva numeric(5,2) NOT NULL DEFAULT 20,
  montant_tva numeric(12,2) NOT NULL DEFAULT 0,
  montant_ht numeric(12,2) NOT NULL DEFAULT 0,
  affaire_id uuid REFERENCES public.affaires(id) ON DELETE SET NULL,
  chantier_libre text,
  commentaire text,
  justificatif_path text,
  statut public.note_frais_statut NOT NULL DEFAULT 'en_attente',
  motif_rejet text,
  valide_par uuid, valide_le timestamptz,
  rembourse_par uuid, rembourse_le timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ndf_chantier_requis CHECK (affaire_id IS NOT NULL OR nullif(trim(chantier_libre),'') IS NOT NULL)
);
CREATE INDEX ON public.notes_de_frais(user_id, date_depense DESC);
CREATE INDEX ON public.notes_de_frais(statut);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notes_de_frais TO authenticated;
GRANT ALL ON public.notes_de_frais TO service_role;
ALTER TABLE public.notes_de_frais ENABLE ROW LEVEL SECURITY;

CREATE POLICY ndf_select ON public.notes_de_frais FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY ndf_insert ON public.notes_de_frais FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND statut = 'en_attente');
CREATE POLICY ndf_update ON public.notes_de_frais FOR UPDATE TO authenticated
  USING ((user_id = auth.uid() AND statut IN ('en_attente','rejetee')) OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());
CREATE POLICY ndf_delete ON public.notes_de_frais FOR DELETE TO authenticated
  USING ((user_id = auth.uid() AND statut IN ('en_attente','rejetee')) OR public.is_admin());

CREATE OR REPLACE FUNCTION public.guard_note_frais()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' THEN
    NEW.user_id := OLD.user_id;
    IF NOT public.is_admin() THEN
      -- un collaborateur qui corrige sa note la renvoie en attente
      NEW.statut := 'en_attente';
      NEW.motif_rejet := NULL;
      NEW.valide_par := OLD.valide_par; NEW.valide_le := OLD.valide_le;
      NEW.rembourse_par := OLD.rembourse_par; NEW.rembourse_le := OLD.rembourse_le;
    ELSIF NEW.statut IS DISTINCT FROM OLD.statut THEN
      IF NEW.statut = 'rejetee' AND nullif(trim(NEW.motif_rejet),'') IS NULL THEN
        RAISE EXCEPTION 'Motif de rejet obligatoire';
      END IF;
      IF NEW.statut = 'validee' THEN NEW.valide_par := auth.uid(); NEW.valide_le := now(); END IF;
      IF NEW.statut = 'remboursee' THEN NEW.rembourse_par := auth.uid(); NEW.rembourse_le := now(); END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_note_frais BEFORE INSERT OR UPDATE ON public.notes_de_frais
  FOR EACH ROW EXECUTE FUNCTION public.guard_note_frais();