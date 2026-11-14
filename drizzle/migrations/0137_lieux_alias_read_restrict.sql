DROP POLICY IF EXISTS lieux_alias_read ON public.lieux_alias;
CREATE POLICY lieux_alias_read ON public.lieux_alias FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));