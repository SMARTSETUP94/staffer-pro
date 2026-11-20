ALTER TABLE public.opportunite_actions ADD COLUMN IF NOT EXISTS prochaine_action_close_le timestamptz;
COMMENT ON COLUMN public.opportunite_actions.prochaine_action_close_le IS 'Prochaine action close : conservée mais exclue des urgences.';
CREATE OR REPLACE FUNCTION public.devis_retenu_pipeline(_affaire_ids uuid[])
RETURNS TABLE(affaire_id uuid, devis_id uuid, numero text, version integer, statut_redaction devis_redaction_statut, numero_progbat text, date_envoi date, montant_devis_id uuid, montant_version integer, net_ht numeric, source_montant text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
WITH r AS (
 SELECT DISTINCT ON (d.affaire_id) d.affaire_id,d.id,d.numero,d.version,d.statut_redaction,d.numero_progbat,d.date_envoi::date de
 FROM devis d WHERE d.affaire_id=ANY(_affaire_ids) AND coalesce(array_length(_affaire_ids,1),0)<=1000
 AND d.redige_dans_staffing AND NOT d.est_modele AND d.supprime_le IS NULL AND d.statut_redaction NOT IN ('refuse','remplace')
 AND current_user_has_capability('devis.view') AND devis_peut_lire(d.id) ORDER BY d.affaire_id,d.version DESC),
rc AS (SELECT r.*,round((devis_calculer(r.id)->>'net_ht')::numeric,2) net FROM r)
SELECT rc.affaire_id,rc.id,rc.numero,rc.version,rc.statut_redaction,rc.numero_progbat,rc.de,
 CASE WHEN coalesce(rc.net,0)>0 THEN rc.id ELSE p.id END,
 CASE WHEN coalesce(rc.net,0)>0 THEN rc.version ELSE p.version END,
 CASE WHEN coalesce(rc.net,0)>0 THEN rc.net ELSE p.net END,
 CASE WHEN coalesce(rc.net,0)>0 THEN 'devis' WHEN p.id IS NOT NULL THEN 'version_precedente' END
FROM rc LEFT JOIN LATERAL (
 SELECT q.id,q.version,q.net FROM (
 SELECT d2.id,d2.version,round((devis_calculer(d2.id)->>'net_ht')::numeric,2) net FROM devis d2
 WHERE coalesce(rc.net,0)<=0 AND d2.affaire_id=rc.affaire_id AND d2.version<rc.version
 AND d2.redige_dans_staffing AND NOT d2.est_modele AND d2.supprime_le IS NULL AND d2.statut_redaction<>'refuse' AND devis_peut_lire(d2.id)
 ORDER BY d2.version DESC) q WHERE q.net>0 LIMIT 1) p ON true $function$;
REVOKE EXECUTE ON FUNCTION public.devis_retenu_pipeline(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devis_retenu_pipeline(uuid[]) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.devis_derniers_par_affaire(_affaire_ids uuid[])
RETURNS TABLE(affaire_id uuid,devis_id uuid,version integer,statut_redaction devis_redaction_statut,numero_progbat text,date_envoi date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
SELECT r.affaire_id,r.devis_id,r.version,r.statut_redaction,r.numero_progbat,r.date_envoi FROM devis_retenu_pipeline(_affaire_ids) r $function$;
CREATE OR REPLACE FUNCTION public.devis_nouvelle_version(_devis_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE s record; v_version int; v_id uuid;
BEGIN
 PERFORM devis_assert_ecriture(_devis_id,false);
 SELECT * INTO s FROM devis WHERE id=_devis_id;
 IF s.est_modele THEN RAISE EXCEPTION 'Un modèle ne se versionne pas'; END IF;
 IF s.supprime_le IS NOT NULL THEN RAISE EXCEPTION 'Devis supprimé : restaurez-le avant d''en créer une version'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('devis_version:'||s.affaire_id::text));
 SELECT coalesce(max(version),0)+1 INTO v_version FROM devis WHERE affaire_id=s.affaire_id AND redige_dans_staffing AND NOT est_modele;
 INSERT INTO devis(affaire_id,numero,libelle,statut,redige_dans_staffing,version,version_precedente_id,statut_redaction,client_id,contact_id,client_final_id,date_devis,validite_jours,tva_pct,coef_materiaux_defaut,modele_origine_id,auteur_id,remise_mode,remise_valeur)
 VALUES(s.affaire_id,regexp_replace(s.numero,'-R\d+$','')||'-R'||v_version,s.libelle,'brouillon',true,v_version,s.id,'brouillon',s.client_id,s.contact_id,s.client_final_id,current_date,s.validite_jours,s.tva_pct,s.coef_materiaux_defaut,s.modele_origine_id,auth.uid(),s.remise_mode,s.remise_valeur) RETURNING id INTO v_id;
 PERFORM devis_copier_sous_arbre(_devis_id,v_id,NULL,NULL,false);
 IF s.statut_redaction NOT IN ('signe','refuse','remplace') THEN
 PERFORM set_config('app.devis_rpc','on',true);
 UPDATE devis SET statut_redaction='remplace',updated_at=now() WHERE id=_devis_id;
 END IF;
 RETURN v_id;
END $function$;
CREATE OR REPLACE FUNCTION public.list_opportunites_active()
RETURNS TABLE(id uuid,numero text,nom text,client text,charge_affaires_id uuid,taille opportunite_taille,statut_opportunite opportunite_statut,date_opportunite date,date_pat date,date_visite_technique date,date_montage date,date_demontage date,notes text,typologie_future text,next_action_due_le date,next_action_text text,last_jalon_etape text,last_jalon_date_atteinte date,actions_count integer)
LANGUAGE sql STABLE SET search_path TO 'public' AS $function$
SELECT a.id,a.numero,a.nom,a.client,a.charge_affaires_id,a.taille,a.statut_opportunite,a.date_opportunite,a.date_pat,a.date_visite_technique,a.date_montage,a.date_demontage,a.notes,a.typologie_future,na.prochaine_action_due_le,na.texte,lj.etape::text,lj.date_atteinte,coalesce(ac.cnt,0)::int
FROM affaires a
LEFT JOIN LATERAL (SELECT oa.prochaine_action_due_le,oa.texte FROM opportunite_actions oa WHERE oa.affaire_id=a.id AND oa.prochaine_action_due_le IS NOT NULL AND oa.prochaine_action_close_le IS NULL ORDER BY oa.created_at DESC LIMIT 1) na ON true
LEFT JOIN LATERAL (SELECT oj.etape,oj.date_atteinte FROM opportunite_jalons oj WHERE oj.affaire_id=a.id AND oj.date_atteinte IS NOT NULL ORDER BY oj.date_atteinte DESC LIMIT 1) lj ON true
LEFT JOIN LATERAL (SELECT count(*) cnt FROM opportunite_actions oa2 WHERE oa2.affaire_id=a.id) ac ON true
WHERE a.phase='opportunite' AND a.archived_at IS NULL AND a.statut_opportunite IN ('a_faire','envoye','a_l_etude','presque_gagne') ORDER BY a.date_opportunite DESC NULLS LAST,a.created_at DESC $function$;
CREATE OR REPLACE FUNCTION public.list_opportunites_closes()
RETURNS TABLE(id uuid,numero text,nom text,client text,charge_affaires_id uuid,statut_opportunite opportunite_statut,date_opportunite date,date_montage date,statut_change_le timestamptz)
LANGUAGE sql STABLE SET search_path TO 'public' AS $function$
SELECT a.id,a.numero,a.nom,a.client,a.charge_affaires_id,a.statut_opportunite,a.date_opportunite,a.date_montage,a.updated_at FROM affaires a
WHERE a.phase='opportunite' AND a.archived_at IS NULL AND a.statut_opportunite IN ('perdu','gagne') ORDER BY a.updated_at DESC $function$;
REVOKE EXECUTE ON FUNCTION public.list_opportunites_closes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_opportunites_closes() TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.opportunite_clore_actions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
 UPDATE opportunite_actions SET prochaine_action_close_le=now() WHERE affaire_id=NEW.id AND prochaine_action_due_le IS NOT NULL AND prochaine_action_close_le IS NULL;
 RETURN NEW;
END $function$;
REVOKE EXECUTE ON FUNCTION public.opportunite_clore_actions() FROM PUBLIC, anon;
CREATE TRIGGER trg_opportunite_clore_actions AFTER UPDATE OF statut_opportunite ON public.affaires FOR EACH ROW WHEN (NEW.statut_opportunite IN ('perdu','gagne') AND OLD.statut_opportunite IS DISTINCT FROM NEW.statut_opportunite) EXECUTE FUNCTION public.opportunite_clore_actions();
CREATE OR REPLACE FUNCTION public.pipeline_indicateurs(_affaire_ids uuid[] DEFAULT NULL::uuid[],_charge_affaires_id uuid DEFAULT NULL::uuid,_q text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $function$
DECLARE v_ids uuid[]; v_proba jsonb; v_hj numeric; v_rows jsonb; v_supp jsonb; v_all jsonb; v_hm jsonb; v_q text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF coalesce(array_length(_affaire_ids,1),0)>2000 THEN RAISE EXCEPTION '2000 opportunités maximum'; END IF;
 v_q:=nullif(lower(trim(coalesce(_q,''))),'');
 SELECT array_agg(a.id) INTO v_ids FROM affaires a WHERE a.phase='opportunite' AND a.archived_at IS NULL AND a.statut_opportunite IN ('a_faire','envoye','a_l_etude','presque_gagne') AND (_affaire_ids IS NULL OR a.id=ANY(_affaire_ids));
 v_ids:=coalesce(v_ids,'{}');
 SELECT jsonb_object_agg(s,coalesce((SELECT valeur FROM v_devis_parametres_courants WHERE cle='proba_'||s),d)/100.0) INTO v_proba FROM (VALUES ('a_faire',10::numeric),('envoye',30),('a_l_etude',40),('presque_gagne',80)) x(s,d);
 v_hj:=coalesce(nullif((SELECT valeur FROM v_devis_parametres_courants WHERE cle='heures_par_jour_be'),0),8);
 WITH a AS (SELECT id,statut_opportunite::text st,ca_estime_ht FROM affaires WHERE id=ANY(v_ids)),
 d AS (SELECT * FROM devis_retenu_pipeline(v_ids)),
 c AS (SELECT d.*,devis_calculer(coalesce(d.montant_devis_id,d.devis_id)) calc,devis_heures_be_net(coalesce(d.montant_devis_id,d.devis_id)) hbe FROM d),
 act AS (SELECT o.affaire_id,max(o.date) FILTER (WHERE o.type='devis_envoye') d_env,max(o.date) d_max FROM opportunite_actions o WHERE o.affaire_id=ANY(v_ids) AND o.prochaine_action_close_le IS NULL GROUP BY o.affaire_id),
 r0 AS (SELECT a.id affaire_id,a.st,a.ca_estime_ht,c.devis_id,c.numero devis_numero,c.version,c.statut_redaction::text sr,c.numero_progbat,c.calc,c.net_ht net_brut,c.montant_version,c.source_montant,coalesce(c.hbe,0) hbe,coalesce(c.date_envoi,act.d_env::date) ref_envoi,act.d_max FROM a LEFT JOIN c ON c.affaire_id=a.id LEFT JOIN act ON act.affaire_id=a.id),
 r AS (SELECT r0.*,CASE WHEN coalesce(net_brut,0)<=0 AND coalesce(ca_estime_ht,0)>0 THEN round(ca_estime_ht,2) END estime,CASE WHEN coalesce(net_brut,0)>0 THEN net_brut WHEN devis_id IS NOT NULL AND coalesce(ca_estime_ht,0)<=0 THEN 0 END net_ht FROM r0),
 r2 AS (SELECT r.*,(r.st='envoye' AND r.ref_envoi IS NOT NULL AND r.ref_envoi<current_date-7 AND (r.d_max IS NULL OR r.d_max::date<=r.ref_envoi)) a_relancer FROM r)
 SELECT coalesce(jsonb_agg(jsonb_build_object('affaire_id',affaire_id,'statut',st,'devis_id',devis_id,'version',version,'devis_numero',devis_numero,'statut_redaction',sr,'numero_progbat',numero_progbat,'net_ht',net_ht,'estime',estime,'montant_version',CASE WHEN coalesce(net_brut,0)>0 THEN montant_version END,'source_montant',CASE WHEN coalesce(net_brut,0)>0 THEN source_montant WHEN estime IS NOT NULL THEN 'estime' END,'a_relancer',a_relancer,'supplement',false,'heures',(SELECT coalesce(sum(value::numeric),0) FROM jsonb_each_text(coalesce(calc->'heures_metier','{}'::jsonb))),'heures_be',hbe,'heures_metier',coalesce(calc->'heures_metier','{}'::jsonb))),'[]'::jsonb) INTO v_rows FROM r2;
 WITH s AS (
 SELECT dv.id devis_id,dv.affaire_id,dv.numero devis_numero,dv.version,dv.numero_progbat,dv.statut_redaction::text sr,dv.date_envoi,a.numero,coalesce(a.nom,a.client) libelle,a.client
 FROM devis dv JOIN affaires a ON a.id=dv.affaire_id
 WHERE a.numero ~ '^6[0-9]{3}$' AND a.phase<>'opportunite' AND a.archived_at IS NULL AND a.signed_at IS NOT NULL AND dv.created_at>a.signed_at
 AND dv.redige_dans_staffing AND NOT dv.est_modele AND dv.supprime_le IS NULL AND dv.statut_redaction IN ('brouillon','a_valider','valide','transfere')
 AND NOT EXISTS (SELECT 1 FROM devis n WHERE n.affaire_id=dv.affaire_id AND n.version>dv.version AND n.redige_dans_staffing AND NOT n.est_modele AND n.supprime_le IS NULL AND n.statut_redaction<>'refuse')
 AND current_user_has_capability('devis.view') AND devis_peut_lire(dv.id)
 AND (_charge_affaires_id IS NULL OR a.charge_affaires_id=_charge_affaires_id)
 AND (v_q IS NULL OR lower(coalesce(a.numero,'')||' '||coalesce(a.client,'')||' '||coalesce(a.nom,'')) LIKE '%'||v_q||'%')),
 sc AS (SELECT s.*,devis_calculer(s.devis_id) calc,coalesce(devis_heures_be_net(s.devis_id),0) hbe FROM s)
 SELECT coalesce(jsonb_agg(jsonb_build_object('affaire_id',affaire_id,'devis_id',devis_id,'version',version,'numero_progbat',numero_progbat,'statut',CASE WHEN sr='transfere' OR date_envoi IS NOT NULL THEN 'envoye' ELSE 'a_l_etude' END,'statut_redaction',sr,'numero',numero,'devis_numero',devis_numero,'libelle',libelle,'client',client,'net_ht',round((calc->>'net_ht')::numeric,2),'estime',NULL,'source_montant','devis','a_relancer',false,'supplement',true,'heures',(SELECT coalesce(sum(value::numeric),0) FROM jsonb_each_text(coalesce(calc->'heures_metier','{}'::jsonb))),'heures_be',hbe,'heures_metier',coalesce(calc->'heures_metier','{}'::jsonb)) ORDER BY numero,devis_numero),'[]'::jsonb) INTO v_supp FROM sc;
 v_all:=v_rows||v_supp;
 SELECT coalesce(jsonb_agg(jsonb_build_object('metier_id',k,'libelle',coalesce(m.libelle,'Sans métier'),'heures',h) ORDER BY h DESC),'[]'::jsonb) INTO v_hm FROM (SELECT e.key k,round(sum(e.value::numeric),1) h FROM jsonb_array_elements(v_all) x,jsonb_each_text(x->'heures_metier') e GROUP BY e.key) s LEFT JOIN metiers m ON m.id::text=s.k WHERE h<>0;
 RETURN jsonb_build_object('probabilites',v_proba,'heures_par_jour_be',v_hj,
 'totaux',(SELECT jsonb_build_object('nb',count(*) FILTER (WHERE NOT (x->>'supplement')::boolean),'chiffre',round(coalesce(sum((x->>'net_ht')::numeric),0),2),'estime',round(coalesce(sum((x->>'estime')::numeric),0),2),'supplements',round(coalesce(sum((x->>'net_ht')::numeric) FILTER (WHERE (x->>'supplement')::boolean),0),2),'supplements_nb',count(*) FILTER (WHERE (x->>'supplement')::boolean),'pondere',round(coalesce(sum((coalesce((x->>'net_ht')::numeric,0)+coalesce((x->>'estime')::numeric,0))*(v_proba->>(x->>'statut'))::numeric),0),2),'heures',round(coalesce(sum((x->>'heures')::numeric),0),1),'heures_be',round(coalesce(sum((x->>'heures_be')::numeric),0),1),'jours_be',round(coalesce(sum((x->>'heures_be')::numeric),0)/v_hj,1),'relance_nb',count(*) FILTER (WHERE (x->>'a_relancer')::boolean),'relance_montant',round(coalesce(sum(coalesce((x->>'net_ht')::numeric,(x->>'estime')::numeric,0)) FILTER (WHERE (x->>'a_relancer')::boolean),0),2)) FROM jsonb_array_elements(v_all) x),
 'heures_metier',v_hm,'affaires',(SELECT coalesce(jsonb_agg(x-'heures_metier'),'[]'::jsonb) FROM jsonb_array_elements(v_rows) x),'supplements',(SELECT coalesce(jsonb_agg(x-'heures_metier'),'[]'::jsonb) FROM jsonb_array_elements(v_supp) x));
END $function$;
CREATE OR REPLACE FUNCTION public.pipeline_regularisation(_executer boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_versions jsonb; v_actions jsonb; n1 int:=0; n2 int:=0;
BEGIN
 IF auth.uid() IS NULL OR NOT is_admin() THEN RAISE EXCEPTION 'Réservé aux administrateurs' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('devis_id',d.id,'numero',d.numero,'statut',d.statut_redaction) ORDER BY d.numero),'[]') INTO v_versions FROM devis d
 WHERE d.redige_dans_staffing AND NOT d.est_modele AND d.supprime_le IS NULL AND d.statut_redaction IN ('brouillon','a_valider','valide','transfere')
 AND EXISTS (SELECT 1 FROM devis n WHERE n.affaire_id=d.affaire_id AND n.version>d.version AND n.redige_dans_staffing AND NOT n.est_modele AND n.supprime_le IS NULL AND n.statut_redaction<>'refuse');
 SELECT coalesce(jsonb_agg(jsonb_build_object('action_id',o.id,'numero',a.numero,'statut',a.statut_opportunite,'due_le',o.prochaine_action_due_le) ORDER BY a.numero),'[]') INTO v_actions FROM opportunite_actions o JOIN affaires a ON a.id=o.affaire_id WHERE a.statut_opportunite IN ('perdu','gagne') AND o.prochaine_action_due_le IS NOT NULL AND o.prochaine_action_close_le IS NULL;
 IF _executer THEN
 PERFORM set_config('app.devis_rpc','on',true);
 UPDATE devis SET statut_redaction='remplace',updated_at=now() WHERE id IN (SELECT (x->>'devis_id')::uuid FROM jsonb_array_elements(v_versions) x);
 GET DIAGNOSTICS n1=ROW_COUNT;
 UPDATE opportunite_actions SET prochaine_action_close_le=now() WHERE id IN (SELECT (x->>'action_id')::uuid FROM jsonb_array_elements(v_actions) x);
 GET DIAGNOSTICS n2=ROW_COUNT;
 END IF;
 RETURN jsonb_build_object('execute',_executer,'versions_a_remplacer',v_versions,'actions_a_clore',v_actions,'versions_modifiees',n1,'actions_closes',n2);
END $function$;
REVOKE EXECUTE ON FUNCTION public.pipeline_regularisation(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pipeline_regularisation(boolean) TO authenticated;