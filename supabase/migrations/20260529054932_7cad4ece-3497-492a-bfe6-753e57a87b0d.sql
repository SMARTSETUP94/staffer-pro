-- =============================================================================
-- Audit pré-déploiement v0.52 — Fix récursion RLS + revoke privilege escalation
-- =============================================================================

-- 1) FIX RÉCURSION RLS : fabrication_objets ↔ fabrication_objet_equipe
-- --------------------------------------------------------------------
-- La policy `fabrication_objets_select_scope_aware` contient un EXISTS sur
-- `fabrication_objet_equipe`, qui déclenche `foe_select`, qui contient à son
-- tour un EXISTS sur `fabrication_objets` → boucle infinie au runtime.
-- Solution : helpers SECURITY DEFINER qui court-circuitent la RLS.

CREATE OR REPLACE FUNCTION public.user_is_on_fab_objet(_objet_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.fabrication_objet_equipe foe
    JOIN public.employes e ON e.id = foe.employe_id
    WHERE foe.objet_id = _objet_id
      AND foe.removed_at IS NULL
      AND e.profile_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.fab_objet_affaire_id(_objet_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT affaire_id FROM public.fabrication_objets WHERE id = _objet_id
$$;

-- Recréer fabrication_objets_select_scope_aware sans EXISTS sur foe
DROP POLICY IF EXISTS fabrication_objets_select_scope_aware ON public.fabrication_objets;
CREATE POLICY fabrication_objets_select_scope_aware
ON public.fabrication_objets
FOR SELECT
TO authenticated
USING (
  is_chef_or_admin()
  OR has_role(auth.uid(), 'bureau_etude'::app_role)
  OR has_role(auth.uid(), 'commercial'::app_role)
  OR has_role(auth.uid(), 'logistique'::app_role)
  OR (has_role(auth.uid(), 'atelier_chef'::app_role) AND objet_matches_user_metier(id))
  OR (has_role(auth.uid(), 'atelier_metier'::app_role)
      AND (objet_matches_user_metier(id) OR user_is_on_fab_objet(id)))
  OR user_has_affaire_access(affaire_id)
  OR user_is_on_fab_objet(id)
);

-- Recréer foe_select sans EXISTS sur fabrication_objets
DROP POLICY IF EXISTS foe_select ON public.fabrication_objet_equipe;
CREATE POLICY foe_select
ON public.fabrication_objet_equipe
FOR SELECT
TO authenticated
USING (
  is_chef_or_admin()
  OR user_has_affaire_access(fab_objet_affaire_id(objet_id))
  OR (employe_id IN (
    SELECT employes.id FROM public.employes WHERE employes.profile_id = auth.uid()
  ))
);

-- 2) BLOCKER B1 — Privilege escalation : revoke des caps admin sur rôles non-admin
-- --------------------------------------------------------------------
-- admin.feature_flags.manage / admin.permissions.manage / admin.audit :
-- doivent être limitées au rôle `admin` UNIQUEMENT.

DELETE FROM public.role_capabilities
WHERE capability IN (
  'admin.feature_flags.manage',
  'admin.permissions.manage',
  'admin.audit'
)
AND role <> 'admin';

-- heures.audit : limité à admin + chef_chantier + rh
DELETE FROM public.role_capabilities
WHERE capability = 'heures.audit'
  AND role NOT IN ('admin', 'chef_chantier', 'rh');

-- 3) BLOCKER B2 — Réduction périmètre poseur / employe / atelier_metier
-- --------------------------------------------------------------------
-- Caps clairement réservées aux chefs/admin, granted par erreur aux rôles
-- terrain. La RLS bloque déjà la plupart en DB, mais ces caps exposent
-- l'UI à des actions auxquelles l'utilisateur ne devrait pas accéder.

DELETE FROM public.role_capabilities
WHERE role IN ('poseur', 'employe', 'atelier_metier')
  AND capability IN (
    -- Destructives sur métier
    'affaires.delete',
    'affaires.edit',
    'devis.delete',
    'devis.import',
    'devis.view',
    -- Gestion équipe / staffing (réservé chef/admin)
    'staffing.plan.create',
    'staffing.plan.delete',
    'staffing.plan.publish',
    'staffing.assignations.edit',
    'affaire.team.manage',
    'objet.team.manage',
    'planning.edit',
    'heures.valider',
    'heures.equipe.saisir',
    -- Paramétrage / employés (admin only)
    'parametres.utilisateurs',
    'parametres.edit',
    'parametres.view',
    'employes.edit',
    'employes.import',
    'employes.view',
    -- Contrats (admin + rh uniquement)
    'contrats.create',
    'contrats.sign_employeur',
    'contrats.voir_taux',
    -- Sections affaires (les terrain voient via /mes-* uniquement)
    'section.affaires'
  );

-- Note : on conserve volontairement pour ces rôles : mes_*.view, mobile.*,
-- mon-poste.*, contrats.view_own, inbox.view/dismiss, action.upload_photo,
-- mes_propositions.view, mes_swaps.view, heures.personnelles.saisir,
-- affaire.equipe.view (lecture seule), affaire.kpi.view, objet.view,
-- objet.photo.upload, casting.view_phase_*, planning.view (lecture).