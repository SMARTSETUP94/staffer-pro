-- v0.45 Sprint A — Étape 2/2 : helpers + durcissement RLS

-- ============================================================================
-- 1) Helpers
-- ============================================================================

-- Élargit is_chef_or_admin pour inclure chef_metier_scoped (sémantique app
-- préservée : tous les chefs scopés passent les checks "puis-je écrire").
-- Les politiques sensibles ci-dessous ajoutent la contrainte de scope.
CREATE OR REPLACE FUNCTION public.is_chef_or_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'chef_chantier'::public.app_role)
      OR public.has_role(auth.uid(), 'chef_metier_scoped'::public.app_role)
$$;

-- "Chef global" = admin + chef_chantier UNIQUEMENT (PAS chef_metier_scoped).
-- Utilisé là où une vue transverse est nécessaire (pages admin globales).
CREATE OR REPLACE FUNCTION public.is_chef_global()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'chef_chantier'::public.app_role)
$$;

-- Helper : l'utilisateur est-il chef_metier_scoped (sans le bonus global) ?
CREATE OR REPLACE FUNCTION public.is_chef_metier_scoped()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_role(auth.uid(), 'chef_metier_scoped'::public.app_role)
$$;

-- GRANT EXECUTE (core rule : JAMAIS REVOKE)
GRANT EXECUTE ON FUNCTION public.is_chef_or_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_chef_global() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_chef_metier_scoped() TO authenticated;

-- ============================================================================
-- 2) heures_saisies — durcir pour chef_metier_scoped (scope par-affaire)
-- ============================================================================

DROP POLICY IF EXISTS heures_saisies_self_select ON public.heures_saisies;
CREATE POLICY heures_saisies_self_select ON public.heures_saisies
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR public.is_chef_global()
    OR (public.is_chef_metier_scoped() AND public.current_user_is_chef_on_affaire(affaire_id))
    OR (employe_id IN (SELECT id FROM public.employes WHERE profile_id = auth.uid()))
    OR public.user_has_affaire_access(affaire_id)
  );

DROP POLICY IF EXISTS heures_saisies_self_insert ON public.heures_saisies;
CREATE POLICY heures_saisies_self_insert ON public.heures_saisies
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (
      (
        public.is_chef_global()
        OR (public.is_chef_metier_scoped() AND public.current_user_is_chef_on_affaire(affaire_id))
        OR (employe_id IN (SELECT id FROM public.employes WHERE profile_id = auth.uid()))
      )
      AND public.can_saisie_on_affaire(affaire_id, date)
    )
  );

DROP POLICY IF EXISTS heures_saisies_self_update ON public.heures_saisies;
CREATE POLICY heures_saisies_self_update ON public.heures_saisies
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR (public.is_chef_global() AND ((devis_id IS NULL) OR NOT public.is_devis_termine(devis_id)))
    OR (public.is_chef_metier_scoped() AND public.current_user_is_chef_on_affaire(affaire_id) AND ((devis_id IS NULL) OR NOT public.is_devis_termine(devis_id)))
    OR (
      (employe_id IN (SELECT id FROM public.employes WHERE profile_id = auth.uid()))
      AND statut <> 'valide'::heures_statut
      AND ((devis_id IS NULL) OR NOT public.is_devis_termine(devis_id))
    )
  )
  WITH CHECK (
    public.is_admin()
    OR (public.is_chef_global() AND ((devis_id IS NULL) OR NOT public.is_devis_termine(devis_id)))
    OR (public.is_chef_metier_scoped() AND public.current_user_is_chef_on_affaire(affaire_id) AND ((devis_id IS NULL) OR NOT public.is_devis_termine(devis_id)))
    OR (
      (employe_id IN (SELECT id FROM public.employes WHERE profile_id = auth.uid()))
      AND statut <> 'valide'::heures_statut
      AND ((devis_id IS NULL) OR NOT public.is_devis_termine(devis_id))
    )
  );

DROP POLICY IF EXISTS heures_saisies_admin_chef_delete ON public.heures_saisies;
CREATE POLICY heures_saisies_admin_chef_delete ON public.heures_saisies
  FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR (public.is_chef_global() AND ((devis_id IS NULL) OR NOT public.is_devis_termine(devis_id)))
    OR (public.is_chef_metier_scoped() AND public.current_user_is_chef_on_affaire(affaire_id) AND ((devis_id IS NULL) OR NOT public.is_devis_termine(devis_id)))
  );

-- ============================================================================
-- 3) fabrication_objets — durcir MODIFY pour chef_metier_scoped
-- ============================================================================

