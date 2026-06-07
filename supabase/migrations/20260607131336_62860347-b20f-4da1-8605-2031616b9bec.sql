
CREATE OR REPLACE FUNCTION public.import_clients_bulk(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row_data jsonb;
  v_nom text;
  v_norm text;
  v_domains text[];
  v_secteur text;
  v_siret text;
  v_notes text;
  v_email text;
  v_contact_nom text;
  v_contact_prenom text;
  v_telephone text;
  v_client_id uuid;
  v_existed boolean;
  v_inserted_clients int := 0;
  v_updated_clients int := 0;
  v_inserted_contacts int := 0;
  v_skipped int := 0;
BEGIN
  IF NOT public.is_chef_or_admin() THEN
    RAISE EXCEPTION 'Forbidden: admin or chef required';
  END IF;

  IF jsonb_typeof(payload) <> 'array' THEN
    RAISE EXCEPTION 'payload must be a JSON array';
  END IF;

  FOR row_data IN SELECT * FROM jsonb_array_elements(payload) LOOP
    v_nom := nullif(trim(coalesce(row_data->>'nom','')), '');
    IF v_nom IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_norm := public.normalize_client_name(v_nom);
    v_domains := COALESCE(
      ARRAY(SELECT lower(trim(d)) FROM jsonb_array_elements_text(coalesce(row_data->'domaines','[]'::jsonb)) d WHERE trim(d) <> ''),
      ARRAY[]::text[]
    );
    v_secteur := nullif(trim(coalesce(row_data->>'secteur','')), '');
    v_siret := nullif(trim(coalesce(row_data->>'siret','')), '');
    v_notes := nullif(trim(coalesce(row_data->>'notes','')), '');
    v_email := lower(nullif(trim(coalesce(row_data->>'email','')), ''));
    v_telephone := nullif(trim(coalesce(row_data->>'telephone','')), '');
    v_contact_nom := nullif(trim(coalesce(row_data->>'contact_nom','')), '');
    v_contact_prenom := nullif(trim(coalesce(row_data->>'contact_prenom','')), '');

    SELECT id INTO v_client_id FROM public.clients WHERE nom_normalise = v_norm LIMIT 1;
    v_existed := v_client_id IS NOT NULL;

    IF v_existed THEN
      UPDATE public.clients
      SET
        domaines_email = (
          SELECT COALESCE(array_agg(DISTINCT d), '{}'::text[])
          FROM unnest(domaines_email || v_domains) d
          WHERE d IS NOT NULL AND d <> ''
        ),
        secteur = COALESCE(secteur, v_secteur),
        siret = COALESCE(siret, v_siret),
        notes = CASE WHEN v_notes IS NULL THEN notes
                     WHEN notes IS NULL THEN v_notes
                     ELSE notes END
      WHERE id = v_client_id;
      v_updated_clients := v_updated_clients + 1;
    ELSE
      INSERT INTO public.clients(nom, domaines_email, secteur, siret, notes, created_by)
      VALUES (v_nom, v_domains, v_secteur, v_siret, v_notes, auth.uid())
      RETURNING id INTO v_client_id;
      v_inserted_clients := v_inserted_clients + 1;
    END IF;

    IF v_email IS NOT NULL OR v_telephone IS NOT NULL OR v_contact_nom IS NOT NULL THEN
      BEGIN
        INSERT INTO public.client_contacts(client_id, nom, prenom, email, telephone, created_by)
        VALUES (v_client_id, v_contact_nom, v_contact_prenom, v_email, v_telephone, auth.uid())
        ON CONFLICT (client_id, lower(email)) WHERE email IS NOT NULL DO NOTHING;
        IF FOUND THEN
          v_inserted_contacts := v_inserted_contacts + 1;
        END IF;
      EXCEPTION WHEN unique_violation THEN
        NULL;
      END;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'inserted_clients', v_inserted_clients,
    'updated_clients', v_updated_clients,
    'inserted_contacts', v_inserted_contacts,
    'skipped', v_skipped
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.import_clients_bulk(jsonb) TO authenticated;
