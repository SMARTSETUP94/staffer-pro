-- ============================================================
-- v0.17 — Module CRM Opportunités (extension table affaires)
-- ============================================================

-- 1. ENUMS
CREATE TYPE public.affaire_phase AS ENUM ('opportunite', 'signe');

CREATE TYPE public.opportunite_statut AS ENUM (
  'a_faire',
  'envoye',
  'gagne',
  'perdu',
  'termine'
);

CREATE TYPE public.opportunite_taille AS ENUM (
  'tres_petit',  -- < 1k€
  'petit',       -- < 10k€
  'moyen',       -- < 25k€
  'gros',        -- < 50k€
  'tres_gros'    -- >= 50k€
);

-- 2. EXTENSION TABLE affaires
ALTER TABLE public.affaires
  ADD COLUMN phase public.affaire_phase NOT NULL DEFAULT 'signe',
  ADD COLUMN code_opportunite text,
  ADD COLUMN statut_opportunite public.opportunite_statut,
  ADD COLUMN charge_affaires_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN taille public.opportunite_taille,
  ADD COLUMN date_opportunite date,
  ADD COLUMN signed_at timestamptz;

-- 3. CONTRAINTES
-- Unicité du numéro (un code 9XXX ou 5XXX ne peut exister qu'une fois)
ALTER TABLE public.affaires ADD CONSTRAINT affaires_numero_unique UNIQUE (numero);

-- Format numérique souple : 4-5 chiffres OU patterns legacy déjà en base
ALTER TABLE public.affaires ADD CONSTRAINT affaires_numero_format CHECK (
  numero ~ '^[0-9]{4,5}$'
  OR numero ~ '^[0-9]{4}-[0-9]{3}$'  -- ex 2026-018
  OR numero ~ '^[A-Z]{3,}-[A-Z0-9-]+$' -- ex AFF-E2E-001
);

-- Format code_opportunite (9XXX = opportunité originale, gardée pour traçabilité)
ALTER TABLE public.affaires ADD CONSTRAINT affaires_code_opportunite_format CHECK (
  code_opportunite IS NULL OR code_opportunite ~ '^9[0-9]{3}$'
);

-- Cohérence : statut_opportunite uniquement si phase='opportunite'
-- Une opportunité DOIT avoir un statut, une affaire signée NE DOIT PAS en avoir
ALTER TABLE public.affaires ADD CONSTRAINT affaires_phase_statut_coherence CHECK (
  (phase = 'opportunite' AND statut_opportunite IS NOT NULL)
  OR (phase = 'signe' AND statut_opportunite IS NULL)
);

-- Code opportunité : format 9XXX si phase='opportunite' (le numero EST le code 9XXX)
ALTER TABLE public.affaires ADD CONSTRAINT affaires_phase_numero_coherence CHECK (
  phase <> 'opportunite' OR numero ~ '^9[0-9]{3}$'
);

-- 4. INDEX
CREATE INDEX idx_affaires_phase ON public.affaires(phase);
CREATE INDEX idx_affaires_statut_opportunite ON public.affaires(statut_opportunite) WHERE phase = 'opportunite';
CREATE INDEX idx_affaires_charge_affaires ON public.affaires(charge_affaires_id);
CREATE INDEX idx_affaires_date_opportunite ON public.affaires(date_opportunite) WHERE phase = 'opportunite';
CREATE INDEX idx_affaires_code_opportunite ON public.affaires(code_opportunite) WHERE code_opportunite IS NOT NULL;

-- 5. TRIGGER : auto-fill signed_at lors de la conversion 9XXX → 5XXX
CREATE OR REPLACE FUNCTION public.guard_affaire_signature()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.phase = 'opportunite'
     AND NEW.phase = 'signe' THEN
    NEW.signed_at := COALESCE(NEW.signed_at, now());
    NEW.statut_opportunite := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_affaire_signature
  BEFORE UPDATE ON public.affaires
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_affaire_signature();

-- 6. RPC : créer une nouvelle opportunité
CREATE OR REPLACE FUNCTION public.create_opportunite(
  _client text,
  _nom text,
  _code text,
  _charge_affaires_id uuid,
  _taille public.opportunite_taille,
  _date_opportunite date,
  _commentaires text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  IF NOT public.is_chef_or_admin() THEN
    RAISE EXCEPTION 'Action réservée aux chefs et admins.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _code !~ '^9[0-9]{3}$' THEN
    RAISE EXCEPTION 'Code opportunité invalide (attendu 9XXX). Reçu: %', _code USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.affaires (
    numero, nom, client, phase, statut_opportunite,
    charge_affaires_id, taille, date_opportunite, notes, statut
  )
  VALUES (
    _code,
    COALESCE(NULLIF(trim(_nom), ''), _client),
    _client,
    'opportunite',
    'a_faire',
    _charge_affaires_id,
    _taille,
    COALESCE(_date_opportunite, CURRENT_DATE),
    _commentaires,
    'prospect'
  )
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

-- 7. RPC : signer une opportunité (9XXX → 5XXX)
CREATE OR REPLACE FUNCTION public.sign_opportunite(
  _affaire_id uuid,
  _new_code text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _old_code text;
  _phase public.affaire_phase;
  _statut public.opportunite_statut;
BEGIN
  IF NOT public.is_chef_or_admin() THEN
    RAISE EXCEPTION 'Action réservée aux chefs et admins.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _new_code !~ '^5[0-9]{3}$' THEN
    RAISE EXCEPTION 'Code affaire invalide (attendu 5XXX). Reçu: %', _new_code USING ERRCODE = 'check_violation';
  END IF;

  SELECT numero, phase, statut_opportunite
    INTO _old_code, _phase, _statut
    FROM public.affaires
   WHERE id = _affaire_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Opportunité introuvable.' USING ERRCODE = 'no_data_found';
  END IF;

  IF _phase <> 'opportunite' THEN
    RAISE EXCEPTION 'Cette affaire n''est pas une opportunité (phase=%).', _phase USING ERRCODE = 'check_violation';
  END IF;

  IF _statut <> 'gagne' THEN
    RAISE EXCEPTION 'Seules les opportunités gagnées peuvent être signées.' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.affaires
     SET numero = _new_code,
         code_opportunite = _old_code,
         phase = 'signe',
         statut_opportunite = NULL,
         statut = 'en_cours',
         updated_at = now()
   WHERE id = _affaire_id;

  RETURN _affaire_id;
END;
$$;

-- 8. RPC : prochain numéro libre dans une plage
CREATE OR REPLACE FUNCTION public.next_affaire_numero(_prefix int)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _min int;
  _max int;
  _next int;
BEGIN
  -- _prefix=5 => plage 5000-5999, _prefix=9 => plage 9000-9999
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
$$;

-- 9. RLS : les opportunités suivent les mêmes règles que les affaires (déjà en place)
-- Pas de policy spécifique nécessaire — chefs/admins ont accès complet, employés voient
-- les affaires où ils sont assignés (n'arrive en pratique que sur staffing PROTO 9XXX).

COMMENT ON COLUMN public.affaires.phase IS 'opportunite (9XXX, prospect commercial) ou signe (5XXX, affaire en fabrication)';
COMMENT ON COLUMN public.affaires.code_opportunite IS 'Code 9XXX d''origine après conversion en 5XXX, pour reporting de conversion';
COMMENT ON COLUMN public.affaires.statut_opportunite IS 'Statut Kanban (uniquement si phase=opportunite)';
COMMENT ON COLUMN public.affaires.charge_affaires_id IS 'Profil du chargé d''affaires (CA) responsable du devis';
COMMENT ON COLUMN public.affaires.taille IS 'Fourchette de montant : tres_petit <1k€ / petit <10k€ / moyen <25k€ / gros <50k€ / tres_gros >=50k€';
COMMENT ON COLUMN public.affaires.date_opportunite IS 'Date de réception du brief client';
COMMENT ON COLUMN public.affaires.signed_at IS 'Date/heure de conversion 9XXX → 5XXX';