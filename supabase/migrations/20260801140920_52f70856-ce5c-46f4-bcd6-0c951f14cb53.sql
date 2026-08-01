-- LOT 0 — Fondations MVP Management (idempotent, ADR-004)

-- 1. Typologie : 6XXX = fabrication (miroir strict de src/lib/affaire-typologie.ts)
CREATE OR REPLACE FUNCTION public.compute_affaire_typologie(num text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE
  trimmed text;
  first_char text;
BEGIN
  IF num IS NULL THEN
    RETURN NULL;
  END IF;

  trimmed := trim(num);
  IF length(trimmed) = 0 THEN
    RETURN NULL;
  END IF;

  first_char := substring(trimmed FROM 1 FOR 1);

  -- Codes 5 chiffres commençant par 2 -> stockage (ex: 2XXXX)
  IF length(trimmed) = 5 AND first_char = '2' THEN
    RETURN 'stockage';
  END IF;

  -- Codes 4 chiffres : routing par premier chiffre
  IF length(trimmed) = 4 THEN
    CASE first_char
      WHEN '1' THEN RETURN 'non_operationnel';
      WHEN '3' THEN RETURN 'non_operationnel';
      WHEN '4' THEN RETURN 'montage_demontage';
      WHEN '5' THEN RETURN 'fabrication';
      WHEN '6' THEN RETURN 'fabrication';
      WHEN '9' THEN RETURN 'prototype';
      ELSE RETURN NULL;
    END CASE;
  END IF;

  RETURN NULL;
END;
$function$;

-- Recréation de la colonne générée pour recalculer les valeurs stockées
DROP VIEW IF EXISTS public.v_affaires_avec_plan_status;
DROP INDEX IF EXISTS public.idx_affaires_typologie;
ALTER TABLE public.affaires DROP COLUMN IF EXISTS typologie;
ALTER TABLE public.affaires
  ADD COLUMN IF NOT EXISTS typologie text
  GENERATED ALWAYS AS (public.compute_affaire_typologie(numero)) STORED;
CREATE INDEX IF NOT EXISTS idx_affaires_typologie ON public.affaires USING btree (typologie);

CREATE VIEW public.v_affaires_avec_plan_status
WITH (security_invoker = true) AS
SELECT
  a.id, a.numero, a.nom, a.client, a.lieu, a.statut, a.date_debut, a.date_fin_prevue,
  a.chef_chantier_id, a.notes, a.created_at, a.updated_at, a.date_montage, a.date_demontage,
  a.phase, a.code_opportunite, a.statut_opportunite, a.charge_affaires_id, a.taille,
  a.date_opportunite, a.signed_at, a.chef_projet_id, a.heures_prevues_montage,
  a.heures_prevues_demontage, a.typologie, a.responsable_montage_id, a.responsable_demontage_id,
  a.date_pat, a.typologie_future,
  COALESCE(
    (SELECT 'published'::text FROM public.staffing_plan p WHERE p.affaire_id = a.id AND p.status = 'published' LIMIT 1),
    (SELECT 'outdated'::text  FROM public.staffing_plan p WHERE p.affaire_id = a.id AND p.status = 'outdated'  LIMIT 1),
    (SELECT 'draft'::text     FROM public.staffing_plan p WHERE p.affaire_id = a.id AND p.status = 'draft'     LIMIT 1),
    'no_plan'::text
  ) AS plan_status,
  (SELECT max(p.published_at) FROM public.staffing_plan p WHERE p.affaire_id = a.id AND p.status = 'published') AS plan_published_at,
  (SELECT count(*)::integer FROM public.staffing_plan p WHERE p.affaire_id = a.id) AS plan_count
FROM public.affaires a;

GRANT SELECT ON public.v_affaires_avec_plan_status TO authenticated;
GRANT SELECT ON public.v_affaires_avec_plan_status TO anon;
GRANT ALL ON public.v_affaires_avec_plan_status TO service_role;

-- 2. next_affaire_numero : support du préfixe 6
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

  IF _prefix NOT IN (5, 6, 9) THEN
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

-- 3. sign_opportunite : 9XXX -> 6XXX
CREATE OR REPLACE FUNCTION public.sign_opportunite(_affaire_id uuid)
RETURNS TABLE(affaire_id uuid, ancien_numero text, nouveau_numero text, signed_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current_numero text;
  v_new_numero_int integer;
  v_new_numero text;
  v_signed_at timestamptz := now();
BEGIN
  IF NOT public.user_has_cap('action.sign_opportunite') THEN
    RAISE EXCEPTION 'forbidden: action.sign_opportunite required';
  END IF;

  PERFORM 1 FROM public.affaires
  WHERE id = _affaire_id AND phase = 'opportunite'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'opportunite not found or already signed: %', _affaire_id;
  END IF;

  SELECT numero INTO v_current_numero
  FROM public.affaires WHERE id = _affaire_id;

  PERFORM pg_advisory_xact_lock(hashtext('sign_opportunite_6xxx'));

  SELECT COALESCE(MAX(numero::int), 5999) + 1
    INTO v_new_numero_int
  FROM public.affaires
  WHERE numero ~ '^6[0-9]{3}$';

  IF v_new_numero_int > 6999 THEN
    RAISE EXCEPTION 'numero 6XXX overflow — max 6999 atteint';
  END IF;

  v_new_numero := v_new_numero_int::text;

  UPDATE public.affaires
  SET phase = 'signe',
      numero = v_new_numero,
      signed_at = v_signed_at,
      statut_opportunite = NULL
  WHERE id = _affaire_id;

  UPDATE public.opportunite_jalons
  SET date_atteinte = v_signed_at::date
  WHERE opportunite_jalons.affaire_id = _affaire_id AND etape = 'signature';

  INSERT INTO public.opportunite_actions (affaire_id, type, date, auteur_id, texte)
  VALUES (
    _affaire_id, 'autre', v_signed_at, auth.uid(),
    'Opportunité signée — code ' || v_current_numero || ' → ' || v_new_numero
  );

  RETURN QUERY SELECT _affaire_id, v_current_numero, v_new_numero, v_signed_at;
END;
$function$;

-- 4. Libellés métiers alignés terrain
UPDATE public.metiers SET libelle = 'Bureau d''étude' WHERE code = 'suivi_projet';

-- 5. Capacité journalière par métier
ALTER TABLE public.metiers ADD COLUMN IF NOT EXISTS capacite_jour smallint;

UPDATE public.metiers SET capacite_jour = 20 WHERE code = 'construction';
UPDATE public.metiers SET capacite_jour = 10 WHERE code = 'peinture';
UPDATE public.metiers SET capacite_jour = 10 WHERE code = 'logistique';
UPDATE public.metiers SET capacite_jour = 6  WHERE code = 'metallerie';
UPDATE public.metiers SET capacite_jour = 4  WHERE code = 'tapisserie';
UPDATE public.metiers SET capacite_jour = 2  WHERE code = 'suivi_projet';
UPDATE public.metiers SET capacite_jour = 1  WHERE code = 'numerique';
UPDATE public.metiers SET capacite_jour = NULL WHERE code IN ('machiniste', 'impression_uv');