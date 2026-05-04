-- ============================================================================
-- v0.39.0a-hotfix-import — Élimination orphelins fabrication_objets
-- ============================================================================

-- 1. RPC cleanup_fabrication_orphelins(affaire_id)
--    Supprime objets sans devis_id ET sans dépendances bloquantes
CREATE OR REPLACE FUNCTION public.cleanup_fabrication_orphelins(p_affaire_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_affaire_numero text;
  v_email text;
  v_supprimes int := 0;
  v_bloques int := 0;
  v_orphelins_bloques jsonb := '[]'::jsonb;
BEGIN
  IF NOT is_chef_or_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT numero INTO v_affaire_numero FROM affaires WHERE id = p_affaire_id;
  SELECT email INTO v_email FROM profiles WHERE id = auth.uid();

  -- Liste les orphelins bloqués (avec dépendances)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', fo.id, 'reference', fo.reference, 'nom', fo.nom,
    'has_heures', EXISTS(SELECT 1 FROM heures_saisies hs WHERE hs.fabrication_objet_id = fo.id),
    'has_spo', EXISTS(SELECT 1 FROM staffing_plan_object spo WHERE spo.objet_id = fo.id),
    'has_assign', EXISTS(SELECT 1 FROM assignation_objets ao WHERE ao.objet_id = fo.id)
  )), '[]'::jsonb), COUNT(*)
  INTO v_orphelins_bloques, v_bloques
  FROM fabrication_objets fo
  WHERE fo.affaire_id = p_affaire_id
    AND fo.devis_id IS NULL
    AND (
      EXISTS(SELECT 1 FROM heures_saisies hs WHERE hs.fabrication_objet_id = fo.id)
      OR EXISTS(SELECT 1 FROM staffing_plan_object spo WHERE spo.objet_id = fo.id)
      OR EXISTS(SELECT 1 FROM assignation_objets ao WHERE ao.objet_id = fo.id)
    );

  -- Supprime les orphelins SANS dépendances (les fabrication_etapes seront cascade)
  DELETE FROM fabrication_etapes
  WHERE objet_id IN (
    SELECT fo.id FROM fabrication_objets fo
    WHERE fo.affaire_id = p_affaire_id
      AND fo.devis_id IS NULL
      AND NOT EXISTS(SELECT 1 FROM heures_saisies hs WHERE hs.fabrication_objet_id = fo.id)
      AND NOT EXISTS(SELECT 1 FROM staffing_plan_object spo WHERE spo.objet_id = fo.id)
      AND NOT EXISTS(SELECT 1 FROM assignation_objets ao WHERE ao.objet_id = fo.id)
  );

  DELETE FROM fabrication_objets fo
  WHERE fo.affaire_id = p_affaire_id
    AND fo.devis_id IS NULL
    AND NOT EXISTS(SELECT 1 FROM heures_saisies hs WHERE hs.fabrication_objet_id = fo.id)
    AND NOT EXISTS(SELECT 1 FROM staffing_plan_object spo WHERE spo.objet_id = fo.id)
    AND NOT EXISTS(SELECT 1 FROM assignation_objets ao WHERE ao.objet_id = fo.id);
  GET DIAGNOSTICS v_supprimes = ROW_COUNT;

  -- Audit (uniquement si quelque chose a été fait)
  IF v_supprimes > 0 THEN
    INSERT INTO devis_deletion_log (
      devis_id, devis_numero, affaire_id, affaire_numero,
      action, deleted_by, deleted_by_email,
      objets_supprimes, postes_supprimes, objets_archives,
      heures_supprimees, heures_preservees
    ) VALUES (
      gen_random_uuid(), 'CLEANUP-ORPHELINS', p_affaire_id, v_affaire_numero,
      'cleanup_orphelins', auth.uid(), v_email,
      v_supprimes, 0, 0, 0, 0
    );
  END IF;

  RETURN jsonb_build_object(
    'supprimes', v_supprimes,
    'bloques', v_bloques,
    'orphelins_bloques', v_orphelins_bloques
  );
END;
$$;

