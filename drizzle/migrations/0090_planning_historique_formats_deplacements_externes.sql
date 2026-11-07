CREATE OR REPLACE VIEW public.planning_terrain_historique AS
WITH candidates AS (
 SELECT s.id,s.date,s.affaire_id,coalesce(s.employe_id,i.employe_id) AS employe_canonique,
 CASE WHEN coalesce(s.employe_id,i.employe_id) IS NOT NULL THEN 'employe:'||coalesce(s.employe_id,i.employe_id)::text ELSE 'dispos:'||s.dispos_intervenant_id::text END AS personne_cle,
 upper(coalesce(p.nom,i.nom,''))||' '||coalesce(p.prenom,i.prenom,'') AS personne,a.numero AS code_chantier,a.nom AS chantier,
 nullif(trim(coalesce(s.type_operation,e.type::text,s.phase,'')),'') AS operation,
 nullif(trim(CASE WHEN s.historique_terrain THEN s.provenance_terrain->>'responsable' ELSE e.responsable END),'') AS responsable,
 coalesce(nullif(e.lieu_libre,''),a.lieu) AS lieu,s.historique_terrain,s.provenance_terrain,
 (s.historique_terrain OR s.terrain OR s.etape_logistique_id IS NOT NULL) AS est_terrain
 FROM public.assignations s JOIN public.affaires a ON a.id=s.affaire_id
 LEFT JOIN public.dispos_intervenants i ON i.id=s.dispos_intervenant_id
 LEFT JOIN public.employes p ON p.id=coalesce(s.employe_id,i.employe_id)
 LEFT JOIN public.affaire_etapes_logistiques e ON e.id=s.etape_logistique_id
 WHERE s.historique_terrain OR (s.date<(now() AT TIME ZONE 'Europe/Paris')::date AND s.validation_logistique='valide' AND s.statut_confirmation<>'refusee' AND (s.etape_logistique_id IS NULL OR e.statut IN ('valide','fait')))
), retained AS (
 SELECT c.*,bool_or(NOT historique_terrain) OVER(PARTITION BY date,affaire_id,personne_cle) AS staffing_present FROM candidates c
)
SELECT date,affaire_id,personne_cle,min(personne) AS personne,min(code_chantier) AS code_chantier,min(chantier) AS chantier,
 coalesce(array_agg(DISTINCT operation ORDER BY operation) FILTER(WHERE operation IS NOT NULL AND (NOT staffing_present OR NOT historique_terrain)),'{}'::text[]) AS operations,
 coalesce(string_agg(DISTINCT responsable,' / ' ORDER BY responsable) FILTER(WHERE responsable IS NOT NULL AND (NOT staffing_present OR NOT historique_terrain)),'') AS responsable,
 coalesce(array_agg(DISTINCT lieu ORDER BY lieu) FILTER(WHERE lieu IS NOT NULL),'{}'::text[]) AS lieux,
 CASE WHEN bool_or(NOT historique_terrain) THEN 'Staffing' ELSE 'Import historique' END AS source,
 CASE WHEN bool_or(historique_terrain) THEN coalesce(string_agg(DISTINCT provenance_terrain->>'nom_original',' / ' ORDER BY provenance_terrain->>'nom_original') FILTER(WHERE historique_terrain),min(personne)) ELSE min(personne) END AS nom_original,
 coalesce(string_agg(DISTINCT provenance_terrain->>'sources',' / ' ORDER BY provenance_terrain->>'sources') FILTER(WHERE historique_terrain),'') AS fichiers_source,
 CASE WHEN bool_or(historique_terrain) THEN coalesce(string_agg(DISTINCT provenance_terrain->>'format',' / ' ORDER BY provenance_terrain->>'format') FILTER(WHERE historique_terrain),'Import historique') WHEN bool_or(est_terrain) THEN 'Staffing terrain' ELSE 'Staffing atelier' END AS format,
 array_agg(id ORDER BY id) AS affectation_ids,
 bool_or(est_terrain) AS passage_terrain,bool_or(NOT est_terrain) AS passage_atelier,
 coalesce(array_agg(DISTINCT operation ORDER BY operation) FILTER(WHERE est_terrain AND operation IS NOT NULL),'{}'::text[]) AS operations_terrain,
 coalesce(array_agg(DISTINCT lieu ORDER BY lieu) FILTER(WHERE est_terrain AND lieu IS NOT NULL),'{}'::text[]) AS lieux_terrain
