DROP POLICY IF EXISTS affaire_equipe_modify_chef_admin ON public.affaire_equipe;

CREATE POLICY affaire_equipe_modify_chef_admin_ins ON public.affaire_equipe
  FOR INSERT TO authenticated
  WITH CHECK (
    is_admin() OR is_chef_global() OR (
      has_role(auth.uid(), 'logistique'::app_role)
      AND phase = 'logistique'::text
      AND EXISTS (SELECT 1 FROM public.affaires a WHERE a.id = affaire_equipe.affaire_id AND (a.charge_affaires_id = auth.uid() OR a.chef_chantier_id = auth.uid()))
    )
  );

CREATE POLICY affaire_equipe_modify_chef_admin_upd ON public.affaire_equipe
  FOR UPDATE TO authenticated
  USING (
    is_admin() OR is_chef_global() OR (
      has_role(auth.uid(), 'logistique'::app_role)
      AND phase = 'logistique'::text
      AND EXISTS (SELECT 1 FROM public.affaires a WHERE a.id = affaire_equipe.affaire_id AND (a.charge_affaires_id = auth.uid() OR a.chef_chantier_id = auth.uid()))
    )
  )
  WITH CHECK (
    is_admin() OR is_chef_global() OR (
      has_role(auth.uid(), 'logistique'::app_role)
      AND phase = 'logistique'::text
      AND EXISTS (SELECT 1 FROM public.affaires a WHERE a.id = affaire_equipe.affaire_id AND (a.charge_affaires_id = auth.uid() OR a.chef_chantier_id = auth.uid()))
    )
  );

CREATE POLICY affaire_equipe_modify_chef_admin_del ON public.affaire_equipe
  FOR DELETE TO authenticated
  USING (
    is_admin() OR is_chef_global() OR (
      has_role(auth.uid(), 'logistique'::app_role)
      AND phase = 'logistique'::text
      AND EXISTS (SELECT 1 FROM public.affaires a WHERE a.id = affaire_equipe.affaire_id AND (a.charge_affaires_id = auth.uid() OR a.chef_chantier_id = auth.uid()))
    )
  );