-- 1) Table catalogue postes
CREATE TABLE IF NOT EXISTS public.postes_catalogue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  libelle TEXT NOT NULL UNIQUE,
  ordre INT NOT NULL DEFAULT 100,
  actif BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.postes_catalogue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "postes_select_all_auth" ON public.postes_catalogue
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "postes_admin_chef_insert" ON public.postes_catalogue
  FOR INSERT TO authenticated WITH CHECK (public.is_chef_or_admin());

CREATE POLICY "postes_admin_chef_update" ON public.postes_catalogue
  FOR UPDATE TO authenticated USING (public.is_chef_or_admin()) WITH CHECK (public.is_chef_or_admin());

CREATE POLICY "postes_admin_chef_delete" ON public.postes_catalogue
  FOR DELETE TO authenticated USING (public.is_chef_or_admin());

CREATE TRIGGER trg_postes_updated_at
  BEFORE UPDATE ON public.postes_catalogue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Seed initial
INSERT INTO public.postes_catalogue (libelle, ordre) VALUES
  ('Tapissier', 10),
  ('Serrurier', 20),
  ('Technicien de plateau', 30),
  ('Décorateur', 40),
  ('Dessinateur', 50),
  ('Chef constructeur de décors', 60),
  ('Chauffeur', 70),
  ('Menuisier de décors', 80)
ON CONFLICT (libelle) DO NOTHING;

-- 3) Étend staffer_mobile_create_mission avec _poste
DROP FUNCTION IF EXISTS public.staffer_mobile_create_mission(uuid, uuid, integer, date, date, text);

CREATE OR REPLACE FUNCTION public.staffer_mobile_create_mission(
  _employee_id uuid,
  _chantier_id uuid,
  _metier_id integer,
  _date_debut date,
  _date_fin date,
  _slot text,
  _poste text DEFAULT NULL
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
    v_d := v_d + INTERVAL '1 day';
  END LOOP;

  IF v_create_contrat AND v_count_assigs > 0 THEN
    v_contrat_id := public.create_contrat_intermittent(
      _employee_id, _chantier_id, NULL::uuid, _date_debut, _date_fin, v_total_heures,
      COALESCE(NULLIF(TRIM(_poste), ''), 'Technicien de plateau')
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

GRANT EXECUTE ON FUNCTION public.staffer_mobile_create_mission(uuid, uuid, integer, date, date, text, text) TO authenticated;