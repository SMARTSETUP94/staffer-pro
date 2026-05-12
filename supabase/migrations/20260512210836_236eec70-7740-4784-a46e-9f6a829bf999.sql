
CREATE OR REPLACE FUNCTION public.is_chef_metier_scoped_for_employe(_employe_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.assignations a
    WHERE a.employe_id = _employe_id
      AND public.current_user_is_chef_on_affaire(a.affaire_id)
  );
$$;

DROP POLICY IF EXISTS employes_select_self_or_chef ON public.employes;

CREATE POLICY employes_select_self_or_chef
ON public.employes
FOR SELECT
TO authenticated
USING (
  is_admin()
  OR is_chef_global()
  OR profile_id = auth.uid()
  OR (is_chef_metier_scoped() AND public.is_chef_metier_scoped_for_employe(id))
);
