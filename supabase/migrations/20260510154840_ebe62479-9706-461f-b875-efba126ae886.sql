ALTER TABLE public.contrats_intermittents
  ADD COLUMN IF NOT EXISTS poste TEXT NOT NULL DEFAULT 'Technicien de plateau';

COMMENT ON COLUMN public.contrats_intermittents.poste IS
  'Poste/qualité du salarié pour ce contrat. Default Technicien de plateau pour rétrocompat.';

DROP FUNCTION IF EXISTS public.create_contrat_intermittent(UUID,UUID,UUID,DATE,DATE,NUMERIC);
CREATE OR REPLACE FUNCTION public.create_contrat_intermittent(
  _employee_id UUID,
  _chantier_id UUID,
  _staffing_id UUID,
  _date_debut DATE,
  _date_fin DATE,
  _heures_estimees NUMERIC DEFAULT NULL,
  _poste TEXT DEFAULT 'Technicien de plateau'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
  _statut_emp TEXT;
  _taux NUMERIC;
  _forfait BOOLEAN;
  _active_template_id UUID;
BEGIN
  IF NOT is_admin() AND NOT is_chef_or_admin() THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;

  SELECT statut_contrat, taux_horaire_brut, forfait
    INTO _statut_emp, _taux, _forfait
  FROM public.employes WHERE id = _employee_id;

  IF _statut_emp IS NULL OR _statut_emp NOT IN ('CDDU intermittent','CDD chantier','Intérim') THEN
    RETURN NULL;
  END IF;

  SELECT public.get_active_contrat_template_id() INTO _active_template_id;

  INSERT INTO public.contrats_intermittents (
    employee_id, chantier_id, staffing_id,
    date_debut, date_fin, taux_horaire_brut, forfait, heures_estimees,
    statut, created_by, template_version_id, poste
  ) VALUES (
    _employee_id, _chantier_id, _staffing_id,
    _date_debut, _date_fin, _taux, COALESCE(_forfait,false), _heures_estimees,
    'a_signer_employe', auth.uid(), _active_template_id, COALESCE(_poste, 'Technicien de plateau')
  )
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_contrat_intermittent(UUID,UUID,UUID,DATE,DATE,NUMERIC,TEXT) TO authenticated;