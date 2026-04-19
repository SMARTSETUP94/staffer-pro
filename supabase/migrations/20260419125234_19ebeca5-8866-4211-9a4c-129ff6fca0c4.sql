-- =========================================================
-- ENUMS
-- =========================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'chef_chantier', 'employe');
CREATE TYPE public.contrat_type AS ENUM ('CDI', 'Interim');
CREATE TYPE public.affaire_statut AS ENUM ('prospect', 'en_cours', 'termine', 'annule');
CREATE TYPE public.devis_statut AS ENUM ('brouillon', 'signe', 'facture');
CREATE TYPE public.demi_journee_type AS ENUM ('AM', 'PM', 'JOURNEE');
CREATE TYPE public.heures_statut AS ENUM ('brouillon', 'soumis', 'valide', 'rejete');

-- =========================================================
-- FONCTION TIMESTAMP
-- =========================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =========================================================
-- PROFILES
-- =========================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- USER_ROLES (séparé des profiles pour la sécurité)
-- =========================================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- FONCTION has_role (security definer pour éviter récursion RLS)
-- =========================================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin'::public.app_role)
$$;

CREATE OR REPLACE FUNCTION public.is_chef_or_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'chef_chantier'::public.app_role)
$$;

-- =========================================================
-- METIERS
-- =========================================================
CREATE TABLE public.metiers (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  libelle TEXT NOT NULL,
  couleur TEXT NOT NULL,
  ordre INT NOT NULL DEFAULT 0
);

ALTER TABLE public.metiers ENABLE ROW LEVEL SECURITY;

INSERT INTO public.metiers (code, libelle, couleur, ordre) VALUES
  ('construction', 'Construction / Menuiserie', '#0EA5E9', 1),
  ('metallerie',   'Métallerie',                '#64748B', 2),
  ('peinture',     'Peinture',                  '#F59E0B', 3),
  ('numerique',    'Numérique (usinage / impression)', '#8B5CF6', 4),
  ('tapisserie',   'Tapisserie',                '#EC4899', 5),
  ('machiniste',   'Machiniste (pose / dépose)','#10B981', 6),
  ('logistique',   'Logistique / Manutention',  '#6366F1', 7),
  ('suivi_projet', 'Suivi de projet / Plans techniques', '#14B8A6', 8);

-- =========================================================
-- EMPLOYES
-- =========================================================
CREATE TABLE public.employes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  prenom TEXT NOT NULL,
  nom TEXT NOT NULL,
  email TEXT,
  telephone TEXT,
  type_contrat public.contrat_type NOT NULL DEFAULT 'CDI',
  agence_interim TEXT,
  metier_principal_id INT NOT NULL REFERENCES public.metiers(id),
  actif BOOLEAN NOT NULL DEFAULT true,
  date_entree DATE,
  date_sortie DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_employes_metier ON public.employes(metier_principal_id);
CREATE INDEX idx_employes_actif ON public.employes(actif);

ALTER TABLE public.employes ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_employes_updated_at
  BEFORE UPDATE ON public.employes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- EMPLOYE_METIERS (compétences secondaires)
-- =========================================================
CREATE TABLE public.employe_metiers (
  id SERIAL PRIMARY KEY,
  employe_id UUID NOT NULL REFERENCES public.employes(id) ON DELETE CASCADE,
  metier_id INT NOT NULL REFERENCES public.metiers(id),
  UNIQUE (employe_id, metier_id)
);

