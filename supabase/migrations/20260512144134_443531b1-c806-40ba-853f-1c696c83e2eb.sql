DROP POLICY IF EXISTS quiz_responses_select_authenticated ON public.quiz_responses;

CREATE POLICY quiz_responses_select_self_or_admin
  ON public.quiz_responses
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR is_admin());