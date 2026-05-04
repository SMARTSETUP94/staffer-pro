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
$function$;