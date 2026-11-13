CREATE TABLE public.lieux_alias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alias text NOT NULL CHECK (length(btrim(alias)) BETWEEN 2 AND 120),
  lieu_id uuid NOT NULL REFERENCES public.lieux(id) ON DELETE CASCADE,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX lieux_alias_uniq ON public.lieux_alias (lower(btrim(alias)));
GRANT SELECT ON public.lieux_alias TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.lieux_alias TO authenticated;
GRANT ALL ON public.lieux_alias TO service_role;
ALTER TABLE public.lieux_alias ENABLE ROW LEVEL SECURITY;
CREATE POLICY lieux_alias_read ON public.lieux_alias FOR SELECT TO authenticated USING (true);
CREATE POLICY lieux_alias_admin_insert ON public.lieux_alias FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY lieux_alias_admin_update ON public.lieux_alias FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY lieux_alias_admin_delete ON public.lieux_alias FOR DELETE TO authenticated USING (public.is_admin());

ALTER TABLE public.affaire_etapes_logistiques
  ADD COLUMN IF NOT EXISTS a_partir_de boolean,
  ADD COLUMN IF NOT EXISTS duree_minutes smallint CHECK (duree_minutes IS NULL OR duree_minutes BETWEEN 1 AND 1440),
  ADD COLUMN IF NOT EXISTS lieu_douteux boolean;