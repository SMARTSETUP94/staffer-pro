-- Planning indicatif général par affaire et par métier (dates début/fin, sans staffing nominatif)
CREATE TABLE public.affaire_planning_metier (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affaire_id uuid NOT NULL REFERENCES public.affaires(id) ON DELETE CASCADE,
  metier_id integer NOT NULL REFERENCES public.metiers(id) ON DELETE CASCADE,
  date_debut date NOT NULL,
  date_fin date NOT NULL,
  commentaire text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (affaire_id, metier_id),
  CONSTRAINT affaire_planning_metier_dates_ok CHECK (date_fin >= date_debut)
);

CREATE INDEX affaire_planning_metier_dates_idx ON public.affaire_planning_metier (date_debut, date_fin);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.affaire_planning_metier TO authenticated;
GRANT ALL ON public.affaire_planning_metier TO service_role;

ALTER TABLE public.affaire_planning_metier ENABLE ROW LEVEL SECURITY;

CREATE POLICY apm_select ON public.affaire_planning_metier
  FOR SELECT TO authenticated
  USING (current_user_has_capability('section.affaires'));

CREATE POLICY apm_insert ON public.affaire_planning_metier
  FOR INSERT TO authenticated
  WITH CHECK (current_user_has_capability('section.affaires'));

CREATE POLICY apm_update ON public.affaire_planning_metier
  FOR UPDATE TO authenticated
  USING (current_user_has_capability('section.affaires'))
  WITH CHECK (current_user_has_capability('section.affaires'));

CREATE POLICY apm_delete ON public.affaire_planning_metier
  FOR DELETE TO authenticated
  USING (current_user_has_capability('section.affaires'));

-- Feature flag : vue déploiement chargés d'affaires (menu filtré)
INSERT INTO public.feature_flags (flag_key, description, enabled_globally)
VALUES (
  'deploiement_charges_affaires',
  'Vue déploiement chargés d''affaires : le menu ne montre que Aujourd''hui, Chantiers, Planning général, Devis, Pipeline opportunités et Échéances. Le groupe Admin reste visible pour les administrateurs.',
  true
);