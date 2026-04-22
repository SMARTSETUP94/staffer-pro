-- ============================================================
-- HOTFIX v0.18.3 — Casse la récursion RLS sur assignations
-- ============================================================

-- 1. Fonctions helper SECURITY DEFINER (isolent l'évaluation de la RLS)
CREATE OR REPLACE FUNCTION public.user_has_affaire_access(_affaire_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.assignations a
    JOIN public.employes e ON e.id = a.employe_id
    WHERE a.affaire_id = _affaire_id
      AND e.profile_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.user_is_mentioned_on_affaire(_affaire_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.affaire_commentaires c
    WHERE c.affaire_id = _affaire_id
      AND auth.uid() = ANY (c.mentions)
  )
$$;

REVOKE EXECUTE ON FUNCTION public.user_has_affaire_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_has_affaire_access(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.user_is_mentioned_on_affaire(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_is_mentioned_on_affaire(uuid) TO authenticated;

COMMENT ON FUNCTION public.user_has_affaire_access(uuid) IS
  'v0.18.3 — Évite la récursion RLS sur assignations. Retourne TRUE si auth.uid() est staffé sur l''affaire.';
COMMENT ON FUNCTION public.user_is_mentioned_on_affaire(uuid) IS
  'v0.18.3 — Évite la récursion RLS croisée affaires/commentaires.';

-- 2. Policy assignations : SELECT (Option Z sans self-reference)
DROP POLICY IF EXISTS assignations_select_self_or_chef ON public.assignations;

CREATE POLICY assignations_select_self_or_chef
ON public.assignations
FOR SELECT
TO authenticated
USING (
  is_chef_or_admin()
  OR employe_id IN (SELECT id FROM public.employes WHERE profile_id = auth.uid())
  OR public.user_has_affaire_access(affaire_id)
);

-- 3. Policy heures_saisies : SELECT (même pattern Option Z)
DROP POLICY IF EXISTS heures_saisies_self_select ON public.heures_saisies;

CREATE POLICY heures_saisies_self_select
ON public.heures_saisies
FOR SELECT
TO authenticated
USING (
  is_chef_or_admin()
  OR employe_id IN (SELECT id FROM public.employes WHERE profile_id = auth.uid())
  OR public.user_has_affaire_access(affaire_id)
);

-- 4. Policy affaire_commentaires : SELECT (cross-reference assignations)
DROP POLICY IF EXISTS affaire_commentaires_select_chef_admin_or_mentioned ON public.affaire_commentaires;

CREATE POLICY affaire_commentaires_select_chef_admin_or_mentioned
ON public.affaire_commentaires
FOR SELECT
TO authenticated
USING (
  is_chef_or_admin()
  OR auth.uid() = ANY (mentions)
  OR public.user_has_affaire_access(affaire_id)
);

-- 5. Policy affaires : SELECT (cross-reference assignations + commentaires)
DROP POLICY IF EXISTS affaires_select_chef_admin_or_assigned ON public.affaires;

CREATE POLICY affaires_select_chef_admin_or_assigned
ON public.affaires
FOR SELECT
TO authenticated
USING (
  is_chef_or_admin()
  OR public.user_has_affaire_access(id)
  OR public.user_is_mentioned_on_affaire(id)
);