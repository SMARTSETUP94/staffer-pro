DROP POLICY IF EXISTS "affaires_photos_business_read" ON storage.objects;
CREATE POLICY "affaires_photos_business_read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'affaires-photos'
  AND public.current_user_has_capability('section.affaires')
  AND EXISTS (SELECT 1 FROM public.affaire_documents d
              WHERE d.storage_path = objects.name AND d.deleted_at IS NULL));