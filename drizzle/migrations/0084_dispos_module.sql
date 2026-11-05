CREATE TABLE public.dispos_intervenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prenom text NOT NULL CHECK (char_length(btrim(prenom)) BETWEEN 1 AND 50),
  nom text NOT NULL CHECK (char_length(btrim(nom)) BETWEEN 1 AND 50),
  nom_normalise text NOT NULL DEFAULT '',
  telephone text NOT NULL CHECK (telephone ~ '^0[67][0-9]{8}$'),
  permis text[] NOT NULL DEFAULT '{}'
    CHECK (permis <@ ARRAY['B','C','CE','aucun']::text[]
           AND NOT ('aucun' = ANY(permis) AND cardinality(permis) > 1)),
  caces text[] NOT NULL DEFAULT '{}'
    CHECK (caces <@ ARRAY['R489','R486','aucun']::text[]
           AND NOT ('aucun' = ANY(caces) AND cardinality(caces) > 1)),
  caces_autre text CHECK (char_length(caces_autre) <= 60),
  actif boolean NOT NULL DEFAULT true,
  employe_id uuid REFERENCES public.employes(id) ON DELETE SET NULL,
  a_valider boolean NOT NULL DEFAULT false,
  jeton_hash text UNIQUE,
  cree_le timestamptz NOT NULL DEFAULT now(),
  UNIQUE (telephone)
);
CREATE INDEX dispos_intervenants_nom_norm_idx ON public.dispos_intervenants (nom_normalise);

CREATE TABLE public.dispos_semaines (
  debut date PRIMARY KEY CHECK (extract(isodow FROM debut) = 1),
  heure_limite timestamptz NOT NULL,
  cree_le timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.dispos_jours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intervenant_id uuid NOT NULL REFERENCES public.dispos_intervenants(id) ON DELETE CASCADE,
  jour date NOT NULL,
  journee boolean NOT NULL DEFAULT false,
  soiree boolean NOT NULL DEFAULT false,
  pas_dispo boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'formulaire' CHECK (source IN ('formulaire','saisie_logistique')),
  maj_le timestamptz NOT NULL DEFAULT now(),
  maj_par uuid,
  UNIQUE (intervenant_id, jour),
  CHECK (NOT (pas_dispo AND (journee OR soiree)))
);

CREATE TABLE public.dispos_notes (
  intervenant_id uuid NOT NULL REFERENCES public.dispos_intervenants(id) ON DELETE CASCADE,
  semaine date NOT NULL REFERENCES public.dispos_semaines(debut) ON DELETE CASCADE,
  note text CHECK (char_length(note) <= 500),
  envoye_le timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (intervenant_id, semaine)
);

CREATE TABLE public.dispos_rate_limit (
  cle text NOT NULL,
  fenetre timestamptz NOT NULL,
  nb int NOT NULL DEFAULT 0,
  PRIMARY KEY (cle, fenetre)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispos_intervenants, public.dispos_jours,
  public.dispos_semaines, public.dispos_notes TO authenticated;
GRANT ALL ON public.dispos_intervenants, public.dispos_jours, public.dispos_semaines,
  public.dispos_notes, public.dispos_rate_limit TO service_role;
REVOKE ALL ON public.dispos_intervenants, public.dispos_jours, public.dispos_semaines,
  public.dispos_notes, public.dispos_rate_limit FROM anon;

ALTER TABLE public.dispos_intervenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispos_jours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispos_semaines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispos_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispos_rate_limit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dispos_logistique" ON public.dispos_intervenants FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'logistique'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'logistique'));
CREATE POLICY "dispos_logistique" ON public.dispos_jours FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'logistique'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'logistique'));
CREATE POLICY "dispos_logistique" ON public.dispos_semaines FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'logistique'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'logistique'));
CREATE POLICY "dispos_logistique" ON public.dispos_notes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'logistique'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'logistique'));

CREATE POLICY "dispos_chef_lecture" ON public.dispos_intervenants FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'chef_chantier'));
CREATE POLICY "dispos_chef_lecture" ON public.dispos_jours FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'chef_chantier'));
CREATE POLICY "dispos_chef_lecture" ON public.dispos_semaines FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'chef_chantier'));
CREATE POLICY "dispos_chef_lecture" ON public.dispos_notes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'chef_chantier'));

