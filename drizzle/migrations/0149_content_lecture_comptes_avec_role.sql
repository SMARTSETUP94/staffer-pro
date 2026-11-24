DROP POLICY IF EXISTS content_quiz_select_authenticated ON public.content_quiz;
CREATE POLICY content_quiz_select_authenticated ON public.content_quiz FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));
DROP POLICY IF EXISTS content_astuces_select_authenticated ON public.content_astuces;
CREATE POLICY content_astuces_select_authenticated ON public.content_astuces FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));