ALTER TABLE public.affaire_documents
  ADD COLUMN IF NOT EXISTS objet_id uuid REFERENCES public.fabrication_objets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_affaire_documents_objet_id
  ON public.affaire_documents(objet_id)
  WHERE deleted_at IS NULL AND objet_id IS NOT NULL;