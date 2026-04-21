-- 1. Table devis_imports
CREATE TABLE public.devis_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  affaire_id uuid,
  devis_id uuid,
  fichier_nom text NOT NULL,
  fichier_hash text NOT NULL,
  postes_count integer NOT NULL DEFAULT 0,
  total_heures numeric NOT NULL DEFAULT 0,
  total_montant_ht numeric,
  affaire_numero text,
  affaire_nom text,
  devis_numero text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX devis_imports_hash_unique ON public.devis_imports(fichier_hash);
CREATE INDEX devis_imports_created_at_idx ON public.devis_imports(created_at DESC);
CREATE INDEX devis_imports_user_id_idx ON public.devis_imports(user_id);

ALTER TABLE public.devis_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "devis_imports_select_chef_admin"
  ON public.devis_imports FOR SELECT
  TO authenticated
  USING (public.is_chef_or_admin());

CREATE POLICY "devis_imports_insert_chef_admin"
  ON public.devis_imports FOR INSERT
  TO authenticated
  WITH CHECK (public.is_chef_or_admin() AND user_id = auth.uid());

CREATE POLICY "devis_imports_delete_admin"
  ON public.devis_imports FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- 2. Mise à jour de import_devis_atomique pour gérer le hash et l'historique
CREATE OR REPLACE FUNCTION public.import_devis_atomique(
  _affaire_id uuid,
  _new_affaire jsonb,
  _date_montage date,
  _date_demontage date,
  _devis jsonb,
  _postes jsonb,
  _fichier_hash text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  _final_affaire_id uuid;
  _devis_id uuid;
  _poste jsonb;
  _inserted_postes int := 0;
  _total_heures numeric := 0;
  _total_montant numeric := 0;
  _affaire_numero text;
  _affaire_nom text;
  _devis_numero text;
  _fichier_nom text;
  _existing_import_id uuid;
BEGIN
  IF NOT public.is_chef_or_admin() THEN
    RAISE EXCEPTION 'Action réservée aux chefs de chantier et administrateurs.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  _fichier_nom := NULLIF(trim(_devis->>'fichier_source'), '');

  -- Vérification du doublon par hash
  IF _fichier_hash IS NOT NULL AND length(_fichier_hash) > 0 THEN
    SELECT id INTO _existing_import_id
    FROM public.devis_imports
    WHERE fichier_hash = _fichier_hash
    LIMIT 1;

    IF _existing_import_id IS NOT NULL THEN
      RAISE EXCEPTION 'Ce fichier a déjà été importé (id: %). Vérifie l''historique des imports.', _existing_import_id
        USING ERRCODE = 'unique_violation';
    END IF;
  END IF;

  -- 1. Affaire
  IF _affaire_id IS NULL THEN
    INSERT INTO public.affaires (numero, nom, client, lieu, statut, date_montage, date_demontage)
    VALUES (
      NULLIF(trim(_new_affaire->>'numero'), ''),
      NULLIF(trim(_new_affaire->>'nom'), ''),
      NULLIF(trim(_new_affaire->>'client'), ''),
      NULLIF(trim(_new_affaire->>'lieu'), ''),
      'en_cours',
      _date_montage,
      _date_demontage
    )
    RETURNING id, numero, nom INTO _final_affaire_id, _affaire_numero, _affaire_nom;
  ELSE
    UPDATE public.affaires
       SET date_montage = _date_montage,
           date_demontage = _date_demontage,
           updated_at = now()
     WHERE id = _affaire_id
     RETURNING numero, nom INTO _affaire_numero, _affaire_nom;
    _final_affaire_id := _affaire_id;
  END IF;

  -- 2. Devis
  INSERT INTO public.devis (affaire_id, numero, libelle, montant_ht, statut, fichier_source)
  VALUES (
    _final_affaire_id,
    NULLIF(trim(_devis->>'numero'), ''),
    NULLIF(trim(_devis->>'libelle'), ''),
    NULLIF(_devis->>'montant_ht', '')::numeric,
    'signe',
    _fichier_nom
  )
  RETURNING id, numero INTO _devis_id, _devis_numero;

  _total_montant := NULLIF(_devis->>'montant_ht', '')::numeric;

  -- 3. Postes
  IF jsonb_typeof(_postes) = 'array' THEN
    FOR _poste IN SELECT * FROM jsonb_array_elements(_postes) LOOP
      INSERT INTO public.devis_postes (devis_id, metier_id, heures_prevues, montant_ht, libelle_source)
      VALUES (
        _devis_id,
        (_poste->>'metier_id')::int,
        COALESCE((_poste->>'heures_prevues')::numeric, 0),
        NULLIF(_poste->>'montant_ht', '')::numeric,
        NULLIF(trim(_poste->>'libelle_source'), '')
      );
      _inserted_postes := _inserted_postes + 1;
      _total_heures := _total_heures + COALESCE((_poste->>'heures_prevues')::numeric, 0);
    END LOOP;
  END IF;

  -- 4. Historique
  IF _fichier_hash IS NOT NULL AND length(_fichier_hash) > 0 THEN
    INSERT INTO public.devis_imports (
      user_id, affaire_id, devis_id, fichier_nom, fichier_hash,
      postes_count, total_heures, total_montant_ht,
      affaire_numero, affaire_nom, devis_numero
    )
    VALUES (
      auth.uid(), _final_affaire_id, _devis_id,
      COALESCE(_fichier_nom, 'Sans nom'), _fichier_hash,
      _inserted_postes, _total_heures, _total_montant,
      _affaire_numero, _affaire_nom, _devis_numero
    );
  END IF;

  RETURN jsonb_build_object(
    'affaire_id', _final_affaire_id,
    'devis_id', _devis_id,
    'postes_count', _inserted_postes
  );
END;
$function$;