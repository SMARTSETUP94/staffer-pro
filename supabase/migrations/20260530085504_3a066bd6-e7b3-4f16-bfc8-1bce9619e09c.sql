CREATE TABLE public.marge_chantier_workspace (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_marge_chantier_workspace_updated
  ON public.marge_chantier_workspace (updated_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marge_chantier_workspace TO authenticated;
GRANT ALL ON public.marge_chantier_workspace TO service_role;

ALTER TABLE public.marge_chantier_workspace ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_select_own ON public.marge_chantier_workspace
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY workspace_insert_own ON public.marge_chantier_workspace
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY workspace_update_own ON public.marge_chantier_workspace
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY workspace_delete_own ON public.marge_chantier_workspace
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER trg_marge_chantier_workspace_updated_at
  BEFORE UPDATE ON public.marge_chantier_workspace
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.marge_chantier_workspace IS
  'Marge chantier Phase 5 — Stockage JSONB de l''AppData par user. 1 ligne par user (user_id PRIMARY KEY). Le bouton Sauvegarder/Restaurer JSON reste comme filet externe.';