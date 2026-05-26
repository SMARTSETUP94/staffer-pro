-- Bloc 9 Lot 9.4 — auto-tag des photos mission
ALTER TABLE public.affaire_documents
  ADD COLUMN IF NOT EXISTS categorie text NULL,
  ADD COLUMN IF NOT EXISTS mission_phase text NULL
    CHECK (mission_phase IS NULL OR mission_phase IN ('montage','demontage'));

CREATE INDEX IF NOT EXISTS idx_affaire_documents_mission_phase
  ON public.affaire_documents (affaire_id, mission_phase)
  WHERE mission_phase IS NOT NULL;

COMMENT ON COLUMN public.affaire_documents.categorie IS
  'Bloc 9 — auto-tag mission pose : avant_montage / pendant_montage / apres_montage / avant_demontage / pendant_demontage / apres_demontage / incident';
COMMENT ON COLUMN public.affaire_documents.mission_phase IS
  'Bloc 9 — phase mission liée (montage / demontage) si la photo est prise depuis la carte mission';