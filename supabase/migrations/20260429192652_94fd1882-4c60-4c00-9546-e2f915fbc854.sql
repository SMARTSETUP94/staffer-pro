-- Passer le bucket avatars en privé (supprime le listing public anonyme)
UPDATE storage.buckets SET public = false WHERE id = 'avatars';

-- Remplacer la policy SELECT publique par une policy authentifiée
DROP POLICY IF EXISTS avatars_public_read ON storage.objects;

CREATE POLICY avatars_authenticated_read
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'avatars');