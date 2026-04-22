
-- ============================================================
-- A1 : Drop doublon UNIQUE sur affaires.numero
-- ============================================================
ALTER TABLE public.affaires DROP CONSTRAINT IF EXISTS affaires_numero_unique;

-- ============================================================
-- M2 : Restreindre next_affaire_numero aux chefs/admins
-- ============================================================
CREATE OR REPLACE FUNCTION public.next_affaire_numero(_prefix integer)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _min int;
  _max int;
  _next int;
BEGIN
  IF NOT public.is_chef_or_admin() THEN
    RAISE EXCEPTION 'Action réservée aux chefs et admins.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _prefix NOT IN (5, 9) THEN
    RAISE EXCEPTION 'Préfixe non supporté: %', _prefix;
  END IF;
  _min := _prefix * 1000;
  _max := _min + 999;

  SELECT COALESCE(MAX(numero::int), _min - 1) + 1
    INTO _next
    FROM public.affaires
   WHERE numero ~ '^[0-9]{4}$'
     AND numero::int BETWEEN _min AND _max;

  IF _next > _max THEN
    RAISE EXCEPTION 'Plage % épuisée.', _prefix;
  END IF;

  RETURN _next::text;
END;
$function$;

-- ============================================================
-- A2 / M3 : Aligner policy heures_saisies_self_update (USING + CHECK)
-- ============================================================
DROP POLICY IF EXISTS heures_saisies_self_update ON public.heures_saisies;

CREATE POLICY heures_saisies_self_update ON public.heures_saisies
  FOR UPDATE
  TO authenticated
  USING (
    is_admin()
    OR (is_chef_or_admin() AND ((devis_id IS NULL) OR (NOT is_devis_termine(devis_id))))
    OR (
      employe_id IN (SELECT employes.id FROM employes WHERE employes.profile_id = auth.uid())
      -- allow employee to edit drafts and submit them (trigger guard_heures_saisies_transition validates the actual transition)
      AND statut = ANY (ARRAY['brouillon'::heures_statut, 'soumis'::heures_statut])
      AND ((devis_id IS NULL) OR (NOT is_devis_termine(devis_id)))
    )
  )
  WITH CHECK (
    is_admin()
    OR (is_chef_or_admin() AND ((devis_id IS NULL) OR (NOT is_devis_termine(devis_id))))
    OR (
      employe_id IN (SELECT employes.id FROM employes WHERE employes.profile_id = auth.uid())
      AND statut = ANY (ARRAY['brouillon'::heures_statut, 'soumis'::heures_statut])
      AND ((devis_id IS NULL) OR (NOT is_devis_termine(devis_id)))
    )
  );

-- ============================================================
-- M1 : Vue v_vehicules_public (colonnes safe pour livreurs)
-- ============================================================
CREATE OR REPLACE VIEW public.v_vehicules_public
WITH (security_invoker = true)
AS
SELECT
  id,
  nom,
  type,
  immatriculation,
  marque,
  modele,
  permis_requis,
  capacite_passagers,
  poids_max_kg,
  volume_m3,
  proprietaire,
  actif,
  date_debut_location,
  date_fin_location,
  date_controle_technique,
  date_prochaine_revision,
  date_expiration_assurance,
  notes,
  created_at,
  updated_at
FROM public.vehicules;

COMMENT ON VIEW public.v_vehicules_public IS
  'Vue publique des véhicules sans données financières / contractuelles sensibles (cout_journalier_eur, prestataire_location, reference_contrat, fournisseur_location). Utilisée côté livreur. Chefs/admins lisent directement la table vehicules.';

GRANT SELECT ON public.v_vehicules_public TO authenticated;

-- ============================================================
-- M4 : Vue v_feedbacks_public (sans notes_admin / resolved_by)
-- ============================================================
CREATE OR REPLACE VIEW public.v_feedbacks_public
WITH (security_invoker = true)
AS
SELECT
  id,
  author_id,
  type,
  titre,
  description,
  page_url,
  user_agent,
  screenshot_path,
  priorite,
  statut,
  resolved_at,
  created_at,
  updated_at
