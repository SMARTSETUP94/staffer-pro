-- Phase 2 : retire section.affaires pour poseur + atelier_metier
UPDATE public.role_capabilities SET granted = false
WHERE capability = 'section.affaires'
  AND role IN ('poseur', 'atelier_metier');

-- Phase 3.1 : scopes restrictifs section.affaires
UPDATE public.role_capabilities SET scope = 'own'
WHERE capability = 'section.affaires' AND role = 'commercial';

UPDATE public.role_capabilities SET scope = 'metier'
WHERE capability = 'section.affaires' AND role IN ('bureau_etude', 'atelier_chef');

UPDATE public.role_capabilities SET scope = 'team'
WHERE capability = 'section.affaires' AND role = 'chef_pose';

UPDATE public.role_capabilities SET scope = 'own'
WHERE capability = 'section.affaires' AND role = 'logistique';

-- Phase 3.2 : refacto policy SELECT pour respecter user_cap_scope
DROP POLICY IF EXISTS affaires_select_chef_admin_or_assigned ON public.affaires;

CREATE POLICY affaires_select_scope_aware ON public.affaires
  FOR SELECT TO authenticated
  USING (
    -- Scope 'all' : admin, chef_chantier, rh
    public.user_cap_scope('section.affaires') = 'all'
    -- Scope 'own' : commercial (charge_affaires_id) + logistique (fallback identique)
    OR (
      public.user_cap_scope('section.affaires') = 'own'
      AND charge_affaires_id = auth.uid()
    )
    -- Scope 'metier' : bureau_etude / atelier_chef → responsable fab d'un objet
    OR (
      public.user_cap_scope('section.affaires') = 'metier'
      AND EXISTS (
        SELECT 1 FROM public.fabrication_objets fo
        WHERE fo.affaire_id = affaires.id
          AND fo.respo_fab_id = auth.uid()
      )
    )
    -- Scope 'team' : chef_pose → équipe pose (montage/demontage)
    OR (
      public.user_cap_scope('section.affaires') = 'team'
      AND EXISTS (
        SELECT 1 FROM public.affaire_equipe ae
        WHERE ae.affaire_id = affaires.id
          AND ae.phase IN ('montage', 'demontage')
          AND ae.removed_at IS NULL
          AND ae.employe_id IN (
            SELECT id FROM public.employes WHERE profile_id = auth.uid()
          )
      )
    )
    -- Fallback : accès via assignation directe ou mention (couvre poseur/atelier_metier
    -- pour leurs propres missions, ainsi que tout autre rôle assigné ponctuellement)
    OR public.user_has_affaire_access(id)
    OR public.user_is_mentioned_on_affaire(id)
  );