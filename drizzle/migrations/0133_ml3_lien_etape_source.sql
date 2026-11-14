-- M-L3 — Lien étape ↔ source (mail, jalonnement, planning hebdomadaire) et détection de doublons.
-- Additive : colonnes nullables, nouvelles fonctions, une fonction redéfinie depuis sa version actuelle relue (13/11/2026).
-- Aucune ligne existante modifiée.

ALTER TABLE public.affaire_etapes_logistiques
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_email_id uuid REFERENCES public.emails_entrants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_jalonnement_id uuid REFERENCES public.jalonnements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_fichier text;

ALTER TABLE public.affaire_etapes_logistiques
  ADD CONSTRAINT affaire_etapes_source_type_chk
    CHECK (source_type IS NULL OR source_type IN ('email','jalonnement','planning_hebdo','manuel')),
  ADD CONSTRAINT affaire_etapes_source_fichier_chk
    CHECK (source_fichier IS NULL OR length(source_fichier) BETWEEN 1 AND 255),
  ADD CONSTRAINT affaire_etapes_source_coherence_chk CHECK (
    (source_email_id IS NULL OR source_type = 'email')
    AND (source_jalonnement_id IS NULL OR source_type = 'jalonnement'));

CREATE INDEX IF NOT EXISTS affaire_etapes_source_email_idx ON public.affaire_etapes_logistiques(source_email_id) WHERE source_email_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS affaire_etapes_source_jalonnement_idx ON public.affaire_etapes_logistiques(source_jalonnement_id) WHERE source_jalonnement_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS affaire_etapes_doublon_idx ON public.affaire_etapes_logistiques(affaire_id, type, date_debut) WHERE statut <> 'annule';

COMMENT ON COLUMN public.affaire_etapes_logistiques.source_type IS 'Origine de la demande : email, jalonnement, planning_hebdo, manuel (NULL = étape antérieure à M-L3).';
COMMENT ON COLUMN public.affaire_etapes_logistiques.proposition_id IS 'DEPRECATED: jamais alimentée ; remplacée par source_type / source_email_id / source_jalonnement_id / source_fichier.';

CREATE OR REPLACE FUNCTION public.logistique_etapes_doublons(_affaire_id uuid, _etapes jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'index', (p.ord - 1)::int, 'etape_id', e.id, 'date_debut', e.date_debut, 'date_fin', e.date_fin,
      'heure_debut', e.heure_debut, 'lieu_libre', e.lieu_libre, 'source_type', e.source_type, 'origine', e.origine)
    ORDER BY p.ord, e.date_debut), '[]'::jsonb)
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(_etapes) = 'array' AND jsonb_array_length(_etapes) <= 200 THEN _etapes ELSE '[]'::jsonb END)
       WITH ORDINALITY AS p(v, ord)
  JOIN public.affaire_etapes_logistiques e
    ON e.affaire_id = _affaire_id AND e.statut <> 'annule'
   AND e.type::text = p.v->>'type'
   AND (p.v->>'date_debut')::date BETWEEN e.date_debut AND coalesce(e.date_fin, e.date_debut)
   AND (e.heure_debut IS NULL OR nullif(p.v->>'heure_debut','') IS NULL
        OR abs(extract(epoch FROM (e.heure_debut - (p.v->>'heure_debut')::time))) <= 1800);
$$;

CREATE OR REPLACE FUNCTION public.logistique_etape_proposee_valide(_e jsonb)
RETURNS public.affaire_etapes_logistiques LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE k text; r public.affaire_etapes_logistiques;
BEGIN
  IF jsonb_typeof(_e) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Étape invalide'; END IF;
  FOR k IN SELECT jsonb_object_keys(_e) LOOP
    IF k NOT IN ('type','date_debut','date_fin','heure_debut','heure_fin','a_partir_de','duree_minutes','lieu_id','lieu_douteux','lieu_libre',
                 'vehicule_id','nb_personnes','commentaire_equipe','responsable','acces','note','calcul_regle','origine') THEN
      RAISE EXCEPTION 'Champ interdit : %', k;
    END IF;
  END LOOP;
  IF coalesce(_e->>'origine','jalonnement') NOT IN ('jalonnement','retroplanning') THEN RAISE EXCEPTION 'Origine invalide'; END IF;
  r := jsonb_populate_record(NULL::public.affaire_etapes_logistiques, _e);
  IF r.type IS NULL OR r.date_debut IS NULL OR r.date_fin < r.date_debut THEN RAISE EXCEPTION 'Type ou dates invalides'; END IF;
  -- Fin = début refusée ; fin plus tôt que le début = passage de minuit (montage de nuit), accepté.
  IF r.heure_fin IS NOT NULL AND r.heure_debut IS NOT NULL AND r.heure_fin = r.heure_debut THEN
    RAISE EXCEPTION 'Heure de fin identique à l''heure de début (le %)', r.date_debut;
  END IF;
  IF length(coalesce(r.note,'')) > 4000 OR length(coalesce(r.lieu_libre,'')) > 500 OR length(coalesce(r.commentaire_equipe,'')) > 2000
     OR length(coalesce(r.responsable,'')) > 300 OR length(coalesce(r.acces,'')) > 1000 THEN RAISE EXCEPTION 'Texte trop long'; END IF;
  RETURN r;
