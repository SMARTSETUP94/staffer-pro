-- 1. Règle de rattachement de l'import hebdomadaire
CREATE OR REPLACE FUNCTION public.planning_terrain_import_semaine(_blocs jsonb, _fichier text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
   INSERT INTO affaire_etapes_logistiques(affaire_id,type,date_debut,heure_debut,heure_fin,horaire_libre,lieu_libre,responsable,note,nb_personnes,origine,statut,created_by) VALUES(aid,typ,jour,h,hf,CASE WHEN h IS NULL THEN b->>'note' END,nullif(b->>'lieu',''),nullif(b->>'responsable',''),nullif(b->>'note',''),jsonb_array_length(b->'personnes'),'manuel','valide',auth.uid()) RETURNING id INTO eid;
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