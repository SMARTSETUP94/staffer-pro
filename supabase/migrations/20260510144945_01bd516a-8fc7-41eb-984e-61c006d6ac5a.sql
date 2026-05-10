
-- Template contrat — schéma additif (contenu_json + notes), RPC v2, trigger auto template_version_id
ALTER TABLE public.contrat_templates
  ADD COLUMN IF NOT EXISTS contenu_json jsonb,
  ADD COLUMN IF NOT EXISTS notes text;

-- RPC v2 : ajoute contenu_json + notes (paramètres optionnels pour rétro-compat)
CREATE OR REPLACE FUNCTION public.create_contrat_template_version(
  p_nom text,
  p_contenu_html text,
  p_actif boolean DEFAULT false,
  p_contenu_json jsonb DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  INSERT INTO public.contrat_templates (nom, contenu_html, contenu_json, notes, version_int, actif, created_by)
  VALUES (trim(p_nom), p_contenu_html, p_contenu_json, p_notes, v_next_version, COALESCE(p_actif, false), auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

-- Trigger : auto-snapshot template_version_id à la création d'un contrat
CREATE OR REPLACE FUNCTION public.set_contrat_template_version_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.template_version_id IS NULL THEN
    SELECT id INTO NEW.template_version_id
    FROM public.contrat_templates
    WHERE actif IS TRUE
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_contrats_set_template_version ON public.contrats_intermittents;
CREATE TRIGGER trg_contrats_set_template_version
  BEFORE INSERT ON public.contrats_intermittents
  FOR EACH ROW EXECUTE FUNCTION public.set_contrat_template_version_id();
