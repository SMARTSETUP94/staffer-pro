-- Helper de résolution du contexte de saisie d'heures (Sprint A finalisation)
-- Retourne le niveau de rattachement le plus précis trouvé pour un (employé, affaire, date, objet?).
-- Niveau 3 (objet) > 2 (casting phase) > 1 (planifié) > 0 (hors).

-- Index manquant : lookup (employe, affaire, date) — utilisé par niveau 1
CREATE INDEX IF NOT EXISTS idx_assignations_emp_aff_date
  ON public.assignations (employe_id, affaire_id, date);

CREATE OR REPLACE FUNCTION public.resolve_saisie_heures(
  p_employe_id UUID,
  p_affaire_id UUID,
  p_date DATE,
  p_objet_id UUID DEFAULT NULL
)
RETURNS TABLE (
  niveau INTEGER,
  source TEXT,
  autorisee BOOLEAN,
  phase TEXT,
  role_terrain TEXT,
  objet_id UUID,
  details JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aff_phase_derivee TEXT;
BEGIN
  -- Niveau 3 : équipe objet fabrication (le plus précis)
  IF p_objet_id IS NOT NULL THEN
    RETURN QUERY
    SELECT
      3 AS niveau,
      'fabrication_objet_equipe'::TEXT AS source,
      TRUE AS autorisee,
      'fabrication'::TEXT AS phase,
      NULL::TEXT AS role_terrain,
      foe.objet_id,
      jsonb_build_object('foe_id', foe.id, 'added_at', foe.added_at) AS details
    FROM public.fabrication_objet_equipe foe
    WHERE foe.employe_id = p_employe_id
      AND foe.objet_id = p_objet_id
      AND foe.removed_at IS NULL
    LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  END IF;

  -- Niveau 2 : casting affaire (par phase)
  -- On préfère une ligne casting fraîche au plus proche de p_date, sinon n'importe.
  RETURN QUERY
  SELECT
    2 AS niveau,
    'affaire_equipe'::TEXT AS source,
    TRUE AS autorisee,
    ae.phase,
    ae.role_terrain,
    NULL::UUID AS objet_id,
    jsonb_build_object('ae_id', ae.id, 'added_at', ae.added_at) AS details
  FROM public.affaire_equipe ae
  WHERE ae.employe_id = p_employe_id
    AND ae.affaire_id = p_affaire_id
    AND ae.removed_at IS NULL
  ORDER BY ae.added_at DESC
  LIMIT 1;
  IF FOUND THEN RETURN; END IF;

  -- Niveau 1 : planifié ce jour-là (assignations)
  RETURN QUERY
  SELECT
    1 AS niveau,
    'assignations'::TEXT AS source,
    TRUE AS autorisee,
    a.phase,
    NULL::TEXT AS role_terrain,
    NULL::UUID AS objet_id,
    jsonb_build_object(
      'assignation_id', a.id,
      'demi_journee', a.demi_journee,
      'statut_confirmation', a.statut_confirmation
    ) AS details
  FROM public.assignations a
  WHERE a.employe_id = p_employe_id
    AND a.affaire_id = p_affaire_id
    AND a.date = p_date
    AND COALESCE(a.statut_confirmation::TEXT, 'en_attente') <> 'refusee'
  ORDER BY a.created_at DESC
  LIMIT 1;
  IF FOUND THEN RETURN; END IF;

  -- Niveau 0 : hors plan — saisie autorisée mais signalée (sera "hors planning")
  RETURN QUERY
  SELECT
    0 AS niveau,
    'hors'::TEXT AS source,
    TRUE AS autorisee,
    NULL::TEXT AS phase,
    NULL::TEXT AS role_terrain,
    NULL::UUID AS objet_id,
    jsonb_build_object('reason', 'no_attachment_found') AS details;
END;
$$;

COMMENT ON FUNCTION public.resolve_saisie_heures(UUID, UUID, DATE, UUID) IS
  'Sprint A — cascade niveau 3 (objet) > 2 (casting phase) > 1 (planifié) > 0 (hors). Retourne une seule ligne. Utilisé par la saisie d''heures (Sprint B) pour afficher un bandeau contextuel et hériter du métier/phase.';

GRANT EXECUTE ON FUNCTION public.resolve_saisie_heures(UUID, UUID, DATE, UUID) TO authenticated;