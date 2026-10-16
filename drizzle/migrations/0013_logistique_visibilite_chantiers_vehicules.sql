CREATE POLICY affaires_logistique_select ON public.affaires FOR SELECT TO authenticated
USING (
  current_user_has_capability('logistique.planning.view')
  AND (is_chef_or_admin() OR has_role(auth.uid(),'commercial') OR has_role(auth.uid(),'logistique') OR has_role(auth.uid(),'chef_pose'))
);
CREATE POLICY vehicules_select_logistique ON public.vehicules FOR SELECT TO authenticated
USING (actif = true AND current_user_has_capability('logistique.planning.view'));