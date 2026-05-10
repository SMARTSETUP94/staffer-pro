
-- ============================================================
-- TOUR 1 — Module Contrats intermittents : fondations DB
-- ============================================================

-- 1. ENUMS
CREATE TYPE public.statut_contrat_type AS ENUM (
  'CDI',
  'CDDU intermittent',
  'CDD chantier',
  'Intérim',
  'Apprenti'
);

CREATE TYPE public.contrat_intermittent_statut AS ENUM (
  'a_signer_employe',
  'a_signer_employeur',
  'signe',
  'archive',
  'annule'
);

CREATE TYPE public.signataire_role AS ENUM (
  'employe',
  'employeur'
);

-- 2. AJOUT COLONNES employes
ALTER TABLE public.employes
  ADD COLUMN IF NOT EXISTS taux_horaire_brut NUMERIC,
  ADD COLUMN IF NOT EXISTS taux_horaire_charge NUMERIC,
  ADD COLUMN IF NOT EXISTS forfait BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS statut_contrat public.statut_contrat_type;

-- Backfill statut_contrat depuis type_contrat existant
UPDATE public.employes
SET statut_contrat = CASE type_contrat::text
  WHEN 'CDI'         THEN 'CDI'::public.statut_contrat_type
  WHEN 'CDD'         THEN 'CDD chantier'::public.statut_contrat_type
  WHEN 'Interim'     THEN 'Intérim'::public.statut_contrat_type
  ELSE NULL
END
WHERE statut_contrat IS NULL;

-- 3. TABLE contrats_intermittents
CREATE TABLE public.contrats_intermittents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID NOT NULL REFERENCES public.employes(id) ON DELETE RESTRICT,
  staffing_id     UUID,
  chantier_id     UUID NOT NULL REFERENCES public.affaires(id) ON DELETE RESTRICT,
  date_debut      DATE NOT NULL,
  date_fin        DATE NOT NULL,
  taux_horaire_brut NUMERIC,
  forfait         BOOLEAN NOT NULL DEFAULT false,
  heures_estimees NUMERIC,
  statut          public.contrat_intermittent_statut NOT NULL DEFAULT 'a_signer_employe',
  pdf_v1_url      TEXT,
  pdf_v2_url      TEXT,
  pdf_v3_url      TEXT,
  pdf_hash_sha256 TEXT,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contrats_dates_check CHECK (date_fin >= date_debut)
);

CREATE INDEX idx_contrats_intermittents_employee ON public.contrats_intermittents(employee_id);
CREATE INDEX idx_contrats_intermittents_chantier ON public.contrats_intermittents(chantier_id);
CREATE INDEX idx_contrats_intermittents_statut ON public.contrats_intermittents(statut);
CREATE INDEX idx_contrats_intermittents_dates ON public.contrats_intermittents(date_debut, date_fin);

ALTER TABLE public.contrats_intermittents ENABLE ROW LEVEL SECURITY;

CREATE POLICY contrats_intermittents_select_admin_or_self
  ON public.contrats_intermittents FOR SELECT TO authenticated
  USING (
    is_admin()
    OR employee_id IN (SELECT id FROM public.employes WHERE profile_id = auth.uid())
  );

-- INSERT bloqué pour tous (alimentation via RPC SECURITY DEFINER uniquement)
-- Pas de policy INSERT => personne ne peut INSERT directement.

CREATE POLICY contrats_intermittents_update_admin
  ON public.contrats_intermittents FOR UPDATE TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY contrats_intermittents_delete_admin
  ON public.contrats_intermittents FOR DELETE TO authenticated
  USING (is_admin());

CREATE TRIGGER set_updated_at_contrats_intermittents
  BEFORE UPDATE ON public.contrats_intermittents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. TABLE contrats_signatures
