CREATE TABLE public.ia_appels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  usage text NOT NULL CHECK (usage IN ('tri_mails','extraction_logistique','jalonnement','documents_fournisseurs','images_devis','notes_frais','enrichissement_client','mail_client','planning_import','banc_essai')),
  modele text NOT NULL CHECK (length(modele) <= 80),
  secours boolean NOT NULL DEFAULT false,
  motif_secours text CHECK (motif_secours IS NULL OR length(motif_secours) <= 200),
  statut text NOT NULL CHECK (statut IN ('ok','erreur','refus','invalide')),
  code_http smallint,
  duree_ms integer CHECK (duree_ms IS NULL OR duree_ms >= 0),
  jetons_entree integer, jetons_sortie integer,
  cout_estime numeric(10,5),
  run_id text CHECK (run_id IS NULL OR length(run_id) <= 120),
  user_id uuid
);
CREATE INDEX ia_appels_created_idx ON public.ia_appels (created_at);
CREATE INDEX ia_appels_usage_idx ON public.ia_appels (usage, created_at);
GRANT SELECT ON public.ia_appels TO authenticated;
GRANT ALL ON public.ia_appels TO service_role;
ALTER TABLE public.ia_appels ENABLE ROW LEVEL SECURITY;
CREATE POLICY ia_appels_admin_read ON public.ia_appels FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.ia_appels_purger()
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH d AS (DELETE FROM public.ia_appels WHERE created_at < now() - interval '90 days' RETURNING 1)
  SELECT count(*)::int FROM d;
$$;
REVOKE EXECUTE ON FUNCTION public.ia_appels_purger() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ia_appels_purger() TO service_role;
SELECT cron.schedule('ia_appels_purge_90j', '17 3 * * *', $$SELECT public.ia_appels_purger()$$);