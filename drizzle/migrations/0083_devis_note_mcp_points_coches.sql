ALTER TABLE public.devis ADD COLUMN IF NOT EXISTS note_mcp_coches jsonb NOT NULL DEFAULT '[]'::jsonb;
COMMENT ON COLUMN public.devis.note_mcp_coches IS 'Points de la note de Claude barrés par un humain (textes des points cochés).';

-- Cocher / décocher les points de la note de Claude : écriture via RPC (garde devis_assert_ecriture, tout statut).
CREATE OR REPLACE FUNCTION public.devis_note_mcp_cocher(_devis_id uuid, _coches jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM devis_assert_ecriture(_devis_id, false);
  IF jsonb_typeof(_coches) <> 'array' OR jsonb_array_length(_coches) > 200 THEN RAISE EXCEPTION 'Liste de points invalide'; END IF;
  UPDATE devis SET note_mcp_coches = _coches, updated_at = now() WHERE id = _devis_id;
END $function$;

REVOKE ALL ON FUNCTION public.devis_note_mcp_cocher(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devis_note_mcp_cocher(uuid, jsonb) TO authenticated;