FROM public.feedbacks;

COMMENT ON VIEW public.v_feedbacks_public IS
  'Vue publique des feedbacks sans notes_admin ni resolved_by (annotations internes admin). Utilisée par les chefs auteurs pour suivre leurs propres signalements. Admin lit la table feedbacks complète.';

GRANT SELECT ON public.v_feedbacks_public TO authenticated;

-- ============================================================
-- M5 : Option Z — Planning partagé par chantier (assignations)
-- Un employé voit ses propres assignations + toutes celles des chantiers
-- où il est lui-même staffé.
-- ============================================================
DROP POLICY IF EXISTS assignations_select_self_or_chef ON public.assignations;

CREATE POLICY assignations_select_self_or_chef ON public.assignations
  FOR SELECT
  TO authenticated
  USING (
    is_chef_or_admin()
    -- ses propres assignations
    OR employe_id IN (SELECT id FROM employes WHERE profile_id = auth.uid())
    -- toutes les assignations d'une affaire sur laquelle l'employé est lui-même staffé
    OR EXISTS (
      SELECT 1
      FROM public.assignations a2
      JOIN public.employes e ON e.id = a2.employe_id
      WHERE a2.affaire_id = assignations.affaire_id
        AND e.profile_id = auth.uid()
    )
  );

-- M5 bis : heures_saisies — visibilité collègues d'un même chantier
DROP POLICY IF EXISTS heures_saisies_self_select ON public.heures_saisies;

CREATE POLICY heures_saisies_self_select ON public.heures_saisies
  FOR SELECT
  TO authenticated
  USING (
    is_chef_or_admin()
    OR employe_id IN (SELECT id FROM employes WHERE profile_id = auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.assignations a2
      JOIN public.employes e ON e.id = a2.employe_id
      WHERE a2.affaire_id = heures_saisies.affaire_id
        AND e.profile_id = auth.uid()
    )
  );

-- M5 ter : affaire_commentaires — visibilité pour staffés du chantier
DROP POLICY IF EXISTS affaire_commentaires_select_chef_admin_or_mentioned ON public.affaire_commentaires;

CREATE POLICY affaire_commentaires_select_chef_admin_or_mentioned ON public.affaire_commentaires
  FOR SELECT
  TO authenticated
  USING (
    is_chef_or_admin()
    OR auth.uid() = ANY (mentions)
    OR EXISTS (
      SELECT 1
      FROM public.assignations a
      JOIN public.employes e ON e.id = a.employe_id
      WHERE a.affaire_id = affaire_commentaires.affaire_id
        AND e.profile_id = auth.uid()
    )
  );

-- ============================================================
-- M6 : Affaires accessibles si mentionné dans un commentaire
-- ============================================================
DROP POLICY IF EXISTS affaires_select_chef_admin_or_assigned ON public.affaires;

CREATE POLICY affaires_select_chef_admin_or_assigned ON public.affaires
  FOR SELECT
  TO authenticated
  USING (
    is_chef_or_admin()
    OR EXISTS (
      SELECT 1
      FROM public.assignations a
      JOIN public.employes e ON e.id = a.employe_id
      WHERE a.affaire_id = affaires.id
        AND e.profile_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.affaire_commentaires c
      WHERE c.affaire_id = affaires.id
        AND auth.uid() = ANY (c.mentions)
    )
  );

-- ============================================================
-- F1 / F2 : Documenter les ouvertures intentionnelles
-- ============================================================
COMMENT ON POLICY adresses_favorites_select_authenticated ON public.adresses_favorites IS
  'intentional: shared logistics reference accessible to all authenticated users';

COMMENT ON POLICY vca_select_authenticated ON public.vehicule_chauffeurs_autorises IS
  'intentional: shared driver authorization reference accessible to all authenticated users (needed to check who can drive which truck)';
