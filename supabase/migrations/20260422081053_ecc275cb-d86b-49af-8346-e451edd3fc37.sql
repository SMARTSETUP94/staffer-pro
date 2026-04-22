-- Table d'historique des imports d'opportunités CRM (anti-doublon par hash)
CREATE TABLE IF NOT EXISTS public.opportunites_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  fichier_nom text NOT NULL,
  fichier_hash text NOT NULL UNIQUE,
  rows_count integer NOT NULL DEFAULT 0,
  created_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  errored_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_opportunites_imports_hash ON public.opportunites_imports(fichier_hash);
CREATE INDEX IF NOT EXISTS idx_opportunites_imports_user ON public.opportunites_imports(user_id);

ALTER TABLE public.opportunites_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "opportunites_imports_select_chef_admin"
  ON public.opportunites_imports FOR SELECT
  TO authenticated
  USING (public.is_chef_or_admin());

CREATE POLICY "opportunites_imports_insert_chef_admin"
  ON public.opportunites_imports FOR INSERT
  TO authenticated
  WITH CHECK (public.is_chef_or_admin() AND user_id = auth.uid());

CREATE POLICY "opportunites_imports_delete_admin"
  ON public.opportunites_imports FOR DELETE
  TO authenticated
  USING (public.is_admin());