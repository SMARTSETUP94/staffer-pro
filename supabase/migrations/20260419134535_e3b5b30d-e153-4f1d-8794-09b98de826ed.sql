-- =========================================================
-- AFFAIRES
-- =========================================================
DROP POLICY IF EXISTS affaires_select_all ON public.affaires;
CREATE POLICY affaires_select_chef_admin
  ON public.affaires FOR SELECT
  TO authenticated
  USING (public.is_chef_or_admin());
-- L'ancienne policy admin_chef_modify (ALL) couvre déjà INSERT/UPDATE/DELETE pour chef+admin.

-- =========================================================
-- DEVIS
-- =========================================================
DROP POLICY IF EXISTS devis_select_all ON public.devis;
CREATE POLICY devis_select_chef_admin
  ON public.devis FOR SELECT
  TO authenticated
  USING (public.is_chef_or_admin());

-- =========================================================
-- DEVIS_POSTES
-- =========================================================
DROP POLICY IF EXISTS devis_postes_select_all ON public.devis_postes;
CREATE POLICY devis_postes_select_chef_admin
  ON public.devis_postes FOR SELECT
  TO authenticated
  USING (public.is_chef_or_admin());

-- =========================================================
-- EMPLOYES
-- =========================================================
DROP POLICY IF EXISTS employes_select_all ON public.employes;
-- Un employé peut voir SA fiche (via profile_id), chef et admin voient tout.
CREATE POLICY employes_select_self_or_chef
  ON public.employes FOR SELECT
  TO authenticated
  USING (public.is_chef_or_admin() OR profile_id = auth.uid());

-- =========================================================
-- EMPLOYE_METIERS
-- =========================================================
DROP POLICY IF EXISTS employe_metiers_select_all ON public.employe_metiers;
CREATE POLICY employe_metiers_select_chef_admin
  ON public.employe_metiers FOR SELECT
  TO authenticated
  USING (public.is_chef_or_admin());

-- =========================================================
-- ASSIGNATIONS
-- =========================================================
DROP POLICY IF EXISTS assignations_select_all ON public.assignations;
-- Un employé voit SES assignations (via la jointure employe.profile_id).
CREATE POLICY assignations_select_self_or_chef
  ON public.assignations FOR SELECT
  TO authenticated
  USING (
    public.is_chef_or_admin()
    OR employe_id IN (
      SELECT id FROM public.employes WHERE profile_id = auth.uid()
    )
  );

-- =========================================================
-- METIERS
-- Lecture pour tout authentifié (les badges sont utilisés partout).
-- Modification réservée à l'admin (déjà en place via metiers_admin_all).
-- On garde metiers_select_all tel quel.
-- =========================================================
-- (rien à changer ici)

-- =========================================================
-- PROFILES
-- Déjà bien grainé (self_select OR is_chef_or_admin).
-- (rien à changer ici)
-- =========================================================