CREATE TABLE public.contrats_signatures (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrat_id          UUID NOT NULL REFERENCES public.contrats_intermittents(id) ON DELETE CASCADE,
  signataire_id       UUID NOT NULL,
  role_signature      public.signataire_role NOT NULL,
  signed_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  client_ip           TEXT,
  user_agent          TEXT,
  signature_image_url TEXT,
  pdf_hash_sha256     TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contrats_signatures_contrat ON public.contrats_signatures(contrat_id);
CREATE INDEX idx_contrats_signatures_signataire ON public.contrats_signatures(signataire_id);

ALTER TABLE public.contrats_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY contrats_signatures_select_admin_or_self
  ON public.contrats_signatures FOR SELECT TO authenticated
  USING (
    is_admin()
    OR signataire_id = auth.uid()
    OR contrat_id IN (
      SELECT id FROM public.contrats_intermittents
      WHERE employee_id IN (SELECT id FROM public.employes WHERE profile_id = auth.uid())
    )
  );

CREATE POLICY contrats_signatures_insert_self
  ON public.contrats_signatures FOR INSERT TO authenticated
  WITH CHECK (signataire_id = auth.uid());

-- Pas d'UPDATE / DELETE : signatures = log immuable

-- 5. RPC upsert_intermittent (idempotent par nom complet normalisé)
CREATE OR REPLACE FUNCTION public.upsert_intermittent(
  _nom_complet     TEXT,
  _adresse         TEXT,
  _cp              TEXT,
  _ville           TEXT,
  _date_naissance  DATE,
  _poste           TEXT,
  _statut          TEXT,        -- libellé du statut_contrat ('CDDU intermittent', 'Intérim', etc.)
  _forfait         BOOLEAN,
  _taux_brut       NUMERIC,
  _taux_charge     NUMERIC,
  _email           TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _key            TEXT;
  _existing_id    UUID;
  _prenom         TEXT;
  _nom            TEXT;
  _parts          TEXT[];
  _metier_id      INTEGER;
  _statut_enum    public.statut_contrat_type;
  _type_contrat   public.contrat_type;
  _adresse_full   TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  IF _nom_complet IS NULL OR LENGTH(TRIM(_nom_complet)) = 0 THEN
    RAISE EXCEPTION 'nom_complet requis';
  END IF;

  -- Clé d'idempotence
  _key := LOWER(TRIM(REGEXP_REPLACE(_nom_complet, '\s+', ' ', 'g')));

  -- Découpe prénom/nom (heuristique simple : 1er mot = prénom, reste = nom)
  _parts := REGEXP_SPLIT_TO_ARRAY(TRIM(_nom_complet), '\s+');
  IF array_length(_parts, 1) >= 2 THEN
    _prenom := _parts[1];
    _nom    := array_to_string(_parts[2:array_length(_parts, 1)], ' ');
  ELSE
    _prenom := '';
    _nom    := _nom_complet;
  END IF;

  -- Statut → enum (defensif)
  BEGIN
    _statut_enum := _statut::public.statut_contrat_type;
  EXCEPTION WHEN others THEN
    _statut_enum := 'CDDU intermittent'::public.statut_contrat_type;
  END;

  -- Type contrat (existant) déduit du statut fin
  _type_contrat := CASE
    WHEN _statut_enum IN ('CDDU intermittent','CDD chantier','Apprenti') THEN 'CDD'
    WHEN _statut_enum = 'Intérim' THEN 'Interim'
    WHEN _statut_enum = 'CDI'     THEN 'CDI'
    ELSE 'CDD'
  END::public.contrat_type;

  -- Métier principal : lookup ILIKE sur libellé/code, fallback construction
  SELECT id INTO _metier_id FROM public.metiers
  WHERE _poste IS NOT NULL
    AND (libelle ILIKE '%'||_poste||'%' OR code ILIKE '%'||_poste||'%')
  ORDER BY ordre LIMIT 1;
  IF _metier_id IS NULL THEN
    SELECT id INTO _metier_id FROM public.metiers ORDER BY ordre LIMIT 1;
  END IF;

  -- Adresse complète concaténée (table employes a une seule colonne adresse)
  _adresse_full := NULLIF(TRIM(
    COALESCE(_adresse,'') ||
    CASE WHEN _cp IS NOT NULL OR _ville IS NOT NULL
         THEN ', ' || COALESCE(_cp,'') || ' ' || COALESCE(_ville,'')
         ELSE '' END
  ), '');

  -- Recherche existant par clé normalisée
  SELECT id INTO _existing_id FROM public.employes
  WHERE LOWER(TRIM(REGEXP_REPLACE(prenom||' '||nom, '\s+', ' ', 'g'))) = _key
     OR LOWER(TRIM(REGEXP_REPLACE(nom||' '||prenom, '\s+', ' ', 'g'))) = _key
  LIMIT 1;

  IF _existing_id IS NOT NULL THEN
    -- UPDATE des champs manquants uniquement
    UPDATE public.employes SET
      adresse             = COALESCE(adresse, _adresse_full),
      date_naissance      = COALESCE(date_naissance, _date_naissance),
      email               = COALESCE(email, _email),
      statut_contrat      = COALESCE(statut_contrat, _statut_enum),
      forfait             = CASE WHEN forfait = false AND _forfait = true THEN true ELSE forfait END,
      taux_horaire_brut   = COALESCE(taux_horaire_brut, _taux_brut),
      taux_horaire_charge = COALESCE(taux_horaire_charge, _taux_charge),
      updated_at          = now()
    WHERE id = _existing_id;
    RETURN _existing_id;
  END IF;

  -- INSERT nouveau (intermittent inactif par défaut)
  INSERT INTO public.employes (
    nom, prenom, adresse, date_naissance, email,
    type_contrat, statut_contrat, forfait,
    taux_horaire_brut, taux_horaire_charge,
    metier_principal_id, actif
  ) VALUES (
    _nom, _prenom, _adresse_full, _date_naissance, _email,
    _type_contrat, _statut_enum, COALESCE(_forfait, false),
    _taux_brut, _taux_charge,
    _metier_id, false
  )
  RETURNING id INTO _existing_id;

  RETURN _existing_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_intermittent(TEXT,TEXT,TEXT,TEXT,DATE,TEXT,TEXT,BOOLEAN,NUMERIC,NUMERIC,TEXT) TO authenticated;

-- 6. RPC create_contrat_intermittent (appelée par /staffer-mobile, SECURITY DEFINER pour bypasser le INSERT bloqué)
CREATE OR REPLACE FUNCTION public.create_contrat_intermittent(
  _employee_id  UUID,
  _chantier_id  UUID,
  _staffing_id  UUID,
  _date_debut   DATE,
  _date_fin     DATE,
  _heures_estimees NUMERIC
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id          UUID;
  _statut_emp  public.statut_contrat_type;
  _taux        NUMERIC;
  _forfait     BOOLEAN;
BEGIN
  IF NOT public.is_chef_or_admin() THEN
    RAISE EXCEPTION 'Réservé aux chefs et administrateurs';
  END IF;

  SELECT statut_contrat, taux_horaire_brut, forfait
    INTO _statut_emp, _taux, _forfait
  FROM public.employes WHERE id = _employee_id;

  IF _statut_emp IS NULL OR _statut_emp NOT IN ('CDDU intermittent','CDD chantier','Intérim') THEN
    RETURN NULL; -- pas de contrat à créer pour CDI/Apprenti/null
  END IF;

  INSERT INTO public.contrats_intermittents (
    employee_id, chantier_id, staffing_id,
    date_debut, date_fin, taux_horaire_brut, forfait, heures_estimees,
    statut, created_by
  ) VALUES (
    _employee_id, _chantier_id, _staffing_id,
    _date_debut, _date_fin, _taux, COALESCE(_forfait,false), _heures_estimees,
    'a_signer_employe', auth.uid()
  )
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_contrat_intermittent(UUID,UUID,UUID,DATE,DATE,NUMERIC) TO authenticated;
