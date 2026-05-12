DROP POLICY IF EXISTS eav_select_authenticated ON public.employes_autorisations_vehicules;

CREATE POLICY eav_select_chef_admin_or_self
  ON public.employes_autorisations_vehicules
  FOR SELECT
  TO authenticated
  USING (
    is_chef_or_admin()
    OR employe_id IN (
      SELECT id FROM public.employes WHERE profile_id = auth.uid()
    )
  );