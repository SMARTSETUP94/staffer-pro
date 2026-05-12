DROP POLICY IF EXISTS fab_photos_storage_select_chef_admin ON storage.objects;

CREATE POLICY fab_photos_storage_select_scoped
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'fabrication-photos'
  AND (
    is_admin()
    OR is_chef_global()
    OR EXISTS (
      SELECT 1
      FROM public.fabrication_objets_photos p
      JOIN public.fabrication_objets fo ON fo.id = p.objet_id
      WHERE p.storage_path = storage.objects.name
        AND (
          is_chef_or_admin() AND (
            is_admin()
            OR is_chef_global()
            OR (is_chef_metier_scoped() AND current_user_is_chef_on_affaire(fo.affaire_id))
          )
          OR user_has_affaire_access(fo.affaire_id)
        )
    )
  )
);