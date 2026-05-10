
-- Drop ancienne signature pour éviter ambiguïté
DROP FUNCTION IF EXISTS public.create_contrat_intermittent(uuid, uuid, uuid, date, date, numeric);

CREATE OR REPLACE FUNCTION public.create_contrat_intermittent(
  _employee_id uuid,
  _chantier_id uuid,
  _date_debut date,
  _date_fin date,
  _heures_estimees numeric,
  _staffing_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contrat_id uuid;
  v_taux numeric;
  v_forfait boolean;
  v_profile uuid;
BEGIN
  IF NOT is_chef_or_admin() THEN
    RAISE EXCEPTION 'Réservé chef/admin';
  END IF;

  SELECT taux_horaire_brut, forfait, profile_id
    INTO v_taux, v_forfait, v_profile
  FROM employes WHERE id = _employee_id;

  INSERT INTO contrats_intermittents (
    employee_id, staffing_id, chantier_id, date_debut, date_fin,
    taux_horaire_brut, forfait, heures_estimees, statut, created_by
  ) VALUES (
    _employee_id, _staffing_id, _chantier_id, _date_debut, _date_fin,
    v_taux, COALESCE(v_forfait, false), _heures_estimees,
    'a_signer_employe', auth.uid()
  )
  RETURNING id INTO v_contrat_id;

  -- Notif employé
  IF v_profile IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, titre, message, lien, metadata)
    VALUES (
      v_profile,
      'system'::notification_type,
      'Nouveau contrat à signer',
      'Un contrat intermittent vous attend pour signature.',
      '/mobile/contrats',
      jsonb_build_object('contrat_id', v_contrat_id)
    );
  END IF;

  RETURN v_contrat_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_contrat_intermittent(uuid, uuid, date, date, numeric, uuid) TO authenticated;

-- ============================================================
-- RPC : staffer_mobile_create_mission
-- Crée N assignations (jours ouvrés, hors absences validées) + contrat si éligible
-- ============================================================
CREATE OR REPLACE FUNCTION public.staffer_mobile_create_mission(
  _employee_id uuid,
  _chantier_id uuid,
  _metier_id integer,
  _date_debut date,
  _date_fin date,
  _slot text  -- 'matin' | 'apres_midi' | 'journee'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_d date;
  v_count_assigs integer := 0;
  v_dow integer;
  v_has_absence boolean;
  v_create_contrat boolean := false;
  v_statut_contrat text;
  v_contrat_id uuid := NULL;
  v_profile uuid;
  v_total_heures numeric := 0;
BEGIN
  IF NOT is_chef_or_admin() THEN
    RAISE EXCEPTION 'Réservé chef/admin';
  END IF;

  IF _date_debut > _date_fin THEN
    RAISE EXCEPTION 'Date de début postérieure à la date de fin';
  END IF;

  SELECT statut_contrat::text, profile_id INTO v_statut_contrat, v_profile
  FROM employes WHERE id = _employee_id;

  -- Eligibilité contrat
  v_create_contrat := v_statut_contrat IN ('CDDU intermittent', 'CDD chantier', 'Intérim');

  -- Boucle jours ouvrés
  v_d := _date_debut;
  WHILE v_d <= _date_fin LOOP
    v_dow := EXTRACT(DOW FROM v_d)::int;  -- 0=dim, 6=sam
    IF v_dow NOT IN (0, 6) THEN
      -- Vérif absence validée chevauchante
      SELECT EXISTS(
        SELECT 1 FROM absences a
        WHERE a.employe_id = _employee_id
          AND a.valide = true
          AND v_d BETWEEN a.date_debut AND a.date_fin
      ) INTO v_has_absence;

      IF NOT v_has_absence THEN
        IF _slot = 'journee' THEN
          INSERT INTO assignations (affaire_id, employe_id, metier_id, date, demi_journee, heures, type_operation, created_by)
          VALUES (_chantier_id, _employee_id, _metier_id, v_d, 'AM', 4, 'mission', auth.uid());
          INSERT INTO assignations (affaire_id, employe_id, metier_id, date, demi_journee, heures, type_operation, created_by)
          VALUES (_chantier_id, _employee_id, _metier_id, v_d, 'PM', 4, 'mission', auth.uid());
          v_count_assigs := v_count_assigs + 2;
          v_total_heures := v_total_heures + 8;
        ELSIF _slot = 'matin' THEN
          INSERT INTO assignations (affaire_id, employe_id, metier_id, date, demi_journee, heures, type_operation, created_by)
          VALUES (_chantier_id, _employee_id, _metier_id, v_d, 'AM', 4, 'mission', auth.uid());
          v_count_assigs := v_count_assigs + 1;
          v_total_heures := v_total_heures + 4;
        ELSIF _slot = 'apres_midi' THEN
          INSERT INTO assignations (affaire_id, employe_id, metier_id, date, demi_journee, heures, type_operation, created_by)
          VALUES (_chantier_id, _employee_id, _metier_id, v_d, 'PM', 4, 'mission', auth.uid());
          v_count_assigs := v_count_assigs + 1;
          v_total_heures := v_total_heures + 4;
        END IF;
      END IF;
    END IF;
    v_d := v_d + INTERVAL '1 day';
  END LOOP;

  -- Création contrat si éligible
  IF v_create_contrat AND v_count_assigs > 0 THEN
    v_contrat_id := public.create_contrat_intermittent(
      _employee_id, _chantier_id, _date_debut, _date_fin, v_total_heures, NULL
    );
  END IF;

  RETURN jsonb_build_object(
    'assignations_count', v_count_assigs,
    'total_heures', v_total_heures,
    'contrat_id', v_contrat_id,
    'requires_contract', v_create_contrat
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.staffer_mobile_create_mission(uuid, uuid, integer, date, date, text) TO authenticated;
