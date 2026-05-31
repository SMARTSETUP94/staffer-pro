-- Enable pg_trgm for similarity matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Index on clients.nom_normalise for trigram similarity
CREATE INDEX IF NOT EXISTS idx_clients_nom_normalise_trgm
  ON public.clients USING gin (nom_normalise gin_trgm_ops);

-- RPC: detect probable duplicate clients (paired by trigram similarity)
CREATE OR REPLACE FUNCTION public.detect_client_duplicates(min_similarity real DEFAULT 0.5)
RETURNS TABLE (
  client_a_id uuid,
  client_a_nom text,
  client_a_domaines text[],
  client_a_nb_affaires bigint,
  client_a_nb_contacts bigint,
  client_b_id uuid,
  client_b_nom text,
  client_b_domaines text[],
  client_b_nb_affaires bigint,
  client_b_nb_contacts bigint,
  similarity real
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.id, a.nom, a.domaines_email,
    (SELECT count(*) FROM public.affaires WHERE client_id = a.id),
    (SELECT count(*) FROM public.client_contacts WHERE client_id = a.id),
    b.id, b.nom, b.domaines_email,
    (SELECT count(*) FROM public.affaires WHERE client_id = b.id),
    (SELECT count(*) FROM public.client_contacts WHERE client_id = b.id),
    similarity(a.nom_normalise, b.nom_normalise) AS sim
  FROM public.clients a
  JOIN public.clients b
    ON a.id < b.id
   AND a.nom_normalise % b.nom_normalise
  WHERE similarity(a.nom_normalise, b.nom_normalise) >= min_similarity
  ORDER BY sim DESC, a.nom, b.nom
  LIMIT 200;
$$;

GRANT EXECUTE ON FUNCTION public.detect_client_duplicates(real) TO authenticated;

-- RPC: merge two clients (transfer all child rows from source to target, then delete source)
CREATE OR REPLACE FUNCTION public.merge_clients(source_id uuid, target_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_affaires int := 0;
  v_emails int := 0;
  v_contacts int := 0;
  v_source_domaines text[];
  v_target_domaines text[];
BEGIN
  -- Permission check: admin only
  IF NOT public.user_has_capability(auth.uid(), 'clients.merge') THEN
    RAISE EXCEPTION 'Permission refusée: capability clients.merge requise';
  END IF;

  IF source_id = target_id THEN
    RAISE EXCEPTION 'source_id et target_id doivent être différents';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = source_id) THEN
    RAISE EXCEPTION 'Client source introuvable';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = target_id) THEN
    RAISE EXCEPTION 'Client cible introuvable';
  END IF;

  -- Merge domains arrays (union, dedup)
  SELECT domaines_email INTO v_source_domaines FROM public.clients WHERE id = source_id;
  SELECT domaines_email INTO v_target_domaines FROM public.clients WHERE id = target_id;

  UPDATE public.clients
     SET domaines_email = ARRAY(
           SELECT DISTINCT unnest(COALESCE(v_target_domaines, '{}') || COALESCE(v_source_domaines, '{}'))
         ),
         updated_at = now()
   WHERE id = target_id;

  -- Reassign affaires
  UPDATE public.affaires SET client_id = target_id WHERE client_id = source_id;
  GET DIAGNOSTICS v_affaires = ROW_COUNT;

  -- Reassign emails_entrants
  UPDATE public.emails_entrants SET client_id = target_id WHERE client_id = source_id;
  GET DIAGNOSTICS v_emails = ROW_COUNT;

  -- Reassign contacts
  UPDATE public.client_contacts SET client_id = target_id WHERE client_id = source_id;
  GET DIAGNOSTICS v_contacts = ROW_COUNT;

  -- Delete source
  DELETE FROM public.clients WHERE id = source_id;

  RETURN jsonb_build_object(
    'success', true,
    'target_id', target_id,
    'source_id', source_id,
    'affaires_transferees', v_affaires,
    'emails_transferes', v_emails,
    'contacts_transferes', v_contacts
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.merge_clients(uuid, uuid) TO authenticated;