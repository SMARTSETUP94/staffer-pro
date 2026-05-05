-- v0.21.1 Phase 2 — Durcissement RLS heures_saisies (édition employé)
DROP POLICY IF EXISTS heures_saisies_self_update ON public.heures_saisies;
CREATE POLICY heures_saisies_self_update ON public.heures_saisies
  FOR UPDATE
  USING (
    is_admin()
    OR (is_chef_or_admin() AND ((devis_id IS NULL) OR (NOT is_devis_termine(devis_id))))
    OR (
      employe_id IN (SELECT id FROM employes WHERE profile_id = auth.uid())
      AND statut <> 'valide'::heures_statut
      AND ((devis_id IS NULL) OR (NOT is_devis_termine(devis_id)))
    )
  )
  WITH CHECK (
    is_admin()
    OR (is_chef_or_admin() AND ((devis_id IS NULL) OR (NOT is_devis_termine(devis_id))))
    OR (
      employe_id IN (SELECT id FROM employes WHERE profile_id = auth.uid())
      AND statut <> 'valide'::heures_statut
      AND ((devis_id IS NULL) OR (NOT is_devis_termine(devis_id)))
    )
  );

-- Phase 2 bis — DELETE employé limité aux brouillons
CREATE POLICY heures_saisies_self_delete_brouillon ON public.heures_saisies
  FOR DELETE
  TO authenticated
  USING (
    employe_id IN (SELECT id FROM employes WHERE profile_id = auth.uid())
    AND statut = 'brouillon'::heures_statut
    AND ((devis_id IS NULL) OR (NOT is_devis_termine(devis_id)))
  );

-- v0.21.1 Phase 3 — UNIQUE INDEX partiel anti race-condition chef du jour
DROP INDEX IF EXISTS public.idx_assignations_chef_jour;
CREATE UNIQUE INDEX assignations_chef_jour_unique
  ON public.assignations (affaire_id, date, demi_journee)
  WHERE est_chef_jour = true;