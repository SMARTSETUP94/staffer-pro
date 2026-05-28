-- Phase 2.1 : combler 5 trous matrice
INSERT INTO public.role_capabilities (role, capability, granted, scope) VALUES
  ('commercial',     'heures.personnelles.saisir', true, 'own'),
  ('bureau_etude',   'heures.personnelles.saisir', true, 'own'),
  ('atelier_metier', 'inbox.alertes_equipe',       true, 'team'),
  ('logistique',     'section.fabrication',        true, 'all'),
  ('chef_pose',      'section.planning_fab',       true, 'all')
ON CONFLICT (role, capability)
  DO UPDATE SET granted = EXCLUDED.granted, scope = EXCLUDED.scope;

-- Phase 2.2 : désactiver 5 excès matrice
UPDATE public.role_capabilities SET granted = false WHERE
     (role = 'commercial'    AND capability = 'section.planning_chantier_macro')
  OR (role = 'atelier_chef'  AND capability = 'section.planning_chantier_macro')
  OR (role = 'rh'            AND capability = 'section.planning_chantier_macro')
  OR (role = 'chef_pose'     AND capability = 'section.devis')
  OR (role = 'bureau_etude'  AND capability = 'data.client_contacts');

-- Phase 2.3 : compléter RLS opportunite_jalons en explicitant les 4 policies CRUD
DROP POLICY IF EXISTS opportunite_jalons_modify ON public.opportunite_jalons;

CREATE POLICY opportunite_jalons_insert ON public.opportunite_jalons
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_has_cap('action.edit_opportunite')
    AND EXISTS (
      SELECT 1 FROM public.affaires a
      WHERE a.id = opportunite_jalons.affaire_id
        AND (public.user_has_cap('opportunites.read.all') OR a.charge_affaires_id = auth.uid())
    )
  );

CREATE POLICY opportunite_jalons_update ON public.opportunite_jalons
  FOR UPDATE TO authenticated
  USING (
    public.user_has_cap('action.edit_opportunite')
    AND EXISTS (
      SELECT 1 FROM public.affaires a
      WHERE a.id = opportunite_jalons.affaire_id
        AND (public.user_has_cap('opportunites.read.all') OR a.charge_affaires_id = auth.uid())
    )
  )
  WITH CHECK (
    public.user_has_cap('action.edit_opportunite')
    AND EXISTS (
      SELECT 1 FROM public.affaires a
      WHERE a.id = opportunite_jalons.affaire_id
        AND (public.user_has_cap('opportunites.read.all') OR a.charge_affaires_id = auth.uid())
    )
  );

CREATE POLICY opportunite_jalons_delete ON public.opportunite_jalons
  FOR DELETE TO authenticated
  USING (public.user_has_cap('action.delete_opportunite'));