END $$;

-- Origine des étapes créées depuis un mail : « jalonnement », valeur posée aujourd'hui par l'écran des mails ; « retroplanning » pour les étapes amont calculées.
CREATE OR REPLACE FUNCTION public.logistique_valider_demande(_email_id uuid, _affaire_id uuid, _etapes jsonb, _feedback jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE m record; e jsonb; r public.affaire_etapes_logistiques; ids uuid[] := '{}'; nid uuid; k text;
BEGIN
  PERFORM public.app_assert_affaire_write(_affaire_id, 'logistique.etape.edit');
  IF jsonb_typeof(_etapes) IS DISTINCT FROM 'array' OR jsonb_array_length(_etapes) NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Entre 1 et 50 étapes'; END IF;
  SELECT id, statut, subject INTO m FROM public.emails_entrants WHERE id = _email_id FOR UPDATE;
  IF m.id IS NULL THEN RAISE EXCEPTION 'Mail introuvable ou non autorisé'; END IF;
  IF m.statut <> 'pending_review' THEN RAISE EXCEPTION 'Mail déjà traité'; END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(_etapes) LOOP
    r := public.logistique_etape_proposee_valide(e);
    INSERT INTO public.affaire_etapes_logistiques(affaire_id,type,date_debut,date_fin,heure_debut,heure_fin,a_partir_de,duree_minutes,lieu_id,lieu_douteux,lieu_libre,
      vehicule_id,nb_personnes,commentaire_equipe,responsable,acces,note,calcul_regle,origine,statut,created_by,source_type,source_email_id)
    VALUES (_affaire_id,r.type,r.date_debut,r.date_fin,r.heure_debut,r.heure_fin,r.a_partir_de,r.duree_minutes,r.lieu_id,r.lieu_douteux,r.lieu_libre,
      r.vehicule_id,r.nb_personnes,r.commentaire_equipe,r.responsable,r.acces,r.note,r.calcul_regle,coalesce(r.origine,'jalonnement'),'valide',auth.uid(),'email',_email_id)
    RETURNING id INTO nid;
    ids := array_append(ids, nid);
  END LOOP;
  UPDATE public.emails_entrants SET statut = 'validated', validated_at = now() WHERE id = _email_id;
  IF _feedback IS NOT NULL THEN
    FOR k IN SELECT jsonb_object_keys(_feedback) LOOP IF k NOT IN ('propose','retenu','commentaire') THEN RAISE EXCEPTION 'Champ de retour interdit'; END IF; END LOOP;
    INSERT INTO public.ia_feedback_logistique(email_id, email_subject, propose, retenu, commentaire)
    VALUES (_email_id, m.subject, _feedback->'propose', _feedback->'retenu', left(nullif(_feedback->>'commentaire',''), 2000));
  END IF;
  RETURN jsonb_build_object('etape_ids', to_jsonb(ids));
END $$;

-- Validation chantier par chantier : un jalonnement multi-chantiers (affaire_id nul) le reste ; compteur cumulé ;
-- statut « planifie » seulement si _termine. Le rattachement n'écrit que la source, sur une étape sans source.
CREATE OR REPLACE FUNCTION public.logistique_valider_jalonnement(_jalonnement_id uuid, _affaire_id uuid, _etapes jsonb, _rattacher uuid[] DEFAULT '{}', _termine boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE j record; e jsonb; r public.affaire_etapes_logistiques; ids uuid[] := '{}'; nid uuid; nb_ratt int := 0;
BEGIN
  PERFORM public.app_assert_affaire_write(_affaire_id, 'logistique.etape.edit');
  IF jsonb_typeof(_etapes) IS DISTINCT FROM 'array' OR jsonb_array_length(_etapes) > 100 OR cardinality(coalesce(_rattacher,'{}')) > 100
     OR jsonb_array_length(_etapes) + cardinality(coalesce(_rattacher,'{}')) = 0 THEN RAISE EXCEPTION 'Étapes invalides'; END IF;
  SELECT id, statut, affaire_id, nom_fichier, nb_etapes_planifiees INTO j FROM public.jalonnements WHERE id = _jalonnement_id FOR UPDATE;
  IF j.id IS NULL THEN RAISE EXCEPTION 'Jalonnement introuvable ou non autorisé'; END IF;
  IF j.affaire_id IS NOT NULL AND j.affaire_id <> _affaire_id THEN RAISE EXCEPTION 'Jalonnement d''un autre chantier'; END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(_etapes) LOOP
    r := public.logistique_etape_proposee_valide(e);
    INSERT INTO public.affaire_etapes_logistiques(affaire_id,type,date_debut,date_fin,heure_debut,heure_fin,a_partir_de,duree_minutes,lieu_id,lieu_douteux,lieu_libre,
      vehicule_id,nb_personnes,commentaire_equipe,responsable,acces,note,calcul_regle,origine,statut,created_by,source_type,source_jalonnement_id,source_fichier)
    VALUES (_affaire_id,r.type,r.date_debut,r.date_fin,r.heure_debut,r.heure_fin,r.a_partir_de,r.duree_minutes,r.lieu_id,r.lieu_douteux,r.lieu_libre,
      r.vehicule_id,r.nb_personnes,r.commentaire_equipe,r.responsable,r.acces,r.note,r.calcul_regle,coalesce(r.origine,'jalonnement'),'valide',auth.uid(),'jalonnement',_jalonnement_id,left(j.nom_fichier,255))
    RETURNING id INTO nid;
    ids := array_append(ids, nid);
  END LOOP;
  IF cardinality(coalesce(_rattacher,'{}')) > 0 THEN
    UPDATE public.affaire_etapes_logistiques SET source_type = 'jalonnement', source_jalonnement_id = _jalonnement_id, source_fichier = left(j.nom_fichier,255)
     WHERE id = ANY(_rattacher) AND affaire_id = _affaire_id AND statut <> 'annule' AND source_type IS NULL;
    GET DIAGNOSTICS nb_ratt = ROW_COUNT;
    IF nb_ratt <> cardinality(_rattacher) THEN RAISE EXCEPTION 'Étape à rattacher absente, d''un autre chantier, annulée ou déjà rattachée'; END IF;
  END IF;
  UPDATE public.jalonnements SET statut = CASE WHEN _termine THEN 'planifie' ELSE statut END,
    nb_etapes_planifiees = coalesce(j.nb_etapes_planifiees, 0) + cardinality(ids) + nb_ratt, updated_at = now() WHERE id = _jalonnement_id;
  RETURN jsonb_build_object('etape_ids', to_jsonb(ids), 'rattachees', nb_ratt);
END $$;

-- Import du planning hebdomadaire : corps actuel relu, seule la création d'étape change (source_type, source_fichier).
CREATE OR REPLACE FUNCTION public.planning_terrain_import_semaine(_blocs jsonb, _fichier text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE b jsonb; p jsonb; aid uuid; eid uuid; pid uuid; origine text; cle text; candidates uuid[]; ids uuid[] := '{}'; before_id uuid; after_id uuid; nb integer:=0; existants integer:=0; etapes integer:=0; k text; jour date; typ public.etape_logistique_type; h time; hf time;
BEGIN
 IF NOT public.planning_terrain_ecrire_autorise() THEN RAISE EXCEPTION 'Import réservé à la logistique et aux administrateurs' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(_blocs) IS DISTINCT FROM 'array' OR jsonb_array_length(_blocs) NOT BETWEEN 1 AND 200 OR length(_fichier) NOT BETWEEN 1 AND 255 THEN RAISE EXCEPTION 'Fichier ou interventions invalides'; END IF;
 FOR aid IN SELECT DISTINCT (v->>'affaire_id')::uuid FROM jsonb_array_elements(_blocs) v ORDER BY 1 LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended('planning-import:'||aid::text,0));
  IF NOT EXISTS(SELECT 1 FROM affaires WHERE id=aid AND archived_at IS NULL AND statut NOT IN ('termine','annule')) THEN RAISE EXCEPTION 'Chantier absent ou fermé'; END IF;
 END LOOP;
 FOR b IN SELECT value FROM jsonb_array_elements(_blocs) LOOP
  FOR k IN SELECT jsonb_object_keys(b) LOOP IF k NOT IN ('affaire_id','date','type','heure','heure_fin','lieu','responsable','note','personnes','etape_id','creer') THEN RAISE EXCEPTION 'Champ interdit: %',k; END IF; END LOOP;
  aid:=(b->>'affaire_id')::uuid; jour:=(b->>'date')::date; typ:=(b->>'type')::public.etape_logistique_type; h:=nullif(b->>'heure','')::time; hf:=nullif(b->>'heure_fin','')::time;
  IF jour IS NULL OR typ IS NULL OR jsonb_typeof(b->'personnes') IS DISTINCT FROM 'array' OR jsonb_array_length(b->'personnes') NOT BETWEEN 1 AND 100 OR length(coalesce(b->>'note',''))>4000 OR length(coalesce(b->>'lieu',''))>500 OR length(coalesce(b->>'responsable',''))>300 THEN RAISE EXCEPTION 'Date et personnes requises, texte trop long ou opération invalide'; END IF;
  cle:=aid::text||'|'||jour::text||'|'||typ::text||'|'||coalesce(h::text,'')||'|'||lower(trim(coalesce(b->>'lieu','')));
  SELECT array_agg(DISTINCT a.etape_logistique_id) INTO candidates FROM assignations a JOIN affaire_etapes_logistiques e ON e.id=a.etape_logistique_id WHERE a.provenance_terrain->'imports_hebdomadaires' ? cle AND a.affaire_id=aid AND NOT a.historique_terrain AND e.statut<>'annule';
  IF cardinality(candidates)>1 THEN RAISE EXCEPTION 'Plusieurs étapes déjà importées : rattachement manuel nécessaire'; END IF;
  eid:=candidates[1];
  IF eid IS NULL AND nullif(b->>'etape_id','') IS NOT NULL THEN
   eid:=(b->>'etape_id')::uuid;
   IF NOT EXISTS(SELECT 1 FROM affaire_etapes_logistiques WHERE id=eid AND affaire_id=aid AND statut<>'annule' AND date_debut<=jour AND coalesce(date_fin,date_debut)>=jour) THEN RAISE EXCEPTION 'Rattachement à une étape incompatible'; END IF;
  END IF;
  IF eid IS NULL THEN
   SELECT array_agg(id) INTO candidates FROM affaire_etapes_logistiques WHERE affaire_id=aid AND type=typ AND statut<>'annule' AND date_debut<=jour AND coalesce(date_fin,date_debut)>=jour AND (heure_debut IS NULL OR h IS NULL OR heure_debut=h);
   IF cardinality(candidates)>1 THEN RAISE EXCEPTION 'Plusieurs étapes compatibles : choisissez une étape'; END IF;
   eid:=candidates[1];
  END IF;
  IF eid IS NULL THEN
   IF coalesce((b->>'creer')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'Aucune étape existante : confirmez la création ou choisissez une étape'; END IF;
   INSERT INTO affaire_etapes_logistiques(affaire_id,type,date_debut,heure_debut,heure_fin,horaire_libre,lieu_libre,responsable,note,nb_personnes,origine,statut,created_by,source_type,source_fichier) VALUES(aid,typ,jour,h,hf,CASE WHEN h IS NULL THEN b->>'note' END,nullif(b->>'lieu',''),nullif(b->>'responsable',''),nullif(b->>'note',''),jsonb_array_length(b->'personnes'),'manuel','valide',auth.uid(),'planning_hebdo',left(_fichier,255)) RETURNING id INTO eid;
   etapes:=etapes+1;
  END IF;
  FOR p IN SELECT value FROM jsonb_array_elements(b->'personnes') LOOP
   FOR k IN SELECT jsonb_object_keys(p) LOOP IF k NOT IN ('id','origine','nom_original') THEN RAISE EXCEPTION 'Champ personne interdit'; END IF; END LOOP;
   pid:=(p->>'id')::uuid; origine:=p->>'origine';
   SELECT id INTO before_id FROM assignations WHERE etape_logistique_id=eid AND date=jour AND ((origine='employe' AND employe_id=pid) OR (origine='dispos' AND dispos_intervenant_id=pid)) LIMIT 1;
   after_id:=public.planning_terrain_affecter(eid,jour,pid,origine,'equipier');
   IF before_id IS NULL THEN nb:=nb+1; ELSE existants:=existants+1; END IF;
   UPDATE assignations SET provenance_terrain=jsonb_set(provenance_terrain,'{imports_hebdomadaires}',coalesce(provenance_terrain->'imports_hebdomadaires','{}'::jsonb)||jsonb_build_object(cle,jsonb_build_object('fichier',_fichier,'nom_original',left(coalesce(p->>'nom_original',''),300)))) WHERE id=after_id;
  END LOOP;
  ids:=array_append(ids,eid);
 END LOOP;
 RETURN jsonb_build_object('ajoutes',nb,'existants',existants,'etapes_creees',etapes,'etape_ids',to_jsonb(ids));
END $function$;

REVOKE EXECUTE ON FUNCTION public.logistique_etapes_doublons(uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.logistique_etape_proposee_valide(jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.logistique_valider_demande(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.logistique_valider_jalonnement(uuid, uuid, jsonb, uuid[], boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.planning_terrain_import_semaine(jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.logistique_etapes_doublons(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.logistique_etape_proposee_valide(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.logistique_valider_demande(uuid, uuid, jsonb, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.logistique_valider_jalonnement(uuid, uuid, jsonb, uuid[], boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.planning_terrain_import_semaine(jsonb, text) TO authenticated, service_role;
