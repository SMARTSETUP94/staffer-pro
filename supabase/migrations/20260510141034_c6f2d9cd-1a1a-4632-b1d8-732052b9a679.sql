CREATE TABLE IF NOT EXISTS public.contrat_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL,
  contenu_html TEXT NOT NULL,
  version_int INTEGER NOT NULL,
  actif BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contrat_templates_version_positive CHECK (version_int > 0),
  CONSTRAINT contrat_templates_nom_not_blank CHECK (length(trim(nom)) > 0),
  CONSTRAINT contrat_templates_contenu_not_blank CHECK (length(trim(contenu_html)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS contrat_templates_version_unique
  ON public.contrat_templates(version_int);

CREATE UNIQUE INDEX IF NOT EXISTS contrat_templates_one_active
  ON public.contrat_templates((actif))
  WHERE actif IS TRUE;

CREATE INDEX IF NOT EXISTS idx_contrat_templates_actif
  ON public.contrat_templates(actif, version_int DESC);

ALTER TABLE public.contrat_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contrat_templates_select_authenticated ON public.contrat_templates;
CREATE POLICY contrat_templates_select_authenticated
  ON public.contrat_templates FOR SELECT TO authenticated
  USING (actif IS TRUE OR public.is_admin());

DROP POLICY IF EXISTS contrat_templates_insert_admin ON public.contrat_templates;
CREATE POLICY contrat_templates_insert_admin
  ON public.contrat_templates FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS contrat_templates_update_admin ON public.contrat_templates;
CREATE POLICY contrat_templates_update_admin
  ON public.contrat_templates FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS contrat_templates_delete_admin ON public.contrat_templates;
CREATE POLICY contrat_templates_delete_admin
  ON public.contrat_templates FOR DELETE TO authenticated
  USING (public.is_admin());

DROP TRIGGER IF EXISTS set_updated_at_contrat_templates ON public.contrat_templates;
CREATE TRIGGER set_updated_at_contrat_templates
  BEFORE UPDATE ON public.contrat_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.contrat_templates (nom, contenu_html, version_int, actif, created_by)
SELECT
  'Template contrat intermittent — version initiale',
  '<h2>Conditions générales</h2><p>Le présent contrat à durée déterminée d''usage (CDDU) est conclu en application des articles L.1242-2 3° et D.1242-1 du Code du Travail relatifs aux secteurs d''activité dans lesquels il est d''usage constant de ne pas recourir au contrat à durée indéterminée.</p><p>Le salarié reconnaît avoir pris connaissance des conditions générales d''emploi de Setup Paris et s''engage à respecter le règlement intérieur en vigueur.</p><p>La signature électronique apposée par les deux parties vaut consentement au sens de l''article 1367 du Code Civil. Un horodatage, une adresse IP, un user-agent et un hash cryptographique SHA-256 sont conservés à des fins probatoires.</p>',
  1,
  true,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.contrat_templates);

ALTER TABLE public.contrats_intermittents
  ADD COLUMN IF NOT EXISTS template_version_id UUID REFERENCES public.contrat_templates(id) ON DELETE RESTRICT;

UPDATE public.contrats_intermittents ci
SET template_version_id = ct.id
FROM public.contrat_templates ct
WHERE ci.template_version_id IS NULL
  AND ct.actif IS TRUE;

CREATE INDEX IF NOT EXISTS idx_contrats_intermittents_template_version
  ON public.contrats_intermittents(template_version_id);

CREATE OR REPLACE FUNCTION public.set_single_active_contrat_template()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.actif IS TRUE THEN
    UPDATE public.contrat_templates
    SET actif = false, updated_at = now()
    WHERE id <> NEW.id AND actif IS TRUE;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_single_active_contrat_template ON public.contrat_templates;
CREATE TRIGGER ensure_single_active_contrat_template
  BEFORE INSERT OR UPDATE OF actif ON public.contrat_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_single_active_contrat_template();

CREATE OR REPLACE FUNCTION public.get_active_contrat_template_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.contrat_templates
  WHERE actif IS TRUE
  ORDER BY version_int DESC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.activate_contrat_template(p_template_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.contrat_templates WHERE id = p_template_id) THEN
    RAISE EXCEPTION 'Template introuvable';
  END IF;

  UPDATE public.contrat_templates SET actif = false WHERE actif IS TRUE;
  UPDATE public.contrat_templates SET actif = true, updated_at = now() WHERE id = p_template_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_contrat_template_version(
  p_nom text,
  p_contenu_html text,
  p_actif boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_next_version integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  IF length(trim(coalesce(p_nom, ''))) = 0 THEN
    RAISE EXCEPTION 'Nom du template obligatoire';
  END IF;

  IF length(trim(coalesce(p_contenu_html, ''))) = 0 THEN
    RAISE EXCEPTION 'Contenu du template obligatoire';
  END IF;

  SELECT coalesce(max(version_int), 0) + 1 INTO v_next_version
  FROM public.contrat_templates;

  IF p_actif IS TRUE THEN
    UPDATE public.contrat_templates SET actif = false WHERE actif IS TRUE;
  END IF;

  INSERT INTO public.contrat_templates (nom, contenu_html, version_int, actif, created_by)
  VALUES (trim(p_nom), p_contenu_html, v_next_version, coalesce(p_actif, false), auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

DROP FUNCTION IF EXISTS public.create_contrat_intermittent(UUID,UUID,UUID,DATE,DATE,NUMERIC);
CREATE OR REPLACE FUNCTION public.create_contrat_intermittent(
  _employee_id UUID,
  _chantier_id UUID,
  _staffing_id UUID,
  _date_debut DATE,
  _date_fin DATE,
  _heures_estimees NUMERIC DEFAULT NULL
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
    statut, created_by, template_version_id
  ) VALUES (
    _employee_id, _chantier_id, _staffing_id,
    _date_debut, _date_fin, _taux, COALESCE(_forfait,false), _heures_estimees,
    'a_signer_employe', auth.uid(), _active_template_id
  )
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.activate_contrat_template(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_contrat_template_version(text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_contrat_template_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_contrat_intermittent(UUID,UUID,UUID,DATE,DATE,NUMERIC) TO authenticated;