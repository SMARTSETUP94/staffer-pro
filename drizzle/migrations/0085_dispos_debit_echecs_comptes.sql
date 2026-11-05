-- Le compteur anti-abus doit aussi compter les tentatives refusées :
-- les erreurs de validation sont renvoyées dans {erreur} (sous-bloc), le compteur reste enregistré.
-- L'adresse retenue est celle ajoutée par l'infrastructure (dernière de x-forwarded-for), pas celle déclarée par le navigateur.
CREATE OR REPLACE FUNCTION public.dispos_ip()
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce(
    nullif(btrim((current_setting('request.headers', true))::json->>'cf-connecting-ip'), ''),
    nullif(btrim(reverse(split_part(reverse(
      coalesce((current_setting('request.headers', true))::json->>'x-forwarded-for', '')), ',', 1))), ''),
    'inconnue')
$$;
REVOKE ALL ON FUNCTION public.dispos_ip() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.dispos_public_identifier(
  _prenom text, _nom text, _telephone text,
  _permis text[] DEFAULT '{}', _caces text[] DEFAULT '{}', _caces_autre text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE tel text; jeton text; r public.dispos_intervenants; norm text; connu boolean;
BEGIN
  PERFORM public.dispos_debit('ip:' || public.dispos_ip());
  BEGIN
    IF char_length(btrim(coalesce(_prenom,''))) NOT BETWEEN 1 AND 50
       OR char_length(btrim(coalesce(_nom,''))) NOT BETWEEN 1 AND 50 THEN
      RAISE EXCEPTION 'Prénom et nom obligatoires (50 caractères max.)' USING ERRCODE = '22023';
    END IF;
    tel := regexp_replace(coalesce(_telephone,''), '[^0-9+]', '', 'g');
    IF tel LIKE '+33%' THEN tel := '0' || substr(tel, 4); END IF;
    IF tel LIKE '0033%' THEN tel := '0' || substr(tel, 5); END IF;
    IF tel !~ '^0[67][0-9]{8}$' THEN
      RAISE EXCEPTION 'Numéro de portable invalide (06 ou 07, 10 chiffres)' USING ERRCODE = '22023';
    END IF;
    PERFORM public.dispos_valider_qualifs(_permis, _caces, _caces_autre);
    jeton := encode(extensions.gen_random_bytes(32), 'hex');

    SELECT * INTO r FROM public.dispos_intervenants WHERE telephone = tel;
    IF r.id IS NOT NULL THEN
      IF NOT r.actif THEN RAISE EXCEPTION 'Contactez l''équipe logistique' USING ERRCODE = 'P0001'; END IF;
      UPDATE public.dispos_intervenants
         SET jeton_hash = encode(extensions.digest(jeton, 'sha256'), 'hex'),
             permis = CASE WHEN cardinality(coalesce(_permis,'{}')) > 0 THEN _permis ELSE permis END,
             caces = CASE WHEN cardinality(coalesce(_caces,'{}')) > 0 THEN _caces ELSE caces END,
             caces_autre = coalesce(nullif(btrim(coalesce(_caces_autre,'')),''), caces_autre)
       WHERE id = r.id RETURNING * INTO r;
    ELSE
      norm := regexp_replace(lower(extensions.unaccent(
        initcap(lower(btrim(_prenom))) || ' ' || btrim(_nom))), '\s+', ' ', 'g');
      SELECT EXISTS (SELECT 1 FROM public.dispos_intervenants WHERE nom_normalise = norm) INTO connu;
      INSERT INTO public.dispos_intervenants (prenom, nom, telephone, permis, caces, caces_autre, a_valider, jeton_hash)
      VALUES (_prenom, _nom, tel, coalesce(_permis,'{}'), coalesce(_caces,'{}'), _caces_autre, connu,
              encode(extensions.digest(jeton, 'sha256'), 'hex'))
      RETURNING * INTO r;
    END IF;
    RETURN jsonb_build_object('jeton', jeton, 'prenom', r.prenom);
  EXCEPTION WHEN raise_exception OR invalid_parameter_value OR check_violation OR no_data_found THEN
    RETURN jsonb_build_object('erreur', SQLERRM);
  END;
END $$;

CREATE OR REPLACE FUNCTION public.dispos_public_enregistrer(_jeton text, _jours jsonb, _note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.dispos_intervenants; s public.dispos_semaines; e jsonb; j date;
  vj boolean; vs boolean; vp boolean;
BEGIN
  PERFORM public.dispos_debit('ip:' || public.dispos_ip());
  BEGIN
    r := public.dispos_intervenant_par_jeton(_jeton);
  EXCEPTION WHEN no_data_found THEN RETURN jsonb_build_object('erreur', SQLERRM, 'session', false);
  END;
  PERFORM public.dispos_debit('jeton:' || r.id::text);
  BEGIN
    s := public.dispos_semaine_ouverte();
    IF now() > s.heure_limite THEN
      RAISE EXCEPTION 'Les dispos sont closes, contactez l''équipe logistique' USING ERRCODE = 'P0001';
    END IF;
    IF jsonb_typeof(_jours) <> 'array' OR jsonb_array_length(_jours) > 7 THEN
      RAISE EXCEPTION 'Format invalide' USING ERRCODE = '22023';
    END IF;
    IF char_length(coalesce(_note,'')) > 500 THEN
      RAISE EXCEPTION 'Message trop long (500 caractères max.)' USING ERRCODE = '22023';
    END IF;
    FOR e IN SELECT * FROM jsonb_array_elements(_jours) LOOP
      IF jsonb_typeof(e->'journee') IS DISTINCT FROM 'boolean' OR jsonb_typeof(e->'soiree') IS DISTINCT FROM 'boolean'
         OR jsonb_typeof(e->'pas_dispo') IS DISTINCT FROM 'boolean' OR coalesce(e->>'jour','') !~ '^\d{4}-\d{2}-\d{2}$' THEN
        RAISE EXCEPTION 'Format invalide' USING ERRCODE = '22023';
      END IF;
      j := (e->>'jour')::date;
      IF j NOT BETWEEN s.debut AND s.debut + 6 THEN
        RAISE EXCEPTION 'Jour hors de la semaine ouverte' USING ERRCODE = '22023';
      END IF;
      vj := (e->>'journee')::boolean; vs := (e->>'soiree')::boolean; vp := (e->>'pas_dispo')::boolean;
      IF vp AND (vj OR vs) THEN RAISE EXCEPTION 'Choix incompatibles' USING ERRCODE = '22023'; END IF;
      IF NOT (vj OR vs OR vp) THEN
        DELETE FROM public.dispos_jours WHERE intervenant_id = r.id AND jour = j;
      ELSE
        INSERT INTO public.dispos_jours (intervenant_id, jour, journee, soiree, pas_dispo, source, maj_le, maj_par)
        VALUES (r.id, j, vj, vs, vp, 'formulaire', now(), NULL)
        ON CONFLICT (intervenant_id, jour) DO UPDATE
          SET journee = EXCLUDED.journee, soiree = EXCLUDED.soiree, pas_dispo = EXCLUDED.pas_dispo,
              source = 'formulaire', maj_le = now(), maj_par = NULL;
      END IF;
    END LOOP;
    INSERT INTO public.dispos_notes (intervenant_id, semaine, note, envoye_le)
    VALUES (r.id, s.debut, nullif(btrim(coalesce(_note,'')),''), now())
    ON CONFLICT (intervenant_id, semaine) DO UPDATE SET note = EXCLUDED.note, envoye_le = now();
  EXCEPTION WHEN raise_exception OR invalid_parameter_value OR check_violation OR invalid_datetime_format OR datetime_field_overflow THEN
    RETURN jsonb_build_object('erreur', SQLERRM);
  END;
  RETURN public.dispos_public_moi(_jeton);
END $$;

CREATE OR REPLACE FUNCTION public.dispos_public_maj_qualifs(_jeton text, _permis text[], _caces text[], _caces_autre text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.dispos_intervenants;
BEGIN
  PERFORM public.dispos_debit('ip:' || public.dispos_ip());
  BEGIN
    r := public.dispos_intervenant_par_jeton(_jeton);
  EXCEPTION WHEN no_data_found THEN RETURN jsonb_build_object('erreur', SQLERRM, 'session', false);
  END;
  PERFORM public.dispos_debit('jeton:' || r.id::text);
  BEGIN
    PERFORM public.dispos_valider_qualifs(_permis, _caces, _caces_autre);
    UPDATE public.dispos_intervenants
       SET permis = coalesce(_permis,'{}'), caces = coalesce(_caces,'{}'), caces_autre = _caces_autre
     WHERE id = r.id;
  EXCEPTION WHEN invalid_parameter_value OR check_violation THEN
    RETURN jsonb_build_object('erreur', SQLERRM);
  END;
  RETURN public.dispos_public_moi(_jeton);
END $$;