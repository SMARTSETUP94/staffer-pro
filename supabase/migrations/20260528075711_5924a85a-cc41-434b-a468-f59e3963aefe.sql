-- L5-A-bis Phase 1 : retrait applicatif du rôle chef_metier_scoped
-- Stratégie : supprime toutes les branches `is_chef_metier_scoped()` dans les
-- policies (équivalent puisque 0 user a ce rôle), DROP les 2 helpers SQL,
-- simplifie is_chef_or_admin() et replace_user_roles(). L'enum garde la valeur
-- fantôme "chef_metier_scoped" mais plus aucune fonction/policy ne la référence.
-- Phase 2 (DROP enum value) reportée à un sprint dédié (impact runtime nul).

-- ============================================================
-- 1) DROP des 14 policies qui référencent is_chef_metier_scoped
-- ============================================================

DROP POLICY IF EXISTS affaire_equipe_modify_chef_admin ON public.affaire_equipe;
DROP POLICY IF EXISTS assignation_objets_delete_chef_admin ON public.assignation_objets;
DROP POLICY IF EXISTS assignation_objets_insert_chef_admin ON public.assignation_objets;
DROP POLICY IF EXISTS assignations_delete_chef_admin ON public.assignations;
DROP POLICY IF EXISTS assignations_insert_chef_admin ON public.assignations;
DROP POLICY IF EXISTS assignations_update_chef_admin ON public.assignations;
DROP POLICY IF EXISTS employes_select_self_or_chef ON public.employes;
DROP POLICY IF EXISTS foe_modify_chef_admin ON public.fabrication_objet_equipe;
DROP POLICY IF EXISTS fabrication_objets_modify_chef_admin ON public.fabrication_objets;
DROP POLICY IF EXISTS heures_saisies_admin_chef_delete ON public.heures_saisies;
DROP POLICY IF EXISTS heures_saisies_self_insert ON public.heures_saisies;
DROP POLICY IF EXISTS heures_saisies_self_select ON public.heures_saisies;
DROP POLICY IF EXISTS heures_saisies_self_update ON public.heures_saisies;
DROP POLICY IF EXISTS fab_photos_storage_select_scoped ON storage.objects;

-- ============================================================
-- 2) Simplification des helpers SQL
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_chef_or_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'chef_chantier'::public.app_role)
$$;

CREATE OR REPLACE FUNCTION public.replace_user_roles(_user_id uuid, _roles app_role[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  final_roles app_role[];
BEGIN
  IF NOT public.user_has_cap('section.admin') THEN
    RAISE EXCEPTION 'forbidden: section.admin required';
  END IF;

  IF _roles IS NULL OR array_length(_roles, 1) IS NULL THEN
    final_roles := ARRAY['employe']::app_role[];
  ELSE
    final_roles := _roles;
  END IF;

  -- L5-A-bis : plus de clause de préservation chef_metier_scoped
  DELETE FROM public.user_roles
  WHERE user_id = _user_id
    AND role <> ALL (final_roles);

  INSERT INTO public.user_roles (user_id, role, status)
  SELECT _user_id, r, 'actif'::user_status
  FROM unnest(final_roles) AS r
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

-- ============================================================
-- 3) DROP des 2 helpers chef_metier_scoped
-- ============================================================

DROP FUNCTION IF EXISTS public.is_chef_metier_scoped();
DROP FUNCTION IF EXISTS public.is_chef_metier_scoped_for_employe(uuid);

-- ============================================================
-- 4) Recréation des 14 policies sans la branche chef_metier_scoped
--    (toutes équivalentes : la branche supprimée retournait toujours false)
-- ============================================================

-- affaire_equipe
CREATE POLICY affaire_equipe_modify_chef_admin
ON public.affaire_equipe
AS PERMISSIVE FOR ALL TO authenticated
USING (is_admin() OR is_chef_global())
WITH CHECK (is_admin() OR is_chef_global());

-- assignation_objets
CREATE POLICY assignation_objets_delete_chef_admin
ON public.assignation_objets
AS PERMISSIVE FOR DELETE TO authenticated
USING (is_admin() OR is_chef_global());

CREATE POLICY assignation_objets_insert_chef_admin
ON public.assignation_objets
AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (is_admin() OR is_chef_global());

-- assignations
CREATE POLICY assignations_delete_chef_admin
ON public.assignations
AS PERMISSIVE FOR DELETE TO authenticated
USING (
  (is_admin() OR is_chef_global())
  AND (is_admin() OR devis_id IS NULL OR NOT is_devis_termine(devis_id))
);

