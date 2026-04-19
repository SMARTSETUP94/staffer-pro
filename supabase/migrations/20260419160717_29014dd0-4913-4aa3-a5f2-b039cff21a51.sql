-- Enum pour les types d'absence
CREATE TYPE public.absence_type AS ENUM ('conges', 'formation', 'arret_maladie', 'rtt', 'autre');

-- Table absences
CREATE TABLE public.absences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employe_id UUID NOT NULL REFERENCES public.employes(id) ON DELETE CASCADE,
  date_debut DATE NOT NULL,
  date_fin DATE NOT NULL,
  type public.absence_type NOT NULL DEFAULT 'conges',
  demi_journee public.demi_journee_type NULL,
  motif TEXT NULL,
  valide BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT absences_dates_coherentes CHECK (date_fin >= date_debut)
);

-- Index pour requêtes planning (recherche par employé + plage de dates)
CREATE INDEX idx_absences_employe_dates ON public.absences (employe_id, date_debut, date_fin);
CREATE INDEX idx_absences_dates ON public.absences (date_debut, date_fin);

-- Trigger updated_at
CREATE TRIGGER trg_absences_updated_at
  BEFORE UPDATE ON public.absences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.absences ENABLE ROW LEVEL SECURITY;

-- SELECT : chefs/admins voient tout, employés voient leurs propres absences
CREATE POLICY "absences_select_self_or_chef"
  ON public.absences
  FOR SELECT
  TO authenticated
  USING (
    public.is_chef_or_admin()
    OR employe_id IN (
      SELECT id FROM public.employes WHERE profile_id = auth.uid()
    )
  );

-- INSERT : chefs/admins peuvent tout créer ; employés peuvent créer pour eux-mêmes (non validé)
CREATE POLICY "absences_insert_self_or_chef"
  ON public.absences
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_chef_or_admin()
    OR (
      employe_id IN (SELECT id FROM public.employes WHERE profile_id = auth.uid())
      AND valide = false
    )
  );

-- UPDATE : seuls chefs/admins
CREATE POLICY "absences_update_chef_admin"
  ON public.absences
  FOR UPDATE
  TO authenticated
  USING (public.is_chef_or_admin())
  WITH CHECK (public.is_chef_or_admin());

-- DELETE : seuls chefs/admins
CREATE POLICY "absences_delete_chef_admin"
  ON public.absences
  FOR DELETE
  TO authenticated
  USING (public.is_chef_or_admin());