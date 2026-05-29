-- Lot 3 — Affinements RLS scope (commercial / logistique / rh)

-- 9. assignations.SELECT : ajouter commercial responsable (charge_affaires_id) sur typologie fabrication
DROP POLICY IF EXISTS assignations_select_self_or_chef ON public.assignations;
CREATE POLICY assignations_select_self_or_chef
ON public.assignations
FOR SELECT
TO authenticated
USING (
  is_chef_or_admin()
  OR (employe_id IN (SELECT id FROM employes WHERE profile_id = auth.uid()))
  OR user_has_affaire_access(affaire_id)
  OR (
    has_role(auth.uid(), 'commercial'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.affaires a
      WHERE a.id = assignations.affaire_id
        AND a.charge_affaires_id = auth.uid()
    )
  )
);

-- 10. affaire_equipe : autoriser logistique à muter SI charge_affaires_id ou chef_chantier_id ET phase = 'logistique'
DROP POLICY IF EXISTS affaire_equipe_modify_chef_admin ON public.affaire_equipe;
CREATE POLICY affaire_equipe_modify_chef_admin
ON public.affaire_equipe
FOR ALL
TO authenticated
USING (
  is_admin() OR is_chef_global()
  OR (
    has_role(auth.uid(), 'logistique'::app_role)
    AND phase = 'logistique'
    AND EXISTS (
      SELECT 1 FROM public.affaires a
      WHERE a.id = affaire_equipe.affaire_id
        AND (a.charge_affaires_id = auth.uid() OR a.chef_chantier_id = auth.uid())
    )
  )
)
WITH CHECK (
  is_admin() OR is_chef_global()
  OR (
    has_role(auth.uid(), 'logistique'::app_role)
    AND phase = 'logistique'
    AND EXISTS (
      SELECT 1 FROM public.affaires a
      WHERE a.id = affaire_equipe.affaire_id
        AND (a.charge_affaires_id = auth.uid() OR a.chef_chantier_id = auth.uid())
    )
  )
);

-- 12. heures_saisies : autoriser rh à supprimer (cohérent avec rôle validation)
DROP POLICY IF EXISTS heures_saisies_admin_chef_delete ON public.heures_saisies;
CREATE POLICY heures_saisies_admin_chef_delete
ON public.heures_saisies
FOR DELETE
TO authenticated
USING (
  is_admin()
  OR (is_chef_global() AND ((devis_id IS NULL) OR (NOT is_devis_termine(devis_id))))
  OR (has_role(auth.uid(), 'rh'::app_role) AND ((devis_id IS NULL) OR (NOT is_devis_termine(devis_id))))
);