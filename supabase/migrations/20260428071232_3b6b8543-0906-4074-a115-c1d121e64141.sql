-- Bloc 4 v0.21.0 — Helpers de verrouillage des affaires terminees / annulees
-- Strategie : Option B (saisies heures autorisees jusqu'a date_demontage incluse,
-- fallback strict si date_demontage NULL). Admin override dans tous les cas.

-- 1. Helper : une affaire est-elle "ouverte" (= staffable / modifiable) ?
CREATE OR REPLACE FUNCTION public.is_affaire_open(_affaire_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.affaires
    WHERE id = _affaire_id
      AND statut NOT IN ('termine', 'annule')
  )
$$;

COMMENT ON FUNCTION public.is_affaire_open(uuid) IS
  'v0.21 Bloc 4 — true si l''affaire n''est pas en statut termine ou annule.';

-- 2. Helper : une saisie d'heures sur _date est-elle autorisee pour _affaire_id ?
-- Regle : si affaire ouverte → ok ; si terminee → ok seulement si _date <= date_demontage
-- (fallback strict : date_demontage NULL et statut termine → refus, sauf admin cote appel)
CREATE OR REPLACE FUNCTION public.can_saisie_on_affaire(_affaire_id uuid, _date date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.affaires a
    WHERE a.id = _affaire_id
      AND a.statut <> 'annule'
      AND (
        a.statut <> 'termine'
        OR (a.date_demontage IS NOT NULL AND _date <= a.date_demontage)
      )
  )
$$;

COMMENT ON FUNCTION public.can_saisie_on_affaire(uuid, date) IS
  'v0.21 Bloc 4 — Option B : saisies heures autorisees si affaire ouverte ou si terminee et date <= date_demontage. Annule = toujours refus (sauf admin cote applicatif).';

-- 3. Renforcement des RLS heures_saisies pour respecter Option B
-- (admin override conserve via is_admin())

DROP POLICY IF EXISTS heures_saisies_self_insert ON public.heures_saisies;
CREATE POLICY heures_saisies_self_insert
ON public.heures_saisies
FOR INSERT
TO authenticated
WITH CHECK (
  is_admin()
  OR (
    (
      is_chef_or_admin()
      OR employe_id IN (SELECT id FROM public.employes WHERE profile_id = auth.uid())
    )
    AND public.can_saisie_on_affaire(affaire_id, date)
  )
);

-- 4. Trigger BEFORE INSERT/UPDATE sur assignations : bloque si affaire fermee
-- (le trigger check_affaire_open_for_assignation existe deja mais ne controlait que
-- certains cas. On garde ce comportement, juste assure d'etre present.)
-- Verification : la fonction existe deja, on ne touche pas.

-- 5. Index pour accelerer is_affaire_open / can_saisie_on_affaire
CREATE INDEX IF NOT EXISTS idx_affaires_statut ON public.affaires(statut);
