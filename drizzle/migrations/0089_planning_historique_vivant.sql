CREATE VIEW public.planning_terrain_historique AS
WITH candidates AS (
 SELECT s.id,s.date,s.affaire_id,coalesce(s.employe_id,i.employe_id) AS employe_canonique,
 CASE WHEN coalesce(s.employe_id,i.employe_id) IS NOT NULL THEN 'employe:'||coalesce(s.employe_id,i.employe_id)::text ELSE 'dispos:'||s.dispos_intervenant_id::text END AS personne_cle,
 upper(coalesce(p.nom,i.nom,''))||' '||coalesce(p.prenom,i.prenom,'') AS personne,
 a.numero AS code_chantier,a.nom AS chantier,
 nullif(trim(coalesce(s.type_operation,e.type::text,s.phase,'')),'') AS operation,
 nullif(trim(CASE WHEN s.historique_terrain THEN s.provenance_terrain->>'responsable' ELSE e.responsable END),'') AS responsable,
 coalesce(nullif(e.lieu_libre,''),a.lieu) AS lieu,
 s.historique_terrain,s.provenance_terrain
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
 CASE WHEN bool_or(NOT historique_terrain) THEN min(personne) ELSE coalesce(string_agg(DISTINCT provenance_terrain->>'nom_original',' / ' ORDER BY provenance_terrain->>'nom_original'),min(personne)) END AS nom_original,
 coalesce(string_agg(DISTINCT provenance_terrain->>'sources',' / ' ORDER BY provenance_terrain->>'sources') FILTER(WHERE historique_terrain),'') AS fichiers_source,
 CASE WHEN bool_or(NOT historique_terrain) THEN 'Staffing' ELSE coalesce(string_agg(DISTINCT provenance_terrain->>'format',' / ' ORDER BY provenance_terrain->>'format'),'Import historique') END AS format,
 array_agg(id ORDER BY id) AS affectation_ids
FROM retained GROUP BY date,affaire_id,personne_cle;
REVOKE ALL ON public.planning_terrain_historique FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.planning_terrain_historique TO service_role;
CREATE FUNCTION public.planning_terrain_historique_lire(_limite integer DEFAULT 500,_apres jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ DECLARE r jsonb; BEGIN
 IF NOT planning_terrain_lire_autorise() OR (auth.jwt()->>'client_id') IS NOT NULL THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
 IF _limite IS NULL OR _limite<1 OR _limite>1000 THEN RAISE EXCEPTION 'Limite invalide'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.date,t.affaire_id,t.personne_cle),'[]'::jsonb) INTO r FROM (SELECT date,affaire_id,personne_cle,personne,code_chantier,chantier,operations,responsable,lieux,source,nom_original,fichiers_source,format FROM planning_terrain_historique WHERE _apres IS NULL OR (date,affaire_id,personne_cle)>((_apres->>'date')::date,(_apres->>'affaire_id')::uuid,_apres->>'personne_cle') ORDER BY date,affaire_id,personne_cle LIMIT _limite) t;
 RETURN r; END $$;
CREATE FUNCTION public.planning_terrain_historique_exporter() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NOT planning_terrain_ecrire_autorise() THEN RAISE EXCEPTION 'Export réservé aux administrateurs et à la logistique' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('instant',statement_timestamp(),'lignes',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.date,t.affaire_id,t.personne_cle) FROM (SELECT date,affaire_id,personne_cle,personne,code_chantier,chantier,operations,responsable,lieux,source,nom_original,fichiers_source,format FROM planning_terrain_historique) t),'[]'::jsonb)); END $$;
CREATE FUNCTION public.planning_terrain_historique_compteurs() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NOT planning_terrain_lire_autorise() OR (auth.jwt()->>'client_id') IS NOT NULL THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('chantiers',coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT personne_cle,affaire_id,count(*) AS passages,min(date) AS premiere_date,max(date) AS derniere_date FROM planning_terrain_historique GROUP BY personne_cle,affaire_id ORDER BY personne_cle,affaire_id) t),'[]'::jsonb),'lieux',coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT personne_cle,lieu,count(*) AS passages,max(date) AS derniere_date FROM planning_terrain_historique CROSS JOIN LATERAL unnest(lieux) lieu GROUP BY personne_cle,lieu ORDER BY personne_cle,lieu) t),'[]'::jsonb),'operations',coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT personne_cle,operation,count(*) AS passages,max(date) AS derniere_date FROM planning_terrain_historique CROSS JOIN LATERAL unnest(operations) operation GROUP BY personne_cle,operation ORDER BY personne_cle,operation) t),'[]'::jsonb)); END $$;
REVOKE ALL ON FUNCTION public.planning_terrain_historique_lire(integer,jsonb),public.planning_terrain_historique_exporter(),public.planning_terrain_historique_compteurs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.planning_terrain_historique_lire(integer,jsonb),public.planning_terrain_historique_exporter(),public.planning_terrain_historique_compteurs() TO authenticated;
COMMENT ON VIEW public.planning_terrain_historique IS 'Historique vivant dédoublonné des passages : aucune copie des assignations, aucun coût. Lecture via RPC autorisées uniquement.';