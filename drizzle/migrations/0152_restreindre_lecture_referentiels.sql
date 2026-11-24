DROP POLICY IF EXISTS "typologie_phases_select_all" ON public.typologie_phases;
CREATE POLICY "typologie_phases_select_roles" ON public.typologie_phases FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));
DROP POLICY IF EXISTS "postes_select_all_auth" ON public.postes_catalogue;
CREATE POLICY "postes_select_roles" ON public.postes_catalogue FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));
DROP POLICY IF EXISTS "Lecture categories trajets" ON public.trajet_categories;
CREATE POLICY "Lecture categories trajets roles" ON public.trajet_categories FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));