CREATE POLICY assignations_insert_chef_admin
ON public.assignations
AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (
  (is_admin() OR is_chef_global())
  AND (devis_id IS NULL OR NOT is_devis_termine(devis_id) OR is_admin())
);

CREATE POLICY assignations_update_chef_admin
ON public.assignations
AS PERMISSIVE FOR UPDATE TO authenticated
USING (
  (is_admin() OR is_chef_global())
  AND (is_admin() OR devis_id IS NULL OR NOT is_devis_termine(devis_id))
)
WITH CHECK (
  (is_admin() OR is_chef_global())
  AND (is_admin() OR devis_id IS NULL OR NOT is_devis_termine(devis_id))
);

-- employes
CREATE POLICY employes_select_self_or_chef
ON public.employes
AS PERMISSIVE FOR SELECT TO authenticated
USING (is_admin() OR is_chef_global() OR (profile_id = auth.uid()));

-- fabrication_objet_equipe
CREATE POLICY foe_modify_chef_admin
ON public.fabrication_objet_equipe
AS PERMISSIVE FOR ALL TO authenticated
USING (is_admin() OR is_chef_global())
WITH CHECK (is_admin() OR is_chef_global());

-- fabrication_objets
CREATE POLICY fabrication_objets_modify_chef_admin
ON public.fabrication_objets
AS PERMISSIVE FOR ALL TO authenticated
USING (is_admin() OR is_chef_global())
WITH CHECK (is_admin() OR is_chef_global());

-- heures_saisies
CREATE POLICY heures_saisies_admin_chef_delete
ON public.heures_saisies
AS PERMISSIVE FOR DELETE TO authenticated
USING (
  is_admin()
  OR (is_chef_global() AND (devis_id IS NULL OR NOT is_devis_termine(devis_id)))
);

CREATE POLICY heures_saisies_self_insert
ON public.heures_saisies
AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (
  is_admin()
  OR (
    (
      is_chef_global()
      OR (employe_id IN (SELECT e.id FROM employes e WHERE e.profile_id = auth.uid()))
    )
    AND can_saisie_on_affaire(affaire_id, date)
  )
);

CREATE POLICY heures_saisies_self_select
ON public.heures_saisies
AS PERMISSIVE FOR SELECT TO authenticated
USING (
  is_admin()
  OR is_chef_global()
  OR (employe_id IN (SELECT e.id FROM employes e WHERE e.profile_id = auth.uid()))
  OR user_has_affaire_access(affaire_id)
);

CREATE POLICY heures_saisies_self_update
ON public.heures_saisies
AS PERMISSIVE FOR UPDATE TO authenticated
USING (
  is_admin()
  OR (is_chef_global() AND (devis_id IS NULL OR NOT is_devis_termine(devis_id)))
  OR (
    (employe_id IN (SELECT e.id FROM employes e WHERE e.profile_id = auth.uid()))
    AND statut <> 'valide'::heures_statut
    AND (devis_id IS NULL OR NOT is_devis_termine(devis_id))
  )
)
WITH CHECK (
  is_admin()
  OR (is_chef_global() AND (devis_id IS NULL OR NOT is_devis_termine(devis_id)))
  OR (
    (employe_id IN (SELECT e.id FROM employes e WHERE e.profile_id = auth.uid()))
    AND statut <> 'valide'::heures_statut
    AND (devis_id IS NULL OR NOT is_devis_termine(devis_id))
  )
);

-- storage.objects (bucket fabrication-photos)
-- La branche `(is_chef_or_admin() AND (is_admin() OR is_chef_global() OR is_chef_metier_scoped()))`
-- se simplifie en `(is_admin() OR is_chef_global())` qui est déjà couvert plus haut.
-- On garde donc seulement la branche `user_has_affaire_access`.
CREATE POLICY fab_photos_storage_select_scoped
ON storage.objects
AS PERMISSIVE FOR SELECT TO authenticated
USING (
  bucket_id = 'fabrication-photos'::text
  AND (
    is_admin()
    OR is_chef_global()
    OR EXISTS (
      SELECT 1
      FROM fabrication_objets_photos p
      JOIN fabrication_objets fo ON fo.id = p.objet_id
      WHERE p.storage_path = objects.name
        AND user_has_affaire_access(fo.affaire_id)
    )
  )
);