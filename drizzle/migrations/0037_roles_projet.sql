DO $$ BEGIN
  CREATE TYPE public.projet_role AS ENUM ('charge_affaires','concepteur','responsable_projet',
    'chef_constructeur','chef_finition','chef_montage','chef_demontage');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.referent_niveau AS ENUM ('principal','secondaire');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.role_referents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id uuid NOT NULL REFERENCES public.employes(id) ON DELETE CASCADE,
  role public.projet_role NOT NULL,
  niveau public.referent_niveau NOT NULL DEFAULT 'principal',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid DEFAULT auth.uid(),
  CONSTRAINT role_referents_employe_role_key UNIQUE (employe_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_referents TO authenticated;
GRANT ALL ON public.role_referents TO service_role;
ALTER TABLE public.role_referents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS role_referents_select ON public.role_referents;
CREATE POLICY role_referents_select ON public.role_referents FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS role_referents_admin_write ON public.role_referents;
CREATE POLICY role_referents_admin_write ON public.role_referents FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TABLE IF NOT EXISTS public.affaire_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affaire_id uuid NOT NULL REFERENCES public.affaires(id) ON DELETE CASCADE,
  role public.projet_role NOT NULL,
  employe_id uuid NOT NULL REFERENCES public.employes(id) ON DELETE RESTRICT,
  date_debut date,
  date_fin date,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid DEFAULT auth.uid(),
  CONSTRAINT affaire_roles_affaire_role_key UNIQUE (affaire_id, role)
);
CREATE INDEX IF NOT EXISTS affaire_roles_employe_idx ON public.affaire_roles(employe_id, role);
CREATE INDEX IF NOT EXISTS affaire_roles_periode_idx ON public.affaire_roles(date_debut, date_fin);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.affaire_roles TO authenticated;
GRANT ALL ON public.affaire_roles TO service_role;
ALTER TABLE public.affaire_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS affaire_roles_select ON public.affaire_roles;
CREATE POLICY affaire_roles_select ON public.affaire_roles FOR SELECT TO authenticated
  USING (public.is_chef_or_admin() OR public.user_has_affaire_access(affaire_id));
DROP POLICY IF EXISTS affaire_roles_write ON public.affaire_roles;
CREATE POLICY affaire_roles_write ON public.affaire_roles FOR ALL TO authenticated
  USING (public.user_has_cap('affaires.edit') AND public.user_has_affaire_access(affaire_id))
  WITH CHECK (public.user_has_cap('affaires.edit') AND public.user_has_affaire_access(affaire_id));
DROP POLICY IF EXISTS mcp_oauth_block_insert ON public.affaire_roles;
CREATE POLICY mcp_oauth_block_insert ON public.affaire_roles AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->>'client_id') IS NULL OR CURRENT_USER = 'mcp_business_rls');
DROP POLICY IF EXISTS mcp_oauth_block_update ON public.affaire_roles;
CREATE POLICY mcp_oauth_block_update ON public.affaire_roles AS RESTRICTIVE FOR UPDATE TO authenticated
  USING ((auth.jwt()->>'client_id') IS NULL OR CURRENT_USER = 'mcp_business_rls')
  WITH CHECK ((auth.jwt()->>'client_id') IS NULL OR CURRENT_USER = 'mcp_business_rls');
DROP POLICY IF EXISTS mcp_oauth_block_delete ON public.affaire_roles;
CREATE POLICY mcp_oauth_block_delete ON public.affaire_roles AS RESTRICTIVE FOR DELETE TO authenticated
  USING ((auth.jwt()->>'client_id') IS NULL OR CURRENT_USER = 'mcp_business_rls');
DROP POLICY IF EXISTS mcp_oauth_block_insert ON public.role_referents;
CREATE POLICY mcp_oauth_block_insert ON public.role_referents AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->>'client_id') IS NULL);
DROP POLICY IF EXISTS mcp_oauth_block_update ON public.role_referents;
CREATE POLICY mcp_oauth_block_update ON public.role_referents AS RESTRICTIVE FOR UPDATE TO authenticated
  USING ((auth.jwt()->>'client_id') IS NULL) WITH CHECK ((auth.jwt()->>'client_id') IS NULL);
DROP POLICY IF EXISTS mcp_oauth_block_delete ON public.role_referents;
CREATE POLICY mcp_oauth_block_delete ON public.role_referents AS RESTRICTIVE FOR DELETE TO authenticated
  USING ((auth.jwt()->>'client_id') IS NULL);

CREATE OR REPLACE FUNCTION public.affaire_roles_before_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE a record;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.role = 'responsable_projet'
     AND NEW.date_debut IS NULL AND NEW.date_fin IS NULL THEN
    SELECT date_debut_production, date_debut, date_demontage, date_fin_prevue
      INTO a FROM public.affaires WHERE id = NEW.affaire_id;
    NEW.date_debut := COALESCE(a.date_debut_production, a.date_debut);
    NEW.date_fin   := COALESCE(a.date_demontage, a.date_fin_prevue);
  END IF;
  IF NEW.date_debut IS NOT NULL AND NEW.date_fin IS NOT NULL AND NEW.date_fin < NEW.date_debut THEN
    NEW.date_fin := NEW.date_debut;
  END IF;
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_affaire_roles_before_write ON public.affaire_roles;
CREATE TRIGGER trg_affaire_roles_before_write BEFORE INSERT OR UPDATE ON public.affaire_roles
  FOR EACH ROW EXECUTE FUNCTION public.affaire_roles_before_write();

ALTER TABLE public.affaires ADD COLUMN IF NOT EXISTS statut_opportunite_depuis timestamptz;
UPDATE public.affaires SET statut_opportunite_depuis = COALESCE(updated_at, created_at)
  WHERE statut_opportunite IS NOT NULL AND statut_opportunite_depuis IS NULL;
CREATE OR REPLACE FUNCTION public.affaires_stamp_statut_opportunite()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.statut_opportunite IS DISTINCT FROM OLD.statut_opportunite THEN
    NEW.statut_opportunite_depuis := now();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_affaires_stamp_statut_opp ON public.affaires;
CREATE TRIGGER trg_affaires_stamp_statut_opp BEFORE INSERT OR UPDATE OF statut_opportunite ON public.affaires
  FOR EACH ROW EXECUTE FUNCTION public.affaires_stamp_statut_opportunite();