ALTER TABLE public.employe_metiers ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- AFFAIRES
-- =========================================================
CREATE TABLE public.affaires (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero TEXT UNIQUE NOT NULL,
  nom TEXT NOT NULL,
  client TEXT,
  lieu TEXT,
  statut public.affaire_statut NOT NULL DEFAULT 'en_cours',
  date_debut DATE,
  date_fin_prevue DATE,
  chef_chantier_id UUID REFERENCES public.employes(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_affaires_statut ON public.affaires(statut);
CREATE INDEX idx_affaires_chef ON public.affaires(chef_chantier_id);

ALTER TABLE public.affaires ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_affaires_updated_at
  BEFORE UPDATE ON public.affaires
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- DEVIS
-- =========================================================
CREATE TABLE public.devis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affaire_id UUID NOT NULL REFERENCES public.affaires(id) ON DELETE CASCADE,
  numero TEXT UNIQUE NOT NULL,
  libelle TEXT,
  montant_ht NUMERIC(12,2),
  date_signature DATE,
  statut public.devis_statut NOT NULL DEFAULT 'signe',
  fichier_source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_devis_affaire ON public.devis(affaire_id);

ALTER TABLE public.devis ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_devis_updated_at
  BEFORE UPDATE ON public.devis
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- DEVIS_POSTES
-- =========================================================
CREATE TABLE public.devis_postes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  devis_id UUID NOT NULL REFERENCES public.devis(id) ON DELETE CASCADE,
  metier_id INT NOT NULL REFERENCES public.metiers(id),
  heures_prevues NUMERIC(7,2) NOT NULL DEFAULT 0,
  montant_ht NUMERIC(12,2),
  libelle_source TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (devis_id, metier_id)
);

CREATE INDEX idx_devis_postes_devis ON public.devis_postes(devis_id);

ALTER TABLE public.devis_postes ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_devis_postes_updated_at
  BEFORE UPDATE ON public.devis_postes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- ASSIGNATIONS
-- =========================================================
CREATE TABLE public.assignations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affaire_id UUID NOT NULL REFERENCES public.affaires(id) ON DELETE CASCADE,
  devis_id UUID REFERENCES public.devis(id) ON DELETE SET NULL,
  employe_id UUID NOT NULL REFERENCES public.employes(id) ON DELETE CASCADE,
  metier_id INT NOT NULL REFERENCES public.metiers(id),
  date DATE NOT NULL,
  demi_journee public.demi_journee_type NOT NULL,
  heures NUMERIC(5,2) NOT NULL DEFAULT 4,
  heure_debut TIME,
  heure_fin TIME,
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_assignations_date ON public.assignations(date);
CREATE INDEX idx_assignations_employe_date ON public.assignations(employe_id, date);
CREATE INDEX idx_assignations_affaire_date ON public.assignations(affaire_id, date);
CREATE INDEX idx_assignations_devis ON public.assignations(devis_id);

ALTER TABLE public.assignations ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_assignations_updated_at
  BEFORE UPDATE ON public.assignations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- HEURES_SAISIES
-- =========================================================
CREATE TABLE public.heures_saisies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignation_id UUID REFERENCES public.assignations(id) ON DELETE SET NULL,
  employe_id UUID NOT NULL REFERENCES public.employes(id) ON DELETE CASCADE,
  affaire_id UUID NOT NULL REFERENCES public.affaires(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  heure_debut TIME,
  heure_fin TIME,
  heures_reelles NUMERIC(5,2),
  statut public.heures_statut NOT NULL DEFAULT 'brouillon',
  commentaire TEXT,
  valide_par UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  valide_le TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_heures_saisies_employe ON public.heures_saisies(employe_id);
CREATE INDEX idx_heures_saisies_date ON public.heures_saisies(date);
CREATE INDEX idx_heures_saisies_statut ON public.heures_saisies(statut);

ALTER TABLE public.heures_saisies ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_heures_saisies_updated_at
  BEFORE UPDATE ON public.heures_saisies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- TRIGGER : création auto profil + rôle 'employe' à l'inscription
-- =========================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'employe'::public.app_role);

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================
-- VUES
-- =========================================================
CREATE OR REPLACE VIEW public.v_devis_consommation AS
SELECT
  d.id AS devis_id,
  d.affaire_id,
  d.numero AS devis_numero,
  m.id AS metier_id,
  m.libelle AS metier,
  m.couleur,
  m.ordre,
  dp.heures_prevues,
  COALESCE((
    SELECT SUM(a.heures)
    FROM public.assignations a
    WHERE a.devis_id = d.id AND a.metier_id = m.id
  ), 0) AS heures_assignees,
  dp.heures_prevues - COALESCE((
    SELECT SUM(a.heures)
    FROM public.assignations a
    WHERE a.devis_id = d.id AND a.metier_id = m.id
  ), 0) AS heures_restantes,
  CASE
    WHEN dp.heures_prevues = 0 THEN 0
    ELSE ROUND((COALESCE((
      SELECT SUM(a.heures)
      FROM public.assignations a
      WHERE a.devis_id = d.id AND a.metier_id = m.id
    ), 0) / dp.heures_prevues) * 100, 1)
  END AS pct_consomme
FROM public.devis d
JOIN public.devis_postes dp ON dp.devis_id = d.id
JOIN public.metiers m ON m.id = dp.metier_id;

CREATE OR REPLACE VIEW public.v_affaire_consommation AS
SELECT
  aff.id AS affaire_id,
  aff.numero,
  aff.nom,
  COALESCE((
    SELECT SUM(dp.heures_prevues)
    FROM public.devis d
    JOIN public.devis_postes dp ON dp.devis_id = d.id
    WHERE d.affaire_id = aff.id
  ), 0) AS total_heures_prevues,
  COALESCE((
    SELECT SUM(a.heures)
    FROM public.assignations a
    WHERE a.affaire_id = aff.id
  ), 0) AS total_heures_assignees
FROM public.affaires aff;

-- =========================================================
-- RLS POLICIES
-- =========================================================

-- PROFILES : chacun voit son profil ; admin voit tout
CREATE POLICY "profiles_self_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_chef_or_admin());

CREATE POLICY "profiles_self_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_admin());

CREATE POLICY "profiles_admin_insert" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "profiles_admin_delete" ON public.profiles
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- USER_ROLES : seul l'admin gère ; chacun peut voir ses propres rôles
CREATE POLICY "user_roles_self_select" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "user_roles_admin_all" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- METIERS : lecture pour tous les authentifiés ; admin gère
CREATE POLICY "metiers_select_all" ON public.metiers
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "metiers_admin_all" ON public.metiers
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- EMPLOYES : tous les authentifiés voient ; admin/chef gèrent
CREATE POLICY "employes_select_all" ON public.employes
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "employes_admin_chef_modify" ON public.employes
  FOR ALL TO authenticated
  USING (public.is_chef_or_admin())
  WITH CHECK (public.is_chef_or_admin());

-- EMPLOYE_METIERS : idem employes
CREATE POLICY "employe_metiers_select_all" ON public.employe_metiers
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "employe_metiers_admin_chef_modify" ON public.employe_metiers
  FOR ALL TO authenticated
  USING (public.is_chef_or_admin())
  WITH CHECK (public.is_chef_or_admin());

-- AFFAIRES : tous voient ; admin/chef gèrent
CREATE POLICY "affaires_select_all" ON public.affaires
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "affaires_admin_chef_modify" ON public.affaires
  FOR ALL TO authenticated
  USING (public.is_chef_or_admin())
  WITH CHECK (public.is_chef_or_admin());

-- DEVIS : tous voient ; admin/chef gèrent
CREATE POLICY "devis_select_all" ON public.devis
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "devis_admin_chef_modify" ON public.devis
  FOR ALL TO authenticated
  USING (public.is_chef_or_admin())
  WITH CHECK (public.is_chef_or_admin());

-- DEVIS_POSTES : idem
CREATE POLICY "devis_postes_select_all" ON public.devis_postes
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "devis_postes_admin_chef_modify" ON public.devis_postes
  FOR ALL TO authenticated
  USING (public.is_chef_or_admin())
  WITH CHECK (public.is_chef_or_admin());

-- ASSIGNATIONS : tous voient ; admin/chef gèrent
CREATE POLICY "assignations_select_all" ON public.assignations
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "assignations_admin_chef_modify" ON public.assignations
  FOR ALL TO authenticated
  USING (public.is_chef_or_admin())
  WITH CHECK (public.is_chef_or_admin());

-- HEURES_SAISIES : un employé voit/saisit/modifie les siennes ; admin/chef voient tout et valident
CREATE POLICY "heures_saisies_self_select" ON public.heures_saisies
  FOR SELECT TO authenticated
  USING (
    public.is_chef_or_admin()
    OR employe_id IN (SELECT id FROM public.employes WHERE profile_id = auth.uid())
  );

CREATE POLICY "heures_saisies_self_insert" ON public.heures_saisies
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_chef_or_admin()
    OR employe_id IN (SELECT id FROM public.employes WHERE profile_id = auth.uid())
  );

CREATE POLICY "heures_saisies_self_update" ON public.heures_saisies
  FOR UPDATE TO authenticated
  USING (
    public.is_chef_or_admin()
    OR (
      employe_id IN (SELECT id FROM public.employes WHERE profile_id = auth.uid())
      AND statut IN ('brouillon'::public.heures_statut, 'soumis'::public.heures_statut)
    )
  );

CREATE POLICY "heures_saisies_admin_chef_delete" ON public.heures_saisies
  FOR DELETE TO authenticated
  USING (public.is_chef_or_admin());