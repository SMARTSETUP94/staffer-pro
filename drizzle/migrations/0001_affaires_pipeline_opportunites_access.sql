-- Les utilisateurs ayant la capability section.pipeline_opportunites (admin, chef_chantier, commercial)
-- doivent voir et modifier TOUTES les opportunités (phase='opportunite'), indépendamment
-- du scope 'own' de section.affaires qui limitait la visibilité aux seules opportunités
-- dont ils sont le chargé d'affaires. Les chantiers (phase='signe') restent scopés.

CREATE POLICY affaires_pipeline_select
  ON public.affaires FOR SELECT
  TO authenticated
  USING (
    phase = 'opportunite'
    AND public.current_user_has_capability('section.pipeline_opportunites')
  );

CREATE POLICY affaires_pipeline_update
  ON public.affaires FOR UPDATE
  TO authenticated
  USING (
    phase = 'opportunite'
    AND public.current_user_has_capability('section.pipeline_opportunites')
  )
  WITH CHECK (
    phase = 'opportunite'
    AND public.current_user_has_capability('section.pipeline_opportunites')
  );