-- 2. Patch delete_devis_atomique : appelle cleanup_fabrication_orphelins à la fin
CREATE OR REPLACE FUNCTION public.delete_devis_atomique(p_devis_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_devis record;
  v_import record;
  v_email text;
  v_heures_validees int;
  v_heures_non_validees int;
  v_postes_supprimes int := 0;
  v_objets_supprimes int := 0;
  v_objets_archives int := 0;
  v_action text;
  v_cleanup jsonb;
BEGIN
  IF NOT is_chef_or_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT id, numero, affaire_id INTO v_devis
  FROM devis WHERE id = p_devis_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Devis introuvable';
  END IF;

  SELECT * INTO v_import FROM devis_imports
  WHERE devis_id = p_devis_id ORDER BY created_at DESC LIMIT 1;

  SELECT email INTO v_email FROM profiles WHERE id = auth.uid();

  SELECT COUNT(*) INTO v_heures_validees
  FROM heures_saisies WHERE devis_id = p_devis_id AND statut = 'valide';

  SELECT COUNT(*) INTO v_heures_non_validees
  FROM heures_saisies WHERE devis_id = p_devis_id AND statut <> 'valide';

  DELETE FROM heures_saisies WHERE devis_id = p_devis_id AND statut <> 'valide';

  DELETE FROM devis_postes WHERE devis_id = p_devis_id;
  GET DIAGNOSTICS v_postes_supprimes = ROW_COUNT;

  IF v_heures_validees > 0 THEN
    v_action := 'archived';

    UPDATE fabrication_objets SET archive = true
    WHERE devis_id = p_devis_id
      AND id IN (SELECT DISTINCT fabrication_objet_id FROM heures_saisies
                 WHERE devis_id = p_devis_id AND statut = 'valide' AND fabrication_objet_id IS NOT NULL);
    GET DIAGNOSTICS v_objets_archives = ROW_COUNT;

    DELETE FROM fabrication_objets
    WHERE devis_id = p_devis_id
      AND id NOT IN (SELECT DISTINCT fabrication_objet_id FROM heures_saisies
                     WHERE devis_id = p_devis_id AND statut = 'valide' AND fabrication_objet_id IS NOT NULL);
    GET DIAGNOSTICS v_objets_supprimes = ROW_COUNT;

    UPDATE devis SET archive = true, updated_at = now() WHERE id = p_devis_id;
  ELSE
    v_action := 'deleted';

    DELETE FROM fabrication_objets WHERE devis_id = p_devis_id;
    GET DIAGNOSTICS v_objets_supprimes = ROW_COUNT;

    UPDATE assignations SET devis_id = NULL WHERE devis_id = p_devis_id;

    DELETE FROM devis WHERE id = p_devis_id;
  END IF;

  DELETE FROM devis_imports WHERE devis_id = p_devis_id;

  -- Cleanup orphelins de l'affaire (filet anti-récidive)
  v_cleanup := cleanup_fabrication_orphelins(v_devis.affaire_id);

  INSERT INTO devis_deletion_log (
    devis_id, devis_numero, affaire_id, affaire_numero,
    fichier_nom, fichier_hash, action,
    postes_supprimes, objets_supprimes, objets_archives,
    heures_supprimees, heures_preservees,
    deleted_by, deleted_by_email
  ) VALUES (
    p_devis_id, v_devis.numero, v_devis.affaire_id,
    (SELECT numero FROM affaires WHERE id = v_devis.affaire_id),
    v_import.fichier_nom, v_import.fichier_hash, v_action,
    v_postes_supprimes, v_objets_supprimes, v_objets_archives,
    v_heures_non_validees, v_heures_validees,
    auth.uid(), v_email
  );

  RETURN json_build_object(
    'action', v_action,
    'postes_supprimes', v_postes_supprimes,
    'objets_supprimes', v_objets_supprimes,
    'objets_archives', v_objets_archives,
    'heures_supprimees', v_heures_non_validees,
    'heures_preservees', v_heures_validees,
    'orphelins_cleanup', v_cleanup
  );
END;
$$;

-- 3. RPC import_progbat_atomique — transactionnel, retourne conflits
CREATE OR REPLACE FUNCTION public.import_progbat_atomique(
  p_affaire_id uuid,
  p_objets jsonb,
  p_heures_montage numeric DEFAULT NULL,
  p_heures_demontage numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _objet jsonb;
  _ordre int := 0;
  _inserted int := 0;
  _conflicts jsonb := '[]'::jsonb;
  _ref text;
  _existing_id uuid;
BEGIN
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
$$;

-- 4. Cleanup one-shot des 13 orphelins existants (vérifiés sans dépendances)
DELETE FROM fabrication_etapes WHERE objet_id IN (
  SELECT id FROM fabrication_objets
  WHERE devis_id IS NULL
    AND affaire_id IN (
      '9157f0bf-d558-47de-b355-d106190d6418',
      'a4d6fe6b-e6c2-4693-942c-4c7328fde222',
      '4bcb918f-273e-45bc-8859-56a8f60badc2'
    )
);

DELETE FROM fabrication_objets
WHERE devis_id IS NULL
  AND affaire_id IN (
    '9157f0bf-d558-47de-b355-d106190d6418',
    'a4d6fe6b-e6c2-4693-942c-4c7328fde222',
    '4bcb918f-273e-45bc-8859-56a8f60badc2'
  );

-- Audit log du cleanup one-shot
INSERT INTO devis_deletion_log (
  devis_id, devis_numero, affaire_id, affaire_numero,
  action, deleted_by, deleted_by_email,
  objets_supprimes, postes_supprimes, objets_archives,
  heures_supprimees, heures_preservees
)
SELECT gen_random_uuid(), 'CLEANUP-ORPHELINS-MIGRATION-v0.39.0a', a.id, a.numero,
  'cleanup_orphelins_migration',
  '00000000-0000-0000-0000-000000000000'::uuid, 'system@migration',
  CASE a.id::text
    WHEN '4bcb918f-273e-45bc-8859-56a8f60badc2' THEN 11
    ELSE 1 END,
  0, 0, 0, 0
FROM affaires a
WHERE a.id IN (
  '9157f0bf-d558-47de-b355-d106190d6418',
  'a4d6fe6b-e6c2-4693-942c-4c7328fde222',
  '4bcb918f-273e-45bc-8859-56a8f60badc2'
);

GRANT EXECUTE ON FUNCTION public.cleanup_fabrication_orphelins(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_progbat_atomique(uuid, jsonb, numeric, numeric) TO authenticated;