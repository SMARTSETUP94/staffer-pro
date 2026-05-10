DROP POLICY IF EXISTS contrat_templates_select_authenticated ON public.contrat_templates;
CREATE POLICY contrat_templates_select_authenticated
  ON public.contrat_templates FOR SELECT TO authenticated
  USING (
    actif IS TRUE
    OR public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.contrats_intermittents ci
      JOIN public.employes e ON e.id = ci.employee_id
      WHERE ci.template_version_id = contrat_templates.id
        AND e.profile_id = auth.uid()
    )
  );