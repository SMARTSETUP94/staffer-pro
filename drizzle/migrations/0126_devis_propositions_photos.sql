CREATE TABLE public.devis_propositions_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  devis_id uuid NOT NULL REFERENCES public.devis(id) ON DELETE CASCADE,
  demande_par uuid NOT NULL DEFAULT auth.uid(),
  canal text NOT NULL CHECK (canal IN ('app','mcp')),
  modele text NOT NULL CHECK (length(modele) <= 80),
  appels smallint NOT NULL CHECK (appels BETWEEN 0 AND 4),
  cout_estime_eur numeric(6,4) NOT NULL CHECK (cout_estime_eur >= 0 AND cout_estime_eur <= 0.10),
  cout_reel_eur numeric(6,4) CHECK (cout_reel_eur IS NULL OR cout_reel_eur >= 0),
  duree_ms integer CHECK (duree_ms IS NULL OR duree_ms >= 0),
  propositions jsonb NOT NULL CHECK (jsonb_typeof(propositions) = 'array' AND jsonb_array_length(propositions) <= 300),
  cree_le timestamptz NOT NULL DEFAULT now(),
  expire_le timestamptz NOT NULL DEFAULT now() + interval '7 days');
CREATE INDEX devis_propositions_photos_devis_idx ON public.devis_propositions_photos (devis_id, cree_le DESC);
GRANT SELECT, INSERT ON public.devis_propositions_photos TO authenticated;
GRANT ALL ON public.devis_propositions_photos TO service_role;
ALTER TABLE public.devis_propositions_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY dpp_lecture ON public.devis_propositions_photos FOR SELECT TO authenticated
  USING (public.devis_peut_lire(devis_id) AND public.current_user_has_capability('devis.rediger'));
-- Garde-fou : la fonction serveur vérifie déjà la limite avant l'appel IA.
CREATE POLICY dpp_ajout ON public.devis_propositions_photos FOR INSERT TO authenticated
  WITH CHECK (demande_par = auth.uid() AND public.devis_peut_lire(devis_id) AND public.current_user_has_capability('devis.rediger')
    AND (SELECT count(*) FROM public.devis_propositions_photos x WHERE x.devis_id = devis_propositions_photos.devis_id AND x.cree_le > now() - interval '1 hour') < 5);