FROM retained GROUP BY date,affaire_id,personne_cle;
CREATE OR REPLACE FUNCTION public.planning_terrain_historique_exporter() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NOT planning_terrain_ecrire_autorise() THEN RAISE EXCEPTION 'Export réservé aux administrateurs et à la logistique' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('instant',statement_timestamp(),'lignes',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.date,t.affaire_id,t.personne_cle) FROM (SELECT date,affaire_id,personne_cle,personne,code_chantier,chantier,operations,responsable,lieux,source,nom_original,fichiers_source,format,passage_terrain,passage_atelier FROM planning_terrain_historique) t),'[]'::jsonb)); END $$;
CREATE OR REPLACE FUNCTION public.planning_terrain_historique_lire(_limite integer DEFAULT 500,_apres jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ DECLARE r jsonb; BEGIN
 IF NOT planning_terrain_lire_autorise() OR (auth.jwt()->>'client_id') IS NOT NULL THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
 IF _limite IS NULL OR _limite<1 OR _limite>1000 THEN RAISE EXCEPTION 'Limite invalide'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.date,t.affaire_id,t.personne_cle),'[]'::jsonb) INTO r FROM (SELECT date,affaire_id,personne_cle,personne,code_chantier,chantier,operations,responsable,lieux,source,nom_original,fichiers_source,format,passage_terrain,passage_atelier FROM planning_terrain_historique WHERE _apres IS NULL OR (date,affaire_id,personne_cle)>((_apres->>'date')::date,(_apres->>'affaire_id')::uuid,_apres->>'personne_cle') ORDER BY date,affaire_id,personne_cle LIMIT _limite) t;
 RETURN r; END $$;
CREATE FUNCTION public.planning_terrain_historique_compteurs(_inclure_atelier boolean) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ DECLARE r jsonb; BEGIN
 IF NOT planning_terrain_lire_autorise() OR (auth.jwt()->>'client_id') IS NOT NULL THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
 WITH passages AS (SELECT *,CASE WHEN coalesce(_inclure_atelier,false) THEN lieux ELSE lieux_terrain END AS lieux_comptes,CASE WHEN coalesce(_inclure_atelier,false) THEN operations ELSE operations_terrain END AS operations_comptees FROM planning_terrain_historique WHERE passage_terrain OR coalesce(_inclure_atelier,false))
 SELECT jsonb_build_object('chantiers',coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT personne_cle,affaire_id,count(*) AS passages,min(date) AS premiere_date,max(date) AS derniere_date FROM passages GROUP BY personne_cle,affaire_id ORDER BY personne_cle,affaire_id) t),'[]'::jsonb),'lieux',coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT personne_cle,lieu,count(*) AS passages,max(date) AS derniere_date FROM passages CROSS JOIN LATERAL unnest(lieux_comptes) lieu GROUP BY personne_cle,lieu ORDER BY personne_cle,lieu) t),'[]'::jsonb),'operations',coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT personne_cle,operation,count(*) AS passages,max(date) AS derniere_date FROM passages CROSS JOIN LATERAL unnest(operations_comptees) operation GROUP BY personne_cle,operation ORDER BY personne_cle,operation) t),'[]'::jsonb)) INTO r; RETURN r; END $$;
