-- v0.40.x — Table dashboard_tips pour gestion admin du contenu du widget "Astuce du jour"
CREATE TABLE public.dashboard_tips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  texte text NOT NULL,
  emoji text NOT NULL DEFAULT '💡',
  categorie text NOT NULL DEFAULT 'divers',
  auteur text,
  active boolean NOT NULL DEFAULT true,
  ordre integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.dashboard_tips ENABLE ROW LEVEL SECURITY;

-- Lecture : tous les utilisateurs authentifiés (le widget est exposé à tous les rôles)
CREATE POLICY "dashboard_tips_select_authenticated"
  ON public.dashboard_tips
  FOR SELECT
  TO authenticated
  USING (true);

-- Modification : admin uniquement
CREATE POLICY "dashboard_tips_admin_modify"
  ON public.dashboard_tips
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Trigger updated_at
CREATE TRIGGER update_dashboard_tips_updated_at
  BEFORE UPDATE ON public.dashboard_tips
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_dashboard_tips_active ON public.dashboard_tips (active);
CREATE INDEX idx_dashboard_tips_categorie ON public.dashboard_tips (categorie);