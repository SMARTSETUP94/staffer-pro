-- ============================================================
-- Sprint 2 v0.44.0 — Documents / Photos par affaire
-- ============================================================

-- 1. Table affaire_documents
CREATE TABLE IF NOT EXISTS public.affaire_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affaire_id uuid NOT NULL REFERENCES public.affaires(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  filename text NOT NULL,
  mime_type text NOT NULL,
  taille_bytes bigint NOT NULL,
  description text NULL,
  prise_le date NULL,
  uploaded_by uuid NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_affaire_documents_affaire_active
  ON public.affaire_documents (affaire_id, uploaded_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_affaire_documents_uploaded_by
  ON public.affaire_documents (uploaded_by);

-- Trigger updated_at
CREATE TRIGGER affaire_documents_set_updated_at
  BEFORE UPDATE ON public.affaire_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 2. RLS sur la table
ALTER TABLE public.affaire_documents ENABLE ROW LEVEL SECURITY;

-- SELECT : admin OR chef assigné OR mentionné
CREATE POLICY affaire_documents_select
  ON public.affaire_documents
  FOR SELECT
  TO authenticated
  USING (
    is_admin()
    OR user_has_affaire_access(affaire_id)
    OR user_is_mentioned_on_affaire(affaire_id)
  );

-- INSERT : admin OR chef explicitement assigné à l'affaire
CREATE POLICY affaire_documents_insert
  ON public.affaire_documents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND (
      is_admin()
      OR current_user_is_chef_on_affaire(affaire_id)
    )
  );

-- UPDATE : auteur OR admin (caption, prise_le, deleted_at pour soft delete)
CREATE POLICY affaire_documents_update
  ON public.affaire_documents
  FOR UPDATE
  TO authenticated
  USING (
    is_admin()
    OR uploaded_by = auth.uid()
  )
  WITH CHECK (
    is_admin()
    OR uploaded_by = auth.uid()
  );

-- DELETE physique : admin uniquement (la suppression normale = soft via UPDATE deleted_at)
CREATE POLICY affaire_documents_delete
  ON public.affaire_documents
  FOR DELETE
  TO authenticated
  USING (is_admin());

-- 3. Bucket privé affaires-photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('affaires-photos', 'affaires-photos', false)
ON CONFLICT (id) DO NOTHING;

-- 4. RLS storage.objects scoped au bucket affaires-photos
-- Le path commence par {affaire_id}/... → storage.foldername(name)[1] = affaire_id

-- SELECT
CREATE POLICY "affaires_photos_select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'affaires-photos'
    AND (
      is_admin()
      OR EXISTS (
        SELECT 1 FROM public.affaire_documents d
        WHERE d.storage_path = storage.objects.name
          AND (
            user_has_affaire_access(d.affaire_id)
            OR user_is_mentioned_on_affaire(d.affaire_id)
          )
      )
    )
  );

-- INSERT
CREATE POLICY "affaires_photos_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'affaires-photos'
    AND (
      is_admin()
      OR current_user_is_chef_on_affaire(
        ((storage.foldername(name))[1])::uuid
      )
    )
  );

-- DELETE (utilisé quand un admin / auteur supprime physiquement le fichier)
CREATE POLICY "affaires_photos_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'affaires-photos'
    AND (
      is_admin()
      OR EXISTS (
        SELECT 1 FROM public.affaire_documents d
        WHERE d.storage_path = storage.objects.name
          AND d.uploaded_by = auth.uid()
      )
    )
  );
