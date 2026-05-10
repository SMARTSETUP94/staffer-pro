-- 1) Nouveau champ pérenne sur l'employé
ALTER TABLE public.employes
  ADD COLUMN IF NOT EXISTS poste_principal TEXT;

COMMENT ON COLUMN public.employes.poste_principal IS
  'Poste contractuel pérenne (ex: Machiniste, Constructeur). Utilisé comme placeholder {{poste}} dans la génération PDF des contrats. NULL = fallback "Technicien de plateau".';

-- 2) On supprime le poste par contrat (devient inutile : le poste vient de l'employé)
ALTER TABLE public.contrats_intermittents
  DROP COLUMN IF EXISTS poste;

-- 3) Recréation de create_contrat_intermittent SANS _poste
DROP FUNCTION IF EXISTS public.create_contrat_intermittent(UUID,UUID,UUID,DATE,DATE,NUMERIC,TEXT);
DROP FUNCTION IF EXISTS public.create_contrat_intermittent(UUID,UUID,UUID,DATE,DATE,NUMERIC);

CREATE OR REPLACE FUNCTION public.create_contrat_intermittent(
  _employee_id UUID,
  _staffing_id UUID,
  _chantier_id UUID,
  _date_debut DATE,
  _date_fin DATE,
  _heures_estimees NUMERIC
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _contrat_id UUID;
  _active_template_id UUID;
  _taux NUMERIC;
  _forfait BOOLEAN;
BEGIN
  IF NOT is_chef_or_admin() THEN
    RAISE EXCEPTION 'Réservé chef/admin';
  END IF;

  SELECT id INTO _active_template_id
  FROM contrat_templates
  WHERE actif IS TRUE
  ORDER BY version_int DESC
  LIMIT 1;

  SELECT taux_horaire_brut, forfait INTO _taux, _forfait
  FROM employes WHERE id = _employee_id;

  INSERT INTO contrats_intermittents (
    employee_id, staffing_id, chantier_id, date_debut, date_fin,
    heures_estimees, taux_horaire_brut, forfait,
    statut, created_by, template_version_id
  ) VALUES (
    _employee_id, _staffing_id, _chantier_id, _date_debut, _date_fin,
    _heures_estimees, _taux, COALESCE(_forfait, false),
    'a_signer_employe', auth.uid(), _active_template_id
  )
  RETURNING id INTO _contrat_id;

  RETURN _contrat_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_contrat_intermittent(UUID,UUID,UUID,DATE,DATE,NUMERIC) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_contrat_intermittent(UUID,UUID,UUID,DATE,DATE,NUMERIC) TO authenticated;

-- 4) Recréation de staffer_mobile_create_mission SANS _poste
DROP FUNCTION IF EXISTS public.staffer_mobile_create_mission(uuid, uuid, integer, date, date, text, text);
DROP FUNCTION IF EXISTS public.staffer_mobile_create_mission(uuid, uuid, integer, date, date, text);

CREATE OR REPLACE FUNCTION public.staffer_mobile_create_mission(
  _employee_id uuid,
  _chantier_id uuid,
  _metier_id integer,
  _date_debut date,
  _date_fin date,
  _slot text
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
  v_total_heures numeric := 0;
BEGIN
  IF NOT is_chef_or_admin() THEN
    RAISE EXCEPTION 'Réservé chef/admin';
  END IF;

  IF _date_debut > _date_fin THEN
    RAISE EXCEPTION 'Date de début postérieure à la date de fin';
  END IF;

  SELECT statut_contrat::text INTO v_statut_contrat
  FROM employes WHERE id = _employee_id;

  v_create_contrat := v_statut_contrat IN ('CDDU intermittent', 'CDD chantier', 'Intérim');

  v_d := _date_debut;
  WHILE v_d <= _date_fin LOOP
    v_dow := EXTRACT(DOW FROM v_d)::int;
    IF v_dow NOT IN (0, 6) THEN
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
    v_d := v_d + 1;
  END LOOP;

  IF v_create_contrat AND v_count_assigs > 0 THEN
    v_contrat_id := public.create_contrat_intermittent(
      _employee_id, NULL, _chantier_id, _date_debut, _date_fin, v_total_heures
    );
  END IF;

  RETURN jsonb_build_object(
    'assigs_count', v_count_assigs,
    'contrat_id', v_contrat_id,
    'requires_contract', v_create_contrat
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.staffer_mobile_create_mission(uuid, uuid, integer, date, date, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.staffer_mobile_create_mission(uuid, uuid, integer, date, date, text) TO authenticated;