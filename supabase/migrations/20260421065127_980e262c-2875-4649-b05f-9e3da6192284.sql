-- Élargir SELECT sur public.affaires : un employé peut voir une affaire
-- s'il est chef/admin OU s'il a au moins une assignation sur cette affaire.
DROP POLICY IF EXISTS "affaires_select_chef_admin" ON public.affaires;

CREATE POLICY "affaires_select_chef_admin_or_assigned"
ON public.affaires
FOR SELECT
TO authenticated
USING (
  public.is_chef_or_admin()
  OR EXISTS (
    SELECT 1
    FROM public.assignations a
    JOIN public.employes e ON e.id = a.employe_id
    WHERE a.affaire_id = affaires.id
      AND e.profile_id = auth.uid()
  )
);

-- Élargir SELECT sur public.affaire_commentaires : un employé peut lire
-- un commentaire s'il est chef/admin OU s'il est mentionné dedans.
-- (Voulu : pas tous les commentaires de l'affaire, uniquement ceux qui le citent.)
DROP POLICY IF EXISTS "affaire_commentaires_select_chef_admin" ON public.affaire_commentaires;

CREATE POLICY "affaire_commentaires_select_chef_admin_or_mentioned"
ON public.affaire_commentaires
FOR SELECT
TO authenticated
USING (
  public.is_chef_or_admin()
  OR auth.uid() = ANY (mentions)
);

-- Index pour accélérer la vérification mentions[] (gin sur uuid[]).
CREATE INDEX IF NOT EXISTS idx_affaire_commentaires_mentions
  ON public.affaire_commentaires USING GIN (mentions);

-- Index pour accélérer le check assignations.affaire_id par employe_id.
-- (assignations a déjà des FKs mais pas forcément un index combiné employe/affaire.)
CREATE INDEX IF NOT EXISTS idx_assignations_employe_affaire
  ON public.assignations (employe_id, affaire_id);