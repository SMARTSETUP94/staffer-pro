DROP POLICY IF EXISTS parametres_entreprise_select_authenticated ON public.parametres_entreprise;

CREATE POLICY parametres_entreprise_select_admin
  ON public.parametres_entreprise
  FOR SELECT
  TO authenticated
  USING (public.is_admin());