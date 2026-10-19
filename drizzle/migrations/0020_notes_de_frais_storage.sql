CREATE POLICY ndf_obj_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'notes-de-frais' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin()));
CREATE POLICY ndf_obj_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'notes-de-frais' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY ndf_obj_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'notes-de-frais' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin()));