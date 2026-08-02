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
      NULL;
    WHEN 'usinage' THEN
      IF NOT plan_ok THEN
        manques := array_append(manques, 'Plan technique non publié'::text);
      END IF;
    WHEN 'respo_fab' THEN
      IF NOT plan_ok THEN
        manques := array_append(manques, 'Plan technique non publié'::text);
      END IF;
    WHEN 'finition' THEN
      IF o.type_finition IS NULL THEN
        manques := array_append(manques, 'Type de finition manquant'::text);
      END IF;
      IF COALESCE(o.est_brut, false) = false
         AND NULLIF(TRIM(COALESCE(o.finition_detail, '')), '') IS NULL THEN
        manques := array_append(manques, 'Détail de finition manquant'::text);
      END IF;
    WHEN 'manutention' THEN
      IF o.largeur_mm IS NULL OR o.longueur_mm IS NULL OR o.hauteur_mm IS NULL THEN
        manques := array_append(manques, 'Dimensions finales manquantes'::text);
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