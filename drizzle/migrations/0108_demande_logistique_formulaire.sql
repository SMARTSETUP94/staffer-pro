ALTER TABLE public.logistique_parametres
  ADD COLUMN IF NOT EXISTS demande_log_jeton_hash text,
  ADD COLUMN IF NOT EXISTS demande_log_jeton_cree_le timestamptz;

-- Jeton valide ; NULL accepté uniquement pour le rôle serveur (fonction de l'app après authentification)
CREATE OR REPLACE FUNCTION public.demande_log_acces(_jeton text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN _jeton IS NULL THEN coalesce(auth.role(),'') = 'service_role' OR session_user = 'service_role' OR current_setting('request.jwt.claim.role', true) = 'service_role'
    ELSE length(_jeton) >= 32 AND EXISTS (SELECT 1 FROM logistique_parametres
      WHERE demande_log_jeton_hash = encode(extensions.digest(_jeton,'sha256'),'hex')) END;
$$;

CREATE OR REPLACE FUNCTION public.demande_log_jeton_regenerer()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v text := encode(extensions.gen_random_bytes(24),'hex');
BEGIN
  PERFORM public.mcp_assert_legacy_oauth_write('demande_log_jeton_regenerer');
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Réservé aux admins'; END IF;
  UPDATE logistique_parametres SET demande_log_jeton_hash = encode(extensions.digest(v,'sha256'),'hex'),
    demande_log_jeton_cree_le = now() WHERE true;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.demande_log_jeton_etat()
RETURNS timestamptz LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Réservé aux admins'; END IF;
  RETURN (SELECT demande_log_jeton_cree_le FROM logistique_parametres WHERE demande_log_jeton_hash IS NOT NULL LIMIT 1);
END $$;

CREATE OR REPLACE FUNCTION public.demande_log_public_personnes(_jeton text)
RETURNS TABLE(id uuid, libelle text, chef boolean, employe_id uuid) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.demande_log_acces(_jeton) THEN RAISE EXCEPTION 'Lien invalide'; END IF;
  RETURN QUERY
    SELECT d.id, trim(initcap(coalesce(d.prenom,''))||' '||upper(left(coalesce(d.nom,''),1))||'.'), coalesce(d.est_chef_equipe_terrain,false),
           CASE WHEN _jeton IS NULL THEN d.employe_id END
      FROM dispos_intervenants d WHERE d.actif
    UNION ALL
    SELECT e.id, trim(initcap(coalesce(e.prenom,''))||' '||upper(left(coalesce(e.nom,''),1))||'.'), false,
           CASE WHEN _jeton IS NULL THEN e.id END
      FROM employes e WHERE e.actif AND NOT EXISTS (SELECT 1 FROM dispos_intervenants d WHERE d.employe_id=e.id)
    ORDER BY 2;
END $$;

CREATE OR REPLACE FUNCTION public.demande_log_public_projet(_jeton text, _numero text)
RETURNS TABLE(id uuid, numero text, nom text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.demande_log_acces(_jeton) THEN RAISE EXCEPTION 'Lien invalide'; END IF;
  IF _numero !~ '^\d{4,5}$' THEN RETURN; END IF;
  RETURN QUERY SELECT a.id, a.numero, a.nom FROM affaires a
    WHERE a.numero=_numero AND a.archived_at IS NULL AND a.statut NOT IN ('termine','annule') LIMIT 1;
END $$;

CREATE OR REPLACE FUNCTION public.demande_log_public_vehicules(_jeton text)
RETURNS TABLE(id uuid, nom text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.demande_log_acces(_jeton) THEN RAISE EXCEPTION 'Lien invalide'; END IF;
  RETURN QUERY SELECT v.id, v.nom FROM vehicules v WHERE v.actif ORDER BY v.nom;
END $$;

CREATE OR REPLACE FUNCTION public.demande_log_public_creer(_jeton text, _cle text, _demandeur uuid,
  _projet uuid, _interventions jsonb, _nb_fichiers int DEFAULT 0)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid := gen_random_uuid(); v_nb int; v_nom text; v_aff record; v_type text; v_date text; i jsonb;
BEGIN
  IF NOT public.demande_log_acces(_jeton) THEN RAISE EXCEPTION 'Lien invalide'; END IF;
  INSERT INTO dispos_rate_limit(cle,fenetre,nb) VALUES ('demlog:'||coalesce(_cle,'?'), date_trunc('hour',now()),1)
    ON CONFLICT (cle,fenetre) DO UPDATE SET nb = dispos_rate_limit.nb+1 RETURNING nb INTO v_nb;
  IF v_nb > (CASE WHEN _jeton IS NULL THEN 30 ELSE 5 END) THEN RAISE EXCEPTION 'Trop d''envois, réessayez plus tard'; END IF;
  SELECT coalesce((SELECT trim(prenom||' '||nom) FROM dispos_intervenants WHERE id=_demandeur AND actif),
                  (SELECT trim(prenom||' '||nom) FROM employes WHERE id=_demandeur AND actif)) INTO v_nom;
  SELECT a.id,a.numero,a.nom INTO v_aff FROM affaires a
    WHERE a.id=_projet AND a.archived_at IS NULL AND a.statut NOT IN ('termine','annule');
  IF v_nom IS NULL OR v_aff.id IS NULL THEN RAISE EXCEPTION 'Demandeur ou projet inconnu'; END IF;
  IF jsonb_typeof(_interventions)<>'array' OR jsonb_array_length(_interventions) NOT BETWEEN 1 AND 10
     OR length(_interventions::text) > 20000 OR _nb_fichiers NOT BETWEEN 0 AND 5 THEN
    RAISE EXCEPTION 'Demande invalide'; END IF;
  FOR i IN SELECT * FROM jsonb_array_elements(_interventions) LOOP
    IF (i->>'type') NOT IN ('appro','emballage','chargement','livraison','tracage','montage','finitions','permanence','rotation','demontage','dechargement')
       OR coalesce(i->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Intervention invalide'; END IF;
  END LOOP;
  v_type := _interventions->0->>'type'; v_date := _interventions->0->>'date';
  INSERT INTO emails_entrants(id, message_id_outlook, source_boite, from_email, from_name, subject,
     received_at, categorie_ia, confiance_ia, statut, metadata_ia)
  VALUES (v_id, 'formulaire:'||v_id, 'logistique', 'formulaire@staffing.setup.paris',
     v_nom || CASE WHEN _jeton IS NULL THEN '' ELSE ' (déclaré)' END,
     'LOG – '||v_aff.numero||' – '||v_type||' – '||v_date, now(), 'logistique', 1, 'pending_review',
     jsonb_build_object('origine','formulaire','demandeur_id',_demandeur,'affaire_id',v_aff.id,
       'opp_projet', v_aff.numero||' — '||v_aff.nom,
       'fichiers_attendus',_nb_fichiers,'fichiers','[]'::jsonb,'echeances',_interventions));
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.demande_log_public_fichier(_jeton text, _demande uuid, _chemin text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.demande_log_acces(_jeton) THEN RAISE EXCEPTION 'Lien invalide'; END IF;
  IF _chemin !~ ('^' || _demande::text || '/[0-9a-f-]{36}\.(pdf|jpg|jpeg|png)$') THEN RAISE EXCEPTION 'Fichier invalide'; END IF;
  UPDATE emails_entrants SET metadata_ia = jsonb_set(metadata_ia,'{fichiers}', coalesce(metadata_ia->'fichiers','[]'::jsonb) || to_jsonb(_chemin))
   WHERE id=_demande AND metadata_ia->>'origine'='formulaire' AND created_at > now() - interval '1 hour'
     AND jsonb_array_length(coalesce(metadata_ia->'fichiers','[]'::jsonb)) < 5;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pièces jointes refusées'; END IF;
END $$;

REVOKE ALL ON FUNCTION public.demande_log_acces(text), public.demande_log_public_personnes(text),
  public.demande_log_public_projet(text,text), public.demande_log_public_vehicules(text),
  public.demande_log_public_creer(text,text,uuid,uuid,jsonb,int), public.demande_log_public_fichier(text,uuid,text),
  public.demande_log_jeton_regenerer(), public.demande_log_jeton_etat() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.demande_log_acces(text), public.demande_log_public_personnes(text), public.demande_log_public_projet(text,text),
  public.demande_log_public_vehicules(text), public.demande_log_public_creer(text,text,uuid,uuid,jsonb,int),
  public.demande_log_public_fichier(text,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.demande_log_jeton_regenerer(), public.demande_log_jeton_etat() TO authenticated;

-- Lecture des pièces jointes du formulaire par l'équipe logistique (bucket privé dédié)
CREATE POLICY demandes_log_lecture ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'demandes-logistique' AND public.user_has_cap('logistique.planning.view'));