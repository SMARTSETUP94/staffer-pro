-- ============================================================
-- LOT B1/B2/B4 — Tableau d'atelier : complétude, validation, cohérence heures
-- ============================================================

-- ---------- B2a : nouvel état d'étape ----------
ALTER TYPE public.fabrication_etape_statut ADD VALUE IF NOT EXISTS 'en_attente_validation';

-- ---------- B1 : règle de complétude, source unique ----------
CREATE OR REPLACE FUNCTION public.etape_prete(_etape_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  e RECORD;
  o RECORD;
  manques text[] := ARRAY[]::text[];
  plan_ok boolean;
BEGIN
  SELECT * INTO e FROM public.fabrication_etapes WHERE id = _etape_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('prete', true, 'manques', '[]'::jsonb);
  END IF;

  IF e.statut = 'non_applicable' THEN
    RETURN jsonb_build_object('prete', true, 'manques', '[]'::jsonb);
  END IF;

  SELECT * INTO o FROM public.fabrication_objets WHERE id = e.objet_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('prete', true, 'manques', '[]'::jsonb);
  END IF;

  plan_ok := o.plan_url IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM public.affaire_documents d
      WHERE (d.objet_id = o.id OR d.fabrication_objet_id = o.id)
        AND d.deleted_at IS NULL
        AND (COALESCE(d.mime_type, '') ILIKE '%pdf%' OR COALESCE(d.filename, '') ILIKE '%.pdf')
    );

  CASE e.type_etape
    WHEN 'be' THEN
      NULL; -- le BE produit l'information, il ne l'attend pas
    WHEN 'usinage' THEN
      IF NOT plan_ok THEN manques := manques || 'Plan technique non publié'; END IF;
    WHEN 'respo_fab' THEN
      IF NOT plan_ok THEN manques := manques || 'Plan technique non publié'; END IF;
    WHEN 'finition' THEN
      IF o.type_finition IS NULL THEN
        manques := manques || 'Type de finition manquant';
      END IF;
      IF COALESCE(o.est_brut, false) = false
         AND COALESCE(NULLIF(TRIM(o.finition_detail), ''), NULL) IS NULL THEN
        manques := manques || 'Détail de finition manquant';
      END IF;
    WHEN 'manutention' THEN
      IF o.largeur_mm IS NULL OR o.longueur_mm IS NULL OR o.hauteur_mm IS NULL THEN
        manques := manques || 'Dimensions finales manquantes';
      END IF;
    ELSE
      NULL;
  END CASE;

  RETURN jsonb_build_object(
    'prete', COALESCE(array_length(manques, 1), 0) = 0,
    'manques', to_jsonb(manques)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.etape_prete(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.etape_prete(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.etape_prete(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.etapes_pretes_batch(_objet_ids uuid[])
RETURNS TABLE (
  etape_id uuid,
  objet_id uuid,
  type_etape public.fabrication_etape_type,
  statut public.fabrication_etape_statut,
  prete boolean,
  manques jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    e.id,
    e.objet_id,
    e.type_etape,
    e.statut,
    COALESCE((public.etape_prete(e.id) ->> 'prete')::boolean, true),
    COALESCE(public.etape_prete(e.id) -> 'manques', '[]'::jsonb)
  FROM public.fabrication_etapes e
  WHERE e.objet_id = ANY(COALESCE(_objet_ids, ARRAY[]::uuid[]));
$$;

REVOKE ALL ON FUNCTION public.etapes_pretes_batch(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.etapes_pretes_batch(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.etapes_pretes_batch(uuid[]) TO service_role;

-- ---------- B2b : validation / invalidation d'étape ----------
CREATE OR REPLACE FUNCTION public.valider_etape(_etape_id uuid, _commentaire text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  e RECORD;
  o RECORD;
  uid uuid := auth.uid();
  peut boolean;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Authentification requise');
  END IF;

  SELECT * INTO e FROM public.fabrication_etapes WHERE id = _etape_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Étape introuvable');
  END IF;

  SELECT * INTO o FROM public.fabrication_objets WHERE id = e.objet_id;

  peut := public.is_admin() OR (o.respo_fab_id IS NOT NULL AND o.respo_fab_id = uid);
  IF NOT peut THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Seul le responsable fabrication de l''objet ou un administrateur peut valider');
  END IF;

  -- Juge et partie interdit, sauf sur l'étape du responsable fabrication.
  IF e.type_etape <> 'respo_fab'
     AND e.assignee_id IS NOT NULL
     AND e.assignee_id = uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Vous ne pouvez pas valider une étape qui vous est assignée');
  END IF;

  UPDATE public.fabrication_etapes
     SET statut = 'termine',
         validateur_id = uid,
         date_fin = COALESCE(date_fin, now()),
         commentaire = COALESCE(NULLIF(TRIM(COALESCE(_commentaire, '')), ''), commentaire)
   WHERE id = _etape_id;

  INSERT INTO public.objet_journal_events (objet_id, affaire_id, event_type, actor_id, etape_id, payload)
  VALUES (
    e.objet_id,
    o.affaire_id,
    'etape_validee',
    uid,
    e.id,
    jsonb_build_object('type_etape', e.type_etape::text, 'commentaire', NULLIF(TRIM(COALESCE(_commentaire, '')), ''))
  );

  RETURN jsonb_build_object('ok', true, 'etape_id', _etape_id, 'statut', 'termine');
END;
$$;

REVOKE ALL ON FUNCTION public.valider_etape(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.valider_etape(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.valider_etape(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.invalider_etape(_etape_id uuid, _motif text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  e RECORD;
  o RECORD;
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Authentification requise');
  END IF;
  IF NULLIF(TRIM(COALESCE(_motif, '')), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Motif obligatoire');
  END IF;

  SELECT * INTO e FROM public.fabrication_etapes WHERE id = _etape_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Étape introuvable');
  END IF;

  SELECT * INTO o FROM public.fabrication_objets WHERE id = e.objet_id;

  IF NOT (public.is_admin() OR (o.respo_fab_id IS NOT NULL AND o.respo_fab_id = uid)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Seul le responsable fabrication de l''objet ou un administrateur peut invalider');
  END IF;

  UPDATE public.fabrication_etapes
     SET statut = 'a_faire',
         validateur_id = NULL,
         date_fin = NULL
   WHERE id = _etape_id;

  INSERT INTO public.objet_journal_events (objet_id, affaire_id, event_type, actor_id, etape_id, payload)
  VALUES (
    e.objet_id,
    o.affaire_id,
    'etape_invalidee',
    uid,
    e.id,
    jsonb_build_object('type_etape', e.type_etape::text, 'motif', TRIM(_motif))
  );

  RETURN jsonb_build_object('ok', true, 'etape_id', _etape_id, 'statut', 'a_faire');
END;
$$;

REVOKE ALL ON FUNCTION public.invalider_etape(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invalider_etape(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invalider_etape(uuid, text) TO service_role;

-- ---------- B4 : cohérence heures ↔ étapes ----------
CREATE OR REPLACE FUNCTION public.sync_etape_from_heures_metier()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_code text;
  v_type public.fabrication_etape_type;
BEGIN
  BEGIN
    IF COALESCE(NEW.heures_prevues, 0) <= 0 THEN
      RETURN NEW;
    END IF;

    SELECT code INTO v_code FROM public.metiers WHERE id = NEW.metier_id;

    v_type := CASE v_code
      WHEN 'suivi_projet' THEN 'be'::public.fabrication_etape_type
      WHEN 'numerique'    THEN 'usinage'::public.fabrication_etape_type
      ELSE NULL
    END;

    IF v_type IS NULL THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.fabrication_etapes (objet_id, type_etape, statut)
    VALUES (NEW.objet_id, v_type, 'a_faire')
    ON CONFLICT (objet_id, type_etape) DO NOTHING;

    UPDATE public.fabrication_etapes
       SET statut = 'a_faire'
     WHERE objet_id = NEW.objet_id
       AND type_etape = v_type
       AND statut = 'non_applicable';
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW; -- garde-fou : ne bloque jamais la saisie d'heures
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_etape_from_heures_metier ON public.objet_heures_metier;
CREATE TRIGGER trg_sync_etape_from_heures_metier
AFTER INSERT OR UPDATE OF heures_prevues, metier_id ON public.objet_heures_metier
FOR EACH ROW EXECUTE FUNCTION public.sync_etape_from_heures_metier();