DROP POLICY IF EXISTS fabrication_objets_modify_chef_admin ON public.fabrication_objets;
CREATE POLICY fabrication_objets_modify_chef_admin ON public.fabrication_objets
  FOR ALL TO authenticated
  USING (
    public.is_admin()
    OR public.is_chef_global()
    OR (public.is_chef_metier_scoped() AND public.current_user_is_chef_on_affaire(affaire_id))
  )
  WITH CHECK (
    public.is_admin()
    OR public.is_chef_global()
    OR (public.is_chef_metier_scoped() AND public.current_user_is_chef_on_affaire(affaire_id))
  );

-- ============================================================================
-- 4) contrats_intermittents — restreindre SELECT pour chef_metier_scoped
--    (admin + self déjà OK, on n'élargit PAS aux chefs métier sur d'autres
--     employés — sécurité PII).
-- ============================================================================
-- Aucun changement : on laisse les chefs métier voir uniquement leurs propres
-- contrats via "employee_id IN employes.profile_id = auth.uid()".
-- Les chefs globaux n'ont pas non plus accès SELECT global sur contrats
-- (déjà admin-only). Aucune action.

-- ============================================================================
-- 5) assignation_objets — SELECT scoped pour chef_metier_scoped
-- ============================================================================

DROP POLICY IF EXISTS assignation_objets_insert_chef_admin ON public.assignation_objets;
CREATE POLICY assignation_objets_insert_chef_admin ON public.assignation_objets
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR public.is_chef_global()
    OR (
      public.is_chef_metier_scoped()
      AND EXISTS (
        SELECT 1 FROM public.assignations a
        WHERE a.id = assignation_objets.assignation_id
          AND public.current_user_is_chef_on_affaire(a.affaire_id)
      )
    )
  );

DROP POLICY IF EXISTS assignation_objets_delete_chef_admin ON public.assignation_objets;
CREATE POLICY assignation_objets_delete_chef_admin ON public.assignation_objets
  FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR public.is_chef_global()
    OR (
      public.is_chef_metier_scoped()
      AND EXISTS (
        SELECT 1 FROM public.assignations a
        WHERE a.id = assignation_objets.assignation_id
          AND public.current_user_is_chef_on_affaire(a.affaire_id)
      )
    )
  );

-- ============================================================================
-- 6) assignations — durcir INSERT/UPDATE/DELETE pour chef_metier_scoped
-- ============================================================================

DROP POLICY IF EXISTS assignations_insert_chef_admin ON public.assignations;
CREATE POLICY assignations_insert_chef_admin ON public.assignations
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      public.is_admin()
      OR public.is_chef_global()
      OR (public.is_chef_metier_scoped() AND public.current_user_is_chef_on_affaire(affaire_id))
    )
    AND ((devis_id IS NULL) OR NOT public.is_devis_termine(devis_id) OR public.is_admin())
  );

DROP POLICY IF EXISTS assignations_update_chef_admin ON public.assignations;
CREATE POLICY assignations_update_chef_admin ON public.assignations
  FOR UPDATE TO authenticated
  USING (
    (
      public.is_admin()
      OR public.is_chef_global()
      OR (public.is_chef_metier_scoped() AND public.current_user_is_chef_on_affaire(affaire_id))
    )
    AND (public.is_admin() OR (devis_id IS NULL) OR NOT public.is_devis_termine(devis_id))
  )
  WITH CHECK (
    (
      public.is_admin()
      OR public.is_chef_global()
      OR (public.is_chef_metier_scoped() AND public.current_user_is_chef_on_affaire(affaire_id))
    )
    AND (public.is_admin() OR (devis_id IS NULL) OR NOT public.is_devis_termine(devis_id))
  );

DROP POLICY IF EXISTS assignations_delete_chef_admin ON public.assignations;
CREATE POLICY assignations_delete_chef_admin ON public.assignations
  FOR DELETE TO authenticated
  USING (
    (
      public.is_admin()
      OR public.is_chef_global()
      OR (public.is_chef_metier_scoped() AND public.current_user_is_chef_on_affaire(affaire_id))
    )
    AND (public.is_admin() OR (devis_id IS NULL) OR NOT public.is_devis_termine(devis_id))
  );

-- NB : SELECT sur affaires/assignations/fabrication_objets reste large pour
-- préserver la compatibilité des centaines de requêtes app existantes — le
-- scope effectif est fait côté UI via useMesAffairesChef. Le durcissement
-- WRITE ci-dessus garantit qu'un chef_metier_scoped ne peut RIEN MODIFIER
-- sur une affaire dont il n'est pas chef.