CREATE TABLE public.jalonnements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affaire_id uuid REFERENCES public.affaires(id) ON DELETE SET NULL,
  nom_fichier text NOT NULL,
  mime text,
  taille integer,
  storage_path text NOT NULL,
  resultat_ia jsonb,
  statut text NOT NULL DEFAULT 'a_valider' CHECK (statut IN ('a_valider','planifie','erreur')),
  erreur text,
  nb_etapes_planifiees integer NOT NULL DEFAULT 0,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jalonnements_affaire_idx ON public.jalonnements(affaire_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jalonnements TO authenticated;
GRANT ALL ON public.jalonnements TO service_role;
ALTER TABLE public.jalonnements ENABLE ROW LEVEL SECURITY;
CREATE POLICY jal_select ON public.jalonnements FOR SELECT TO authenticated USING (public.user_has_cap('logistique.planning.view'));
CREATE POLICY jal_insert ON public.jalonnements FOR INSERT TO authenticated WITH CHECK (public.user_has_cap('logistique.etape.edit'));
CREATE POLICY jal_update ON public.jalonnements FOR UPDATE TO authenticated USING (public.user_has_cap('logistique.etape.edit')) WITH CHECK (public.user_has_cap('logistique.etape.edit'));
CREATE POLICY jal_delete ON public.jalonnements FOR DELETE TO authenticated USING (public.user_has_cap('logistique.etape.edit'));
CREATE POLICY jal_files_select ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'jalonnements' AND public.user_has_cap('logistique.planning.view'));
CREATE POLICY jal_files_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'jalonnements' AND public.user_has_cap('logistique.etape.edit'));
CREATE POLICY jal_files_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'jalonnements' AND public.user_has_cap('logistique.etape.edit'));