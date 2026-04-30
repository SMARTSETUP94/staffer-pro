-- Lien N-N entre assignations planning et objets de fabrication.
-- Permet au chef de préciser sur QUEL(S) objet(s) du devis l'employé travaille
-- pendant son créneau staffé, et à l'employé de voir ces objets côté mobile.

CREATE TABLE public.assignation_objets (
  assignation_id uuid NOT NULL REFERENCES public.assignations(id) ON DELETE CASCADE,
  objet_id uuid NOT NULL REFERENCES public.fabrication_objets(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (assignation_id, objet_id)
);

CREATE INDEX idx_assignation_objets_objet ON public.assignation_objets(objet_id);
CREATE INDEX idx_assignation_objets_assignation ON public.assignation_objets(assignation_id);

ALTER TABLE public.assignation_objets ENABLE ROW LEVEL SECURITY;

-- SELECT : chef/admin OU l'employé propriétaire de l'assignation OU accès affaire
CREATE POLICY "assignation_objets_select"
ON public.assignation_objets
FOR SELECT
TO authenticated
USING (
  is_chef_or_admin()
  OR EXISTS (
    SELECT 1 FROM public.assignations a
    JOIN public.employes e ON e.id = a.employe_id
    WHERE a.id = assignation_objets.assignation_id
      AND e.profile_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.assignations a
    WHERE a.id = assignation_objets.assignation_id
      AND user_has_affaire_access(a.affaire_id)
  )
);

-- INSERT / DELETE : chef/admin uniquement (l'employé ne se rattache pas lui-même à un objet)
CREATE POLICY "assignation_objets_insert_chef_admin"
ON public.assignation_objets
FOR INSERT
TO authenticated
WITH CHECK (is_chef_or_admin());

CREATE POLICY "assignation_objets_delete_chef_admin"
ON public.assignation_objets
FOR DELETE
TO authenticated
USING (is_chef_or_admin());