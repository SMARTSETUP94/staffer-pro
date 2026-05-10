
-- 1. Enum statut chef
CREATE TYPE public.objet_fab_statut_chef AS ENUM ('a_faire','en_cours','bloque','fini');

-- 2. Champs sur fabrication_objets
ALTER TABLE public.fabrication_objets
  ADD COLUMN statut_chef public.objet_fab_statut_chef NOT NULL DEFAULT 'a_faire',
  ADD COLUMN commentaire_chef text,
  ADD COLUMN statut_chef_updated_at timestamptz,
  ADD COLUMN statut_chef_updated_by uuid;

CREATE INDEX idx_fab_obj_statut_chef ON public.fabrication_objets(statut_chef) WHERE archive = false;
CREATE INDEX idx_fab_obj_respo ON public.fabrication_objets(respo_fab_id) WHERE archive = false;

-- 3. Table photos
CREATE TABLE public.fabrication_objets_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  objet_id uuid NOT NULL REFERENCES public.fabrication_objets(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  commentaire text
);
CREATE INDEX idx_fab_obj_photos_objet ON public.fabrication_objets_photos(objet_id);

ALTER TABLE public.fabrication_objets_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fab_photos_select_chef_admin_or_assigned"
  ON public.fabrication_objets_photos FOR SELECT TO authenticated
  USING (
    public.is_chef_or_admin()
    OR EXISTS (
      SELECT 1 FROM public.fabrication_objets fo
      WHERE fo.id = fabrication_objets_photos.objet_id
        AND public.user_has_affaire_access(fo.affaire_id)
    )
  );

CREATE POLICY "fab_photos_insert_chef_admin"
  ON public.fabrication_objets_photos FOR INSERT TO authenticated
  WITH CHECK (public.is_chef_or_admin() AND uploaded_by = auth.uid());

CREATE POLICY "fab_photos_delete_chef_admin"
  ON public.fabrication_objets_photos FOR DELETE TO authenticated
  USING (public.is_chef_or_admin());

-- 4. Bucket Storage privé
INSERT INTO storage.buckets (id, name, public)
VALUES ('fabrication-photos', 'fabrication-photos', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "fab_photos_storage_select_chef_admin"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'fabrication-photos' AND public.is_chef_or_admin());

CREATE POLICY "fab_photos_storage_insert_chef_admin"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'fabrication-photos' AND public.is_chef_or_admin());

CREATE POLICY "fab_photos_storage_delete_chef_admin"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'fabrication-photos' AND public.is_chef_or_admin());

-- 5. RPC update statut chef (audit auto)
CREATE OR REPLACE FUNCTION public.update_objet_statut_chef(
  _objet_id uuid,
  _statut public.objet_fab_statut_chef,
  _commentaire text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_chef_or_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.fabrication_objets
  SET statut_chef = _statut,
      commentaire_chef = COALESCE(_commentaire, commentaire_chef),
      statut_chef_updated_at = now(),
      statut_chef_updated_by = auth.uid()
  WHERE id = _objet_id;
END;
$$;
