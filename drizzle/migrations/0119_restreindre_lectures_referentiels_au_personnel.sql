DROP POLICY IF EXISTS "role_referents_select" ON public.role_referents;
CREATE POLICY "role_referents_select" ON public.role_referents FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

DROP POLICY IF EXISTS "lieux_select_authenticated" ON public.lieux;
CREATE POLICY "lieux_select_authenticated" ON public.lieux FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

DROP POLICY IF EXISTS "adresses_favorites_select_authenticated" ON public.adresses_favorites;
CREATE POLICY "adresses_favorites_select_authenticated" ON public.adresses_favorites FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

DROP POLICY IF EXISTS "capabilities_select_authenticated" ON public.capabilities;
CREATE POLICY "capabilities_select_authenticated" ON public.capabilities FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

DROP POLICY IF EXISTS "feature_flags_select_authenticated" ON public.feature_flags;
CREATE POLICY "feature_flags_select_authenticated" ON public.feature_flags FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

DROP POLICY IF EXISTS "Synonymes lisibles" ON public.materiaux_synonymes;
CREATE POLICY "Synonymes lisibles" ON public.materiaux_synonymes FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

DROP POLICY IF EXISTS "role_capabilities_select_authenticated" ON public.role_capabilities;
CREATE POLICY "role_capabilities_select_authenticated" ON public.role_capabilities FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

DROP POLICY IF EXISTS "vca_select_authenticated" ON public.vehicule_chauffeurs_autorises;
CREATE POLICY "vca_select_authenticated" ON public.vehicule_chauffeurs_autorises FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

DROP POLICY IF EXISTS "avatars_authenticated_read" ON storage.objects;
CREATE POLICY "avatars_authenticated_read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'avatars' AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

DROP POLICY IF EXISTS "affaires_photos_business_read" ON storage.objects;
CREATE POLICY "affaires_photos_business_read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'affaires-photos' AND EXISTS (
  SELECT 1 FROM public.affaire_documents d
  WHERE d.storage_path = objects.name AND d.deleted_at IS NULL
    AND public.user_has_affaire_access(d.affaire_id)));