DROP POLICY IF EXISTS st_select_authenticated ON public.sous_traitants;

CREATE POLICY st_select_chef_admin
  ON public.sous_traitants
  FOR SELECT
  TO authenticated
  USING (is_chef_or_admin());