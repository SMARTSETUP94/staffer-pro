-- Lot 1 — P0 Sécurité données fab (scope-aware)
-- Objectif: stopper la fuite RLS USING(true) sur fabrication_objets / fabrication_etapes
-- et permettre à atelier_chef de gérer l'équipe objet de son métier.

-- 1. Helper: métier principal de l'utilisateur courant (via employes.profile_id)
CREATE OR REPLACE FUNCTION public.current_user_metier_principal()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT metier_principal_id
  FROM public.employes
  WHERE profile_id = auth.uid()
  LIMIT 1
$$;

-- 2. Helper: l'objet fab correspond-il au métier de l'utilisateur ?
-- Mapping métiers: BE=8, Numérique=4, Construction/Bois=1, Métallerie=2,
-- Peinture=3, Tapisserie=5, Manutention/Machiniste=7
CREATE OR REPLACE FUNCTION public.objet_matches_user_metier(_objet_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.fabrication_objets fo
    WHERE fo.id = _objet_id
      AND (
        (public.current_user_metier_principal() = 1 AND fo.heures_prevues_bois > 0)
     OR (public.current_user_metier_principal() = 2 AND fo.heures_prevues_metal > 0)
     OR (public.current_user_metier_principal() = 3 AND fo.heures_prevues_peinture > 0)
     OR (public.current_user_metier_principal() = 4 AND fo.heures_prevues_numerique > 0)
     OR (public.current_user_metier_principal() = 5 AND fo.heures_prevues_tapisserie > 0)
     OR (public.current_user_metier_principal() = 7 AND fo.heures_prevues_manutention > 0)
     OR (public.current_user_metier_principal() = 8 AND fo.heures_prevues_be > 0)
      )
  )
$$;

-- 3. RLS fabrication_objets.SELECT — remplacer USING(true)
DROP POLICY IF EXISTS fabrication_objets_select_all_auth ON public.fabrication_objets;

CREATE POLICY fabrication_objets_select_scope_aware
ON public.fabrication_objets
FOR SELECT
TO authenticated
USING (
  is_chef_or_admin()
  OR has_role(auth.uid(), 'bureau_etude'::app_role)
  OR has_role(auth.uid(), 'commercial'::app_role)
  OR has_role(auth.uid(), 'logistique'::app_role)
  OR (
    has_role(auth.uid(), 'atelier_chef'::app_role)
    AND public.objet_matches_user_metier(id)
  )
  OR (
    has_role(auth.uid(), 'atelier_metier'::app_role)
    AND (
      public.objet_matches_user_metier(id)
      OR EXISTS (
        SELECT 1 FROM public.fabrication_objet_equipe foe
        JOIN public.employes e ON e.id = foe.employe_id
        WHERE foe.objet_id = fabrication_objets.id
          AND foe.removed_at IS NULL
          AND e.profile_id = auth.uid()
      )
    )
  )
  OR user_has_affaire_access(affaire_id)
  OR EXISTS (
    SELECT 1 FROM public.fabrication_objet_equipe foe
    JOIN public.employes e ON e.id = foe.employe_id
    WHERE foe.objet_id = fabrication_objets.id
      AND foe.removed_at IS NULL
      AND e.profile_id = auth.uid()
  )
);

-- 4. RLS fabrication_etapes.SELECT — même logique via jointure objet
DROP POLICY IF EXISTS fabrication_etapes_select_all_auth ON public.fabrication_etapes;

CREATE POLICY fabrication_etapes_select_scope_aware
ON public.fabrication_etapes
FOR SELECT
TO authenticated
USING (
  is_chef_or_admin()
  OR has_role(auth.uid(), 'bureau_etude'::app_role)
  OR (assignee_id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.fabrication_objets fo
    WHERE fo.id = fabrication_etapes.objet_id
    -- réutilise la RLS de fabrication_objets via re-check explicite
  )
);
-- Note: la sous-requête EXISTS s'appuie sur le fait que la RLS de fabrication_objets
-- filtre déjà la visibilité — Postgres applique les policies en cascade.

-- 5. RLS fabrication_etapes_historique.SELECT
DROP POLICY IF EXISTS fabrication_historique_select_all_auth ON public.fabrication_etapes_historique;

CREATE POLICY fabrication_historique_select_scope_aware
ON public.fabrication_etapes_historique
FOR SELECT
TO authenticated
USING (
  is_chef_or_admin()
  OR EXISTS (
    SELECT 1 FROM public.fabrication_etapes fe
    WHERE fe.id = fabrication_etapes_historique.etape_id
    -- visibilité héritée via RLS de fabrication_etapes
  )
);

-- 6. RLS fabrication_objet_equipe — étendre modify à atelier_chef sur son métier
DROP POLICY IF EXISTS foe_modify_chef_admin ON public.fabrication_objet_equipe;

CREATE POLICY foe_modify_chef_admin_atelier
ON public.fabrication_objet_equipe
FOR ALL
TO authenticated
USING (
  is_admin()
  OR is_chef_global()
  OR (
    has_role(auth.uid(), 'atelier_chef'::app_role)
    AND public.objet_matches_user_metier(objet_id)
  )
)
WITH CHECK (
  is_admin()
  OR is_chef_global()
  OR (
    has_role(auth.uid(), 'atelier_chef'::app_role)
    AND public.objet_matches_user_metier(objet_id)
  )
);

-- 7. GRANT EXECUTE sur nouveaux helpers
GRANT EXECUTE ON FUNCTION public.current_user_metier_principal() TO authenticated;
GRANT EXECUTE ON FUNCTION public.objet_matches_user_metier(uuid) TO authenticated;