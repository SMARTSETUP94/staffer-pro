DROP POLICY IF EXISTS employes_select_self_or_chef ON public.employes;

CREATE POLICY employes_select_self_or_chef
  ON public.employes
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR public.is_chef_global()
    OR (profile_id = auth.uid())
    OR (
      public.is_chef_metier_scoped()
      AND EXISTS (
        SELECT 1
        FROM public.assignations a
        WHERE a.employe_id = employes.id
          AND public.current_user_is_chef_on_affaire(a.affaire_id)
      )
    )
  );