CREATE OR REPLACE FUNCTION public.dispos_intervenants_normaliser()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, extensions AS $$
BEGIN
  NEW.prenom := initcap(lower(regexp_replace(btrim(NEW.prenom), '\s+', ' ', 'g')));
  NEW.nom := regexp_replace(btrim(NEW.nom), '\s+', ' ', 'g');
  NEW.nom_normalise := lower(extensions.unaccent(NEW.prenom || ' ' || NEW.nom));
  NEW.nom_normalise := regexp_replace(NEW.nom_normalise, '\s+', ' ', 'g');
  NEW.caces_autre := nullif(btrim(coalesce(NEW.caces_autre, '')), '');
  RETURN NEW;
END $$;
CREATE TRIGGER trg_dispos_intervenants_normaliser
  BEFORE INSERT OR UPDATE ON public.dispos_intervenants
  FOR EACH ROW EXECUTE FUNCTION public.dispos_intervenants_normaliser();

CREATE OR REPLACE FUNCTION public.dispos_semaine_ouverte()
RETURNS public.dispos_semaines LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d date; r public.dispos_semaines;
BEGIN
  d := (date_trunc('week', (now() AT TIME ZONE 'Europe/Paris'))::date + 7);
  INSERT INTO public.dispos_semaines (debut, heure_limite)
  VALUES (d, ((d - 3)::timestamp + interval '12 hours') AT TIME ZONE 'Europe/Paris')
  ON CONFLICT (debut) DO NOTHING;
  SELECT * INTO r FROM public.dispos_semaines WHERE debut = d;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.dispos_debit(_cle text, _max int DEFAULT 20)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f timestamptz; n int;
BEGIN
  f := to_timestamp(floor(extract(epoch FROM now()) / 600) * 600);
  INSERT INTO public.dispos_rate_limit (cle, fenetre, nb) VALUES (_cle, f, 1)
  ON CONFLICT (cle, fenetre) DO UPDATE SET nb = dispos_rate_limit.nb + 1
  RETURNING nb INTO n;
  DELETE FROM public.dispos_rate_limit WHERE fenetre < now() - interval '1 day';
  IF n > _max THEN
    RAISE EXCEPTION 'Trop de tentatives, réessayez dans quelques minutes.' USING ERRCODE = 'P0001';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.dispos_ip()
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce(nullif(btrim(split_part(
    coalesce((current_setting('request.headers', true))::json->>'x-forwarded-for', ''), ',', 1)), ''), 'inconnue')
$$;

CREATE OR REPLACE FUNCTION public.dispos_intervenant_par_jeton(_jeton text)
RETURNS public.dispos_intervenants LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE r public.dispos_intervenants;
BEGIN
  IF _jeton IS NULL OR _jeton !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Session inconnue' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO r FROM public.dispos_intervenants
   WHERE jeton_hash = encode(extensions.digest(_jeton, 'sha256'), 'hex') AND actif;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Session inconnue' USING ERRCODE = 'P0002'; END IF;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.dispos_valider_qualifs(_permis text[], _caces text[], _autre text)
RETURNS void LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF NOT (coalesce(_permis,'{}') <@ ARRAY['B','C','CE','aucun']::text[])
     OR ('aucun' = ANY(coalesce(_permis,'{}')) AND cardinality(_permis) > 1) THEN
    RAISE EXCEPTION 'Permis invalide' USING ERRCODE = '22023';
  END IF;
  IF NOT (coalesce(_caces,'{}') <@ ARRAY['R489','R486','aucun']::text[])
     OR ('aucun' = ANY(coalesce(_caces,'{}')) AND cardinality(_caces) > 1) THEN
    RAISE EXCEPTION 'CACES invalide' USING ERRCODE = '22023';
  END IF;
  IF char_length(coalesce(_autre,'')) > 60 THEN
    RAISE EXCEPTION 'Texte « Autre » trop long (60 caractères max.)' USING ERRCODE = '22023';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.dispos_public_semaine()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.dispos_semaines;
BEGIN
  s := public.dispos_semaine_ouverte();
  RETURN jsonb_build_object('debut', s.debut, 'fin', s.debut + 6,
    'heure_limite', s.heure_limite, 'close', now() > s.heure_limite);
END $$;

