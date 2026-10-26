CREATE OR REPLACE FUNCTION public.import_devis_atomique_v2(_affaire_id uuid, _new_affaire jsonb, _date_montage date, _date_demontage date, _devis jsonb, _postes jsonb, _objets_fab jsonb DEFAULT '[]'::jsonb, _heures_montage numeric DEFAULT NULL::numeric, _heures_demontage numeric DEFAULT NULL::numeric, _fichier_hash text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  _final_affaire_id uuid;
  _devis_id uuid;
  _poste jsonb;
  _objet jsonb;
  _inserted_postes int := 0;
  _inserted_objets int := 0;
  _ordre int := 0;
BEGIN
  PERFORM public.mcp_assert_legacy_oauth_write('import_devis_atomique_v2');
  IF NOT public.is_chef_or_admin() THEN
    RAISE EXCEPTION 'Action réservée aux chefs de chantier et administrateurs.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Anti-doublon par hash fichier
  IF _fichier_hash IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.devis_imports WHERE fichier_hash = _fichier_hash) THEN
      RAISE EXCEPTION 'Ce fichier a déjà été importé.' USING ERRCODE = 'unique_violation';
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
    RETURNING id INTO _final_affaire_id;
  ELSE
    UPDATE public.affaires
       SET date_montage = COALESCE(_date_montage, date_montage),
           date_demontage = COALESCE(_date_demontage, date_demontage),
           updated_at = now()
     WHERE id = _affaire_id;
    _final_affaire_id := _affaire_id;
  END IF;

  -- 2. Heures chantier (uniquement si fournies)
  IF _heures_montage IS NOT NULL OR _heures_demontage IS NOT NULL THEN
    UPDATE public.affaires
       SET heures_prevues_montage = COALESCE(_heures_montage, heures_prevues_montage),
           heures_prevues_demontage = COALESCE(_heures_demontage, heures_prevues_demontage),
           updated_at = now()
     WHERE id = _final_affaire_id;
  END IF;

  -- 3. Devis
  INSERT INTO public.devis (affaire_id, numero, libelle, montant_ht, statut, fichier_source)
  VALUES (
    _final_affaire_id,
    NULLIF(trim(_devis->>'numero'), ''),
    NULLIF(trim(_devis->>'libelle'), ''),
    NULLIF(_devis->>'montant_ht', '')::numeric,
    'signe',
    NULLIF(trim(_devis->>'fichier_source'), '')
  )
  RETURNING id INTO _devis_id;

  -- 4. Postes RH (devis_postes)
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
    END LOOP;
  END IF;

  -- 5. Objets fabrication (le trigger create_fabrication_etapes_for_objet crée les 5 étapes)
  IF jsonb_typeof(_objets_fab) = 'array' THEN
    FOR _objet IN SELECT * FROM jsonb_array_elements(_objets_fab) LOOP
      INSERT INTO public.fabrication_objets (
        affaire_id, devis_id, reference, nom, quantite, ordre,
        heures_prevues_be, heures_prevues_numerique, heures_prevues_bois, heures_prevues_metal,
        heures_prevues_peinture, heures_prevues_tapisserie, heures_prevues_manutention,
        budget_materiaux, type_finition,
        a_dessiner, a_usiner, a_construire, est_brut, a_emballer
      ) VALUES (
        _final_affaire_id,
        _devis_id,
        COALESCE(NULLIF(trim(_objet->>'reference'), ''), 'OBJ-' || (_ordre + 1)::text),
        COALESCE(NULLIF(trim(_objet->>'nom'), ''), 'Objet sans nom'),
        COALESCE((_objet->>'quantite')::int, 1),
        _ordre,
        COALESCE((_objet->'heures'->>'be')::numeric, 0),
        COALESCE((_objet->'heures'->>'numerique')::numeric, 0),
        COALESCE((_objet->'heures'->>'bois')::numeric, 0),
        COALESCE((_objet->'heures'->>'metal')::numeric, 0),
        COALESCE((_objet->'heures'->>'peinture')::numeric, 0),
        COALESCE((_objet->'heures'->>'tapisserie')::numeric, 0),
        COALESCE((_objet->'heures'->>'manutention')::numeric, 0),
        COALESCE((_objet->>'budget_materiaux')::numeric, 0),
        COALESCE(NULLIF(_objet->>'type_finition', ''), 'aucune')::public.fabrication_finition_type,
        COALESCE((_objet->'flags'->>'a_dessiner')::boolean, true),
        COALESCE((_objet->'flags'->>'a_usiner')::boolean, true),
        COALESCE((_objet->'flags'->>'a_construire')::boolean, true),
        COALESCE((_objet->'flags'->>'est_brut')::boolean, false),
        COALESCE((_objet->'flags'->>'a_emballer')::boolean, true)
      );
      _ordre := _ordre + 1;
      _inserted_objets := _inserted_objets + 1;
    END LOOP;
  END IF;

  -- 6. Trace import (anti-doublon)
  IF _fichier_hash IS NOT NULL THEN
    INSERT INTO public.devis_imports (
      user_id, fichier_hash, fichier_nom, affaire_id, devis_id,
      affaire_numero, affaire_nom, devis_numero,
      total_heures, total_montant_ht, postes_count
    ) VALUES (
      auth.uid(),
      _fichier_hash,
      COALESCE(NULLIF(trim(_devis->>'fichier_source'), ''), 'unknown.xlsx'),
      _final_affaire_id,
      _devis_id,
      NULLIF(trim(_new_affaire->>'numero'), ''),
      NULLIF(trim(_new_affaire->>'nom'), ''),
      NULLIF(trim(_devis->>'numero'), ''),
      0,
      NULLIF(_devis->>'montant_ht', '')::numeric,
      _inserted_postes
    );
  END IF;

  RETURN jsonb_build_object(
    'affaire_id', _final_affaire_id,
    'devis_id', _devis_id,
    'postes_count', _inserted_postes,
    'objets_count', _inserted_objets
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.import_devis_atomique_v3(_affaire_id uuid, _new_affaire jsonb, _date_montage date, _date_demontage date, _devis jsonb, _postes jsonb, _objets_fab jsonb DEFAULT '[]'::jsonb, _heures_montage numeric DEFAULT NULL::numeric, _heures_demontage numeric DEFAULT NULL::numeric, _fichier_hash text DEFAULT NULL::text, _bulk_assign jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  _final_affaire_id uuid;
  _devis_id uuid;
  _poste jsonb;
  _objet jsonb;
  _inserted_postes int := 0;
  _inserted_objets int := 0;
  _ordre int := 0;
  _chef_projet_id   uuid := NULLIF(_bulk_assign->>'chef_projet_id', '')::uuid;
  _resp_montage_id  uuid := NULLIF(_bulk_assign->>'montage_id', '')::uuid;
  _resp_demontage_id uuid := NULLIF(_bulk_assign->>'demontage_id', '')::uuid;
  _assign_be        uuid := NULLIF(_bulk_assign#>>'{par_etape,be}', '')::uuid;
  _assign_usinage   uuid := NULLIF(_bulk_assign#>>'{par_etape,usinage}', '')::uuid;
  _assign_respo_fab uuid := NULLIF(_bulk_assign#>>'{par_etape,respo_fab}', '')::uuid;
  _assign_finition  uuid := NULLIF(_bulk_assign#>>'{par_etape,finition}', '')::uuid;
  _assign_manuten   uuid := NULLIF(_bulk_assign#>>'{par_etape,manutention}', '')::uuid;
  _new_objet_id uuid;
  _existing_import_id uuid;
  _existing_devis_id uuid;
  _existing_affaire_id uuid;
  _mode text := 'created';
  _heures_preservees int := 0;
  -- v0.39.0d : préfixe anti-collision multi-devis sur même affaire
  _ref_prefix text := '';
  _devis_numero text;
  _collision_detected boolean := false;
  _payload_ref text;
BEGIN
  PERFORM public.mcp_assert_legacy_oauth_write('import_devis_atomique_v3');
  IF NOT public.is_chef_or_admin() THEN
    RAISE EXCEPTION 'Action réservée aux chefs de chantier et administrateurs.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _fichier_hash IS NOT NULL THEN
    SELECT id, devis_id, affaire_id
      INTO _existing_import_id, _existing_devis_id, _existing_affaire_id
      FROM public.devis_imports
     WHERE fichier_hash = _fichier_hash
     LIMIT 1;

    IF _existing_import_id IS NOT NULL THEN
      _mode := 'updated';
      IF _existing_devis_id IS NOT NULL THEN
        SELECT COUNT(*) INTO _heures_preservees
          FROM public.heures_saisies
         WHERE devis_id = _existing_devis_id;
      END IF;
    END IF;
  END IF;

  IF _affaire_id IS NULL AND _existing_affaire_id IS NULL THEN
    INSERT INTO public.affaires (numero, nom, client, lieu, statut, date_montage, date_demontage)
    VALUES (
      trim(_new_affaire->>'numero'),
      trim(_new_affaire->>'nom'),
      NULLIF(trim(_new_affaire->>'client'), ''),
      NULLIF(trim(_new_affaire->>'lieu'), ''),
      'en_cours',
      _date_montage,
      _date_demontage
    )
    RETURNING id INTO _final_affaire_id;
  ELSE
    _final_affaire_id := COALESCE(_affaire_id, _existing_affaire_id);
    UPDATE public.affaires
       SET date_montage = COALESCE(_date_montage, date_montage),
           date_demontage = COALESCE(_date_demontage, date_demontage),
           updated_at = now()
     WHERE id = _final_affaire_id;
  END IF;

  IF _heures_montage IS NOT NULL OR _heures_demontage IS NOT NULL THEN
    UPDATE public.affaires
       SET heures_prevues_montage   = COALESCE(_heures_montage, heures_prevues_montage),
           heures_prevues_demontage = COALESCE(_heures_demontage, heures_prevues_demontage),
           updated_at = now()
     WHERE id = _final_affaire_id;
  END IF;

  IF _chef_projet_id IS NOT NULL OR _resp_montage_id IS NOT NULL OR _resp_demontage_id IS NOT NULL THEN
    UPDATE public.affaires
       SET chef_projet_id          = COALESCE(_chef_projet_id, chef_projet_id),
           responsable_montage_id  = COALESCE(_resp_montage_id, responsable_montage_id),
           responsable_demontage_id = COALESCE(_resp_demontage_id, responsable_demontage_id),
           updated_at = now()
     WHERE id = _final_affaire_id;
  END IF;

  IF _mode = 'updated' AND _existing_devis_id IS NOT NULL THEN
    UPDATE public.devis
       SET affaire_id = _final_affaire_id,
           numero = NULLIF(trim(_devis->>'numero'), ''),
           libelle = NULLIF(trim(_devis->>'libelle'), ''),
           montant_ht = NULLIF(_devis->>'montant_ht', '')::numeric,
           fichier_source = NULLIF(_devis->>'fichier_source', ''),
           updated_at = now()
     WHERE id = _existing_devis_id;
    _devis_id := _existing_devis_id;

    DELETE FROM public.devis_postes WHERE devis_id = _devis_id;
    DELETE FROM public.fabrication_etapes
     WHERE objet_id IN (SELECT id FROM public.fabrication_objets WHERE devis_id = _devis_id);
    DELETE FROM public.fabrication_objets WHERE devis_id = _devis_id;

    UPDATE public.heures_saisies
       SET affaire_id = _final_affaire_id, updated_at = now()
     WHERE devis_id = _devis_id AND affaire_id <> _final_affaire_id;
  ELSE
    INSERT INTO public.devis (affaire_id, numero, libelle, montant_ht, statut, fichier_source)
    VALUES (
      _final_affaire_id,
      NULLIF(trim(_devis->>'numero'), ''),
      NULLIF(trim(_devis->>'libelle'), ''),
      NULLIF(_devis->>'montant_ht', '')::numeric,
      'signe',
      NULLIF(_devis->>'fichier_source', '')
    )
    RETURNING id INTO _devis_id;
  END IF;

  -- 4. Postes RH
  FOR _poste IN SELECT * FROM jsonb_array_elements(_postes) LOOP
    INSERT INTO public.devis_postes (devis_id, metier_id, heures_prevues, montant_ht, libelle_source)
    VALUES (
      _devis_id,
      (_poste->>'metier_id')::int,
      COALESCE((_poste->>'heures_prevues')::numeric, 0),
      NULLIF(_poste->>'montant_ht', '')::numeric,
      NULLIF(_poste->>'libelle_source', '')
    );
    _inserted_postes := _inserted_postes + 1;
  END LOOP;

  -- v0.39.0d : détection collision référence multi-devis
  -- Si une ref du payload existe déjà sur l'affaire pour un AUTRE devis
  -- (donc pas le devis qu'on vient de delete/recreate ci-dessus),
  -- on préfixe toutes les refs de CE devis avec son numéro pour garantir l'unicité.
  IF jsonb_array_length(_objets_fab) > 0 THEN
    FOR _objet IN SELECT * FROM jsonb_array_elements(_objets_fab) LOOP
      _payload_ref := NULLIF(trim(_objet->>'reference'), '');
      IF _payload_ref IS NOT NULL THEN
        IF EXISTS (
          SELECT 1 FROM public.fabrication_objets
           WHERE affaire_id = _final_affaire_id
             AND reference = _payload_ref
             AND devis_id IS DISTINCT FROM _devis_id
             AND archive = false
        ) THEN
          _collision_detected := true;
          EXIT;
        END IF;
      END IF;
    END LOOP;

    IF _collision_detected THEN
      _devis_numero := NULLIF(trim(_devis->>'numero'), '');
      IF _devis_numero IS NOT NULL THEN
        _ref_prefix := _devis_numero || '-';
      ELSE
        _ref_prefix := substr(_devis_id::text, 1, 8) || '-';
      END IF;
    END IF;
  END IF;

  -- 5. Objets fabrication + bulk-assign sur étapes auto-créées par trigger
  FOR _objet IN SELECT * FROM jsonb_array_elements(_objets_fab) LOOP
    INSERT INTO public.fabrication_objets (
      affaire_id, devis_id, reference, nom, quantite, ordre,
      heures_prevues_be, heures_prevues_numerique,
      heures_prevues_bois, heures_prevues_metal,
      heures_prevues_peinture, heures_prevues_tapisserie,
      heures_prevues_manutention,
      budget_materiaux, type_finition,
      a_dessiner, a_usiner, a_construire, est_brut, a_emballer
    ) VALUES (
      _final_affaire_id, _devis_id,
      _ref_prefix || COALESCE(NULLIF(trim(_objet->>'reference'), ''), 'OBJ-' || (_ordre + 1)::text),
      trim(_objet->>'nom'),
      GREATEST(1, COALESCE((_objet->>'quantite')::int, 1)),
      _ordre,
      COALESCE((_objet#>>'{heures,be}')::numeric, 0),
      COALESCE((_objet#>>'{heures,numerique}')::numeric, 0),
      COALESCE((_objet#>>'{heures,bois}')::numeric, 0),
      COALESCE((_objet#>>'{heures,metal}')::numeric, 0),
      COALESCE((_objet#>>'{heures,peinture}')::numeric, 0),
      COALESCE((_objet#>>'{heures,tapisserie}')::numeric, 0),
      COALESCE((_objet#>>'{heures,manutention}')::numeric, 0),
      COALESCE((_objet->>'budget_materiaux')::numeric, 0),
      COALESCE(_objet->>'type_finition', 'aucune')::public.fabrication_finition_type,
      COALESCE((_objet#>>'{flags,a_dessiner}')::boolean, true),
      COALESCE((_objet#>>'{flags,a_usiner}')::boolean, true),
      COALESCE((_objet#>>'{flags,a_construire}')::boolean, true),
      COALESCE((_objet#>>'{flags,est_brut}')::boolean, false),
      COALESCE((_objet#>>'{flags,a_emballer}')::boolean, true)
    )
    RETURNING id INTO _new_objet_id;

    IF _assign_be IS NOT NULL AND COALESCE((_objet#>>'{heures,be}')::numeric, 0) > 0 THEN
      UPDATE public.fabrication_etapes
         SET assignee_id = _assign_be
       WHERE objet_id = _new_objet_id AND type_etape = 'be' AND statut = 'a_faire';
    END IF;
    IF _assign_usinage IS NOT NULL AND COALESCE((_objet#>>'{heures,numerique}')::numeric, 0) > 0 THEN
      UPDATE public.fabrication_etapes
         SET assignee_id = _assign_usinage
       WHERE objet_id = _new_objet_id AND type_etape = 'usinage' AND statut = 'a_faire';
    END IF;
    IF _assign_respo_fab IS NOT NULL
       AND (COALESCE((_objet#>>'{heures,bois}')::numeric, 0) + COALESCE((_objet#>>'{heures,metal}')::numeric, 0)) > 0 THEN
      UPDATE public.fabrication_etapes
         SET assignee_id = _assign_respo_fab
       WHERE objet_id = _new_objet_id AND type_etape = 'respo_fab' AND statut = 'a_faire';
      UPDATE public.fabrication_objets SET respo_fab_id = _assign_respo_fab WHERE id = _new_objet_id;
    END IF;
    IF _assign_finition IS NOT NULL
       AND (COALESCE((_objet#>>'{heures,peinture}')::numeric, 0) + COALESCE((_objet#>>'{heures,tapisserie}')::numeric, 0)) > 0 THEN
      UPDATE public.fabrication_etapes
         SET assignee_id = _assign_finition
       WHERE objet_id = _new_objet_id AND type_etape = 'finition' AND statut = 'a_faire';
    END IF;
    IF _assign_manuten IS NOT NULL AND COALESCE((_objet#>>'{heures,manutention}')::numeric, 0) > 0 THEN
      UPDATE public.fabrication_etapes
         SET assignee_id = _assign_manuten
       WHERE objet_id = _new_objet_id AND type_etape = 'manutention' AND statut = 'a_faire';
    END IF;

    _inserted_objets := _inserted_objets + 1;
    _ordre := _ordre + 1;
  END LOOP;

  IF _existing_import_id IS NOT NULL THEN
    UPDATE public.devis_imports
       SET devis_id = _devis_id,
           affaire_id = _final_affaire_id,
           postes_count = _inserted_postes,
           total_heures = (SELECT COALESCE(SUM(heures_prevues), 0) FROM public.devis_postes WHERE devis_id = _devis_id),
           total_montant_ht = NULLIF(_devis->>'montant_ht', '')::numeric,
           fichier_nom = COALESCE(NULLIF(_devis->>'fichier_source', ''), fichier_nom)
     WHERE id = _existing_import_id;
  ELSE
    INSERT INTO public.devis_imports (
      user_id, devis_id, affaire_id, fichier_nom, fichier_hash,
      postes_count, total_heures, total_montant_ht,
      affaire_numero, affaire_nom, devis_numero
    ) VALUES (
      auth.uid(), _devis_id, _final_affaire_id,
      COALESCE(NULLIF(_devis->>'fichier_source', ''), 'import.xlsx'),
      _fichier_hash,
      _inserted_postes,
      (SELECT COALESCE(SUM(heures_prevues), 0) FROM public.devis_postes WHERE devis_id = _devis_id),
      NULLIF(_devis->>'montant_ht', '')::numeric,
      (SELECT numero FROM public.affaires WHERE id = _final_affaire_id),
      (SELECT nom FROM public.affaires WHERE id = _final_affaire_id),
      NULLIF(trim(_devis->>'numero'), '')
    );
  END IF;

  RETURN jsonb_build_object(
    'mode', _mode,
    'devis_id', _devis_id,
    'affaire_id', _final_affaire_id,
    'postes_inserted', _inserted_postes,
    'objets_inserted', _inserted_objets,
    'heures_preservees', _heures_preservees,
    'ref_prefix_applied', _ref_prefix
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.import_devis_atomique(_affaire_id uuid, _new_affaire jsonb, _date_montage date, _date_demontage date, _devis jsonb, _postes jsonb, _fichier_hash text DEFAULT NULL::text)
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
  PERFORM public.mcp_assert_legacy_oauth_write('import_devis_atomique');
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
$function$
;

CREATE OR REPLACE FUNCTION public.import_devis_atomique(_affaire_id uuid, _new_affaire jsonb, _date_montage date, _date_demontage date, _devis jsonb, _postes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  _final_affaire_id uuid;
  _devis_id uuid;
  _poste jsonb;
  _inserted_postes int := 0;
BEGIN
  PERFORM public.mcp_assert_legacy_oauth_write('import_devis_atomique');
  -- Garde-fou : seuls les chefs/admins peuvent importer
  IF NOT public.is_chef_or_admin() THEN
    RAISE EXCEPTION 'Action réservée aux chefs de chantier et administrateurs.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 1. Affaire : création ou mise à jour
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
    RETURNING id INTO _final_affaire_id;
  ELSE
    UPDATE public.affaires
       SET date_montage = _date_montage,
           date_demontage = _date_demontage,
           updated_at = now()
     WHERE id = _affaire_id;
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
    NULLIF(trim(_devis->>'fichier_source'), '')
  )
  RETURNING id INTO _devis_id;

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
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'affaire_id', _final_affaire_id,
    'devis_id', _devis_id,
    'postes_count', _inserted_postes
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.import_progbat_atomique(p_affaire_id uuid, p_objets jsonb, p_heures_montage numeric DEFAULT NULL::numeric, p_heures_demontage numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _objet jsonb;
  _ordre int := 0;
  _inserted int := 0;
  _conflicts jsonb := '[]'::jsonb;
  _ref text;
  _existing_id uuid;
BEGIN
  PERFORM public.mcp_assert_legacy_oauth_write('import_progbat_atomique');
  IF NOT is_chef_or_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF NOT EXISTS(SELECT 1 FROM affaires WHERE id = p_affaire_id) THEN
    RAISE EXCEPTION 'Affaire introuvable: %', p_affaire_id;
  END IF;

  -- Pré-flight : détection conflits référence
  FOR _objet IN SELECT * FROM jsonb_array_elements(p_objets)
  LOOP
    _ref := COALESCE(NULLIF(_objet->>'reference', ''), 'OBJ-' || (_ordre + 1));
    SELECT id INTO _existing_id FROM fabrication_objets
    WHERE affaire_id = p_affaire_id AND reference = _ref LIMIT 1;
    IF _existing_id IS NOT NULL THEN
      _conflicts := _conflicts || jsonb_build_object(
        'reference', _ref, 'existing_id', _existing_id, 'nom', _objet->>'nom'
      );
    END IF;
    _ordre := _ordre + 1;
  END LOOP;

  IF jsonb_array_length(_conflicts) > 0 THEN
    RAISE EXCEPTION 'CONFLICT_REFERENCE: %', _conflicts USING ERRCODE = 'unique_violation';
  END IF;

  -- Insertion bulk (transactionnelle de fait via PL/pgSQL)
  _ordre := 0;
  FOR _objet IN SELECT * FROM jsonb_array_elements(p_objets)
  LOOP
    INSERT INTO fabrication_objets (
      affaire_id, devis_id, reference, nom, quantite, ordre,
      heures_prevues_be, heures_prevues_numerique, heures_prevues_bois,
      heures_prevues_metal, heures_prevues_peinture, heures_prevues_tapisserie,
      heures_prevues_manutention, budget_materiaux, type_finition,
      a_dessiner, a_usiner, a_construire, est_brut, a_emballer,
      created_by
    ) VALUES (
      p_affaire_id,
      NULLIF(_objet->>'devis_id', '')::uuid,
      COALESCE(NULLIF(_objet->>'reference', ''), 'OBJ-' || (_ordre + 1)),
      _objet->>'nom',
      COALESCE((_objet->>'quantite')::int, 1),
      _ordre,
      COALESCE((_objet->>'heures_prevues_be')::numeric, 0),
      COALESCE((_objet->>'heures_prevues_numerique')::numeric, 0),
      COALESCE((_objet->>'heures_prevues_bois')::numeric, 0),
      COALESCE((_objet->>'heures_prevues_metal')::numeric, 0),
      COALESCE((_objet->>'heures_prevues_peinture')::numeric, 0),
      COALESCE((_objet->>'heures_prevues_tapisserie')::numeric, 0),
      COALESCE((_objet->>'heures_prevues_manutention')::numeric, 0),
      COALESCE((_objet->>'budget_materiaux')::numeric, 0),
      COALESCE(_objet->>'type_finition', 'aucune')::fabrication_finition_type,
      COALESCE((_objet->>'a_dessiner')::boolean, true),
      COALESCE((_objet->>'a_usiner')::boolean, true),
      COALESCE((_objet->>'a_construire')::boolean, true),
      COALESCE((_objet->>'est_brut')::boolean, false),
      COALESCE((_objet->>'a_emballer')::boolean, true),
      auth.uid()
    );
    _inserted := _inserted + 1;
    _ordre := _ordre + 1;
  END LOOP;

  -- Update affaire heures chantier si fourni
  IF p_heures_montage IS NOT NULL OR p_heures_demontage IS NOT NULL THEN
    UPDATE affaires SET
      heures_prevues_montage = COALESCE(p_heures_montage, heures_prevues_montage),
      heures_prevues_demontage = COALESCE(p_heures_demontage, heures_prevues_demontage),
      updated_at = now()
    WHERE id = p_affaire_id;
  END IF;

  RETURN jsonb_build_object(
    'inserted_objets', _inserted,
    'conflicts', _conflicts
  );
END;
$function$
;