CREATE OR REPLACE FUNCTION public.planning_terrain_historique_compteurs() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.planning_terrain_historique_compteurs(false) $$;
REVOKE ALL ON FUNCTION public.planning_terrain_historique_compteurs(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.planning_terrain_historique_compteurs(boolean) TO authenticated;
CREATE UNIQUE INDEX assignations_historique_externe_unique ON public.assignations(affaire_id,date,dispos_intervenant_id) WHERE historique_terrain AND dispos_intervenant_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.planning_terrain_importer(_lignes jsonb,_empreinte text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE r jsonb; d date; a uuid; p uuid; i uuid; ajoutes integer:=0; existants integer:=0; BEGIN
 IF NOT public.planning_terrain_ecrire_autorise() THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
 IF _lignes IS NULL OR jsonb_typeof(_lignes)<>'array' OR jsonb_array_length(_lignes)>5000 OR _empreinte IS NULL OR _empreinte !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Import invalide'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('planning_terrain_import',0)); PERFORM set_config('app.terrain_import',auth.uid()::text,true);
 FOR r IN SELECT value FROM jsonb_array_elements(_lignes) LOOP
 IF jsonb_typeof(r)<>'object' THEN RAISE EXCEPTION 'Ligne invalide'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(r) k WHERE k NOT IN ('date','affaire_id','employe_id','dispos_intervenant_id','operation','responsable','nom_original','sources','format')) THEN RAISE EXCEPTION 'Champ non autorisé'; END IF;
 d:=(r->>'date')::date; a:=(r->>'affaire_id')::uuid; p:=(r->>'employe_id')::uuid; i:=(r->>'dispos_intervenant_id')::uuid;
 IF d IS NULL OR d>(now() AT TIME ZONE 'Europe/Paris')::date OR NOT EXISTS(SELECT 1 FROM affaires WHERE id=a) OR (p IS NULL)=(i IS NULL) THEN RAISE EXCEPTION 'Date, personne ou chantier invalide'; END IF;
 IF p IS NOT NULL AND NOT EXISTS(SELECT 1 FROM employes WHERE id=p) THEN RAISE EXCEPTION 'Employé introuvable'; END IF;
 IF i IS NOT NULL AND NOT EXISTS(SELECT 1 FROM dispos_intervenants WHERE id=i AND employe_id IS NULL) THEN RAISE EXCEPTION 'Intervenant externe introuvable ou déjà lié'; END IF;
 IF EXISTS(SELECT 1 FROM assignations WHERE affaire_id=a AND date=d AND ((p IS NOT NULL AND employe_id=p) OR (i IS NOT NULL AND dispos_intervenant_id=i))) THEN existants:=existants+1; CONTINUE; END IF;
 INSERT INTO assignations(affaire_id,employe_id,dispos_intervenant_id,date,demi_journee,heures,terrain,historique_terrain,validation_logistique,source_terrain,type_operation,created_by,provenance_terrain) VALUES(a,p,i,d,'JOURNEE',0,true,true,'valide','historique_consolide',nullif(r->>'operation',''),auth.uid(),jsonb_build_object('empreinte',_empreinte,'nom_original',left(r->>'nom_original',200),'sources',left(r->>'sources',2000),'format',left(r->>'format',100),'responsable',left(r->>'responsable',200))); ajoutes:=ajoutes+1;
 END LOOP; RETURN jsonb_build_object('ajoutes',ajoutes,'existants',existants); END $$;
CREATE FUNCTION public.planning_terrain_deplacer_affectations() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE delta integer; hors text; BEGIN
 IF NEW.date_debut IS NOT DISTINCT FROM OLD.date_debut AND NEW.date_fin IS NOT DISTINCT FROM OLD.date_fin THEN RETURN NEW; END IF;
 IF NEW.date_debut IS NULL OR coalesce(NEW.date_fin,NEW.date_debut)<NEW.date_debut THEN RAISE EXCEPTION 'Dates invalides'; END IF;
 delta:=NEW.date_debut-OLD.date_debut;
 PERFORM 1 FROM assignations WHERE etape_logistique_id=OLD.id AND NOT historique_terrain ORDER BY id FOR UPDATE;
 SELECT string_agg(s.date::text||' — '||coalesce(p.nom,i.nom,'')||' '||coalesce(p.prenom,i.prenom,''),'; ' ORDER BY s.date,s.id) INTO hors FROM assignations s LEFT JOIN employes p ON p.id=s.employe_id LEFT JOIN dispos_intervenants i ON i.id=s.dispos_intervenant_id WHERE s.etape_logistique_id=OLD.id AND NOT s.historique_terrain AND (s.date+delta<NEW.date_debut OR s.date+delta>coalesce(NEW.date_fin,NEW.date_debut));
 IF hors IS NOT NULL THEN RAISE EXCEPTION 'Affectations hors de la nouvelle période : %. Corrigez les affectations ou élargissez la période, puis réessayez.',hors USING ERRCODE='P0001'; END IF;
 UPDATE assignations SET date=date+delta WHERE etape_logistique_id=OLD.id AND NOT historique_terrain;
 RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.planning_terrain_deplacer_affectations() FROM PUBLIC;
CREATE TRIGGER planning_terrain_deplacement AFTER UPDATE OF date_debut,date_fin ON public.affaire_etapes_logistiques FOR EACH ROW EXECUTE FUNCTION public.planning_terrain_deplacer_affectations();