CREATE OR REPLACE FUNCTION public.dispos_public_identifier(
  _prenom text, _nom text, _telephone text,
  _permis text[] DEFAULT '{}', _caces text[] DEFAULT '{}', _caces_autre text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE tel text; jeton text; r public.dispos_intervenants; norm text; connu boolean;
BEGIN
  PERFORM public.dispos_debit('ip:' || public.dispos_ip());
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
END $$;

CREATE OR REPLACE FUNCTION public.dispos_public_moi(_jeton text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.dispos_intervenants; s public.dispos_semaines;
BEGIN
  r := public.dispos_intervenant_par_jeton(_jeton);
  s := public.dispos_semaine_ouverte();
  RETURN jsonb_build_object(
    'prenom', r.prenom, 'permis', to_jsonb(r.permis), 'caces', to_jsonb(r.caces), 'caces_autre', r.caces_autre,
    'semaine', jsonb_build_object('debut', s.debut, 'fin', s.debut + 6,
       'heure_limite', s.heure_limite, 'close', now() > s.heure_limite),
    'jours', coalesce((SELECT jsonb_agg(jsonb_build_object('jour', jour, 'journee', journee, 'soiree', soiree, 'pas_dispo', pas_dispo) ORDER BY jour)
       FROM public.dispos_jours WHERE intervenant_id = r.id AND jour BETWEEN s.debut AND s.debut + 6), '[]'::jsonb),
    'precedente', coalesce((SELECT jsonb_agg(jsonb_build_object('jour', jour + 7, 'journee', journee, 'soiree', soiree, 'pas_dispo', pas_dispo) ORDER BY jour)
       FROM public.dispos_jours WHERE intervenant_id = r.id AND jour BETWEEN s.debut - 7 AND s.debut - 1), '[]'::jsonb),
    'note', (SELECT note FROM public.dispos_notes WHERE intervenant_id = r.id AND semaine = s.debut),
    'envoye_le', (SELECT envoye_le FROM public.dispos_notes WHERE intervenant_id = r.id AND semaine = s.debut));
END $$;

CREATE OR REPLACE FUNCTION public.dispos_public_enregistrer(_jeton text, _jours jsonb, _note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.dispos_intervenants; s public.dispos_semaines; e jsonb; j date;
  vj boolean; vs boolean; vp boolean;
BEGIN
  PERFORM public.dispos_debit('ip:' || public.dispos_ip());
  r := public.dispos_intervenant_par_jeton(_jeton);
  PERFORM public.dispos_debit('jeton:' || r.id::text);
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
    IF jsonb_typeof(e->'journee') <> 'boolean' OR jsonb_typeof(e->'soiree') <> 'boolean'
       OR jsonb_typeof(e->'pas_dispo') <> 'boolean' OR (e->>'jour') !~ '^\d{4}-\d{2}-\d{2}$' THEN
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
  RETURN public.dispos_public_moi(_jeton);
END $$;

CREATE OR REPLACE FUNCTION public.dispos_public_maj_qualifs(_jeton text, _permis text[], _caces text[], _caces_autre text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.dispos_intervenants;
BEGIN
  PERFORM public.dispos_debit('ip:' || public.dispos_ip());
  r := public.dispos_intervenant_par_jeton(_jeton);
  PERFORM public.dispos_debit('jeton:' || r.id::text);
  PERFORM public.dispos_valider_qualifs(_permis, _caces, _caces_autre);
  UPDATE public.dispos_intervenants
     SET permis = coalesce(_permis,'{}'), caces = coalesce(_caces,'{}'), caces_autre = _caces_autre
   WHERE id = r.id;
  RETURN public.dispos_public_moi(_jeton);
END $$;

REVOKE ALL ON FUNCTION public.dispos_semaine_ouverte(), public.dispos_debit(text, int), public.dispos_ip(),
  public.dispos_intervenant_par_jeton(text), public.dispos_valider_qualifs(text[], text[], text),
  public.dispos_intervenants_normaliser() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dispos_public_semaine(),
  public.dispos_public_identifier(text, text, text, text[], text[], text),
  public.dispos_public_moi(text), public.dispos_public_enregistrer(text, jsonb, text),
  public.dispos_public_maj_qualifs(text, text[], text[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dispos_public_semaine(),
  public.dispos_public_identifier(text, text, text, text[], text[], text),
  public.dispos_public_moi(text), public.dispos_public_enregistrer(text, jsonb, text),
  public.dispos_public_maj_qualifs(text, text[], text[], text) TO anon, authenticated;

INSERT INTO public.capabilities (key, label, description, category, sort_order) VALUES
  ('dispos.view', 'Voir les dispos', 'Écran Dispos (lecture)', 'logistique', 90),
  ('dispos.edit', 'Corriger les dispos', 'Corriger une cellule, ajouter une personne, régler l''heure limite', 'logistique', 91)
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.role_capabilities (role, capability, granted) VALUES
  ('admin','dispos.view',true), ('logistique','dispos.view',true), ('chef_chantier','dispos.view',true),
  ('admin','dispos.edit',true), ('logistique','dispos.edit',true)
ON CONFLICT (role, capability) DO UPDATE SET granted = EXCLUDED.granted;