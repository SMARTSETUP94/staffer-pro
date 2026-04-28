-- v0.23.1 — import_devis_atomique_v2 : ajoute objets fabrication + heures chantier en un seul appel
-- Garde import_devis_atomique (v1) intact pour compat.
CREATE OR REPLACE FUNCTION public.import_devis_atomique_v2(
  _affaire_id uuid,
  _new_affaire jsonb,
  _date_montage date,
  _date_demontage date,
  _devis jsonb,
  _postes jsonb,
  _objets_fab jsonb DEFAULT '[]'::jsonb,
  _heures_montage numeric DEFAULT NULL,
  _heures_demontage numeric DEFAULT NULL,
  _fichier_hash text DEFAULT NULL
) RETURNS jsonb
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
$function$;

COMMENT ON FUNCTION public.import_devis_atomique_v2 IS
  'v0.23.1 — Import atomique fusionné : affaire + devis + postes RH + objets fabrication + heures chantier.';