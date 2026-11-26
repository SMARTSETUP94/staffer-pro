CREATE OR REPLACE FUNCTION public.relances_a_faire(p_charge_id uuid DEFAULT NULL, p_tous boolean DEFAULT false, p_date date DEFAULT current_date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_uid uuid := auth.uid(); v_admin boolean; v_all boolean; v_n int; v_v int; v_i int; v_ids uuid[]; v_pi jsonb; v_rows jsonb; v_actives int;
BEGIN
 IF v_uid IS NULL OR NOT public.user_has_capability(v_uid,'commercial.relances') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 v_admin := EXISTS (SELECT 1 FROM user_roles WHERE user_id=v_uid AND status='actif' AND role='admin');
 v_all := v_admin OR EXISTS (SELECT 1 FROM user_roles WHERE user_id=v_uid AND status='actif' AND role='commercial');
 IF NOT v_all AND EXISTS (SELECT 1 FROM user_roles WHERE user_id=v_uid AND role IN ('atelier_chef','atelier_metier','ecran_atelier')) THEN
   RAISE EXCEPTION 'Relances indisponibles pour l''atelier' USING ERRCODE='42501'; END IF;
 IF p_tous AND NOT v_admin THEN RAISE EXCEPTION 'Vue « tous » réservée aux administrateurs' USING ERRCODE='42501'; END IF;
 IF p_charge_id IS NOT NULL AND p_charge_id<>v_uid AND NOT v_all THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 v_n := coalesce((SELECT valeur::int FROM v_devis_parametres_courants WHERE cle='relance_delai_envoi'),7);
 v_v := coalesce((SELECT valeur::int FROM v_devis_parametres_courants WHERE cle='relance_delai_validite'),7);
 v_i := coalesce((SELECT valeur::int FROM v_devis_parametres_courants WHERE cle='relance_delai_inactivite'),14);
 SELECT array_agg(a.id) INTO v_ids FROM affaires a WHERE a.phase='opportunite' AND a.archived_at IS NULL AND a.statut_opportunite IN ('a_faire','envoye','a_l_etude','presque_gagne')
   AND (p_tous OR (p_charge_id IS NOT NULL AND a.charge_affaires_id=p_charge_id)
        OR (p_charge_id IS NULL AND (a.charge_affaires_id=v_uid OR EXISTS (SELECT 1 FROM affaire_roles r JOIN employes e ON e.id=r.employe_id WHERE r.affaire_id=a.id AND e.profile_id=v_uid))))
   AND public.relances_perimetre_ok(v_uid,a.id);
 v_ids := coalesce(v_ids,'{}'); v_actives := coalesce(array_length(v_ids,1),0);
 v_pi := CASE WHEN v_actives=0 THEN '{"affaires":[]}'::jsonb ELSE public.pipeline_indicateurs(v_ids) END;
 WITH p AS (SELECT (x->>'affaire_id')::uuid affaire_id,x->>'statut' st,(x->>'devis_id')::uuid devis_id,x->>'devis_numero' devis_numero,(x->>'version')::int version,x->>'statut_redaction' sr,
     coalesce((x->>'net_ht')::numeric,(x->>'estime')::numeric) montant,x->>'source_montant' src FROM jsonb_array_elements(v_pi->'affaires') x),
 act AS (SELECT o.affaire_id,max(o.date) FILTER (WHERE o.type='devis_envoye') d_env,max(o.date) d_max FROM opportunite_actions o WHERE o.affaire_id=ANY(v_ids) AND o.prochaine_action_close_le IS NULL GROUP BY o.affaire_id),
 dern AS (SELECT DISTINCT ON (o.affaire_id) o.affaire_id,o.type::text t,o.date dt,left(o.texte,200) tx FROM opportunite_actions o WHERE o.affaire_id=ANY(v_ids) ORDER BY o.affaire_id,o.date DESC,o.created_at DESC),
 proch AS (SELECT DISTINCT ON (o.affaire_id) o.affaire_id,o.prochaine_action_due_le due FROM opportunite_actions o WHERE o.affaire_id=ANY(v_ids) AND o.prochaine_action_due_le IS NOT NULL AND o.prochaine_action_close_le IS NULL ORDER BY o.affaire_id,o.created_at DESC),
 b AS (SELECT p.*,a.numero,a.nom,coalesce(cl.nom,a.client) client_nom,cc.prenom c_prenom,cc.nom c_nom,cc.email c_email,a.charge_affaires_id,pr.full_name charge_nom,a.statut_opportunite_depuis::date st_depuis,
     d.date_validite,coalesce(d.date_envoi,act.d_env::date) ref_envoi,act.d_max,dern.t,dern.dt,dern.tx,proch.due
   FROM p JOIN affaires a ON a.id=p.affaire_id LEFT JOIN devis d ON d.id=p.devis_id LEFT JOIN clients cl ON cl.id=a.client_id
   LEFT JOIN client_contacts cc ON cc.id=coalesce(d.contact_id,a.client_contact_id) LEFT JOIN profiles pr ON pr.id=a.charge_affaires_id
   LEFT JOIN act ON act.affaire_id=p.affaire_id LEFT JOIN dern ON dern.affaire_id=p.affaire_id LEFT JOIN proch ON proch.affaire_id=p.affaire_id
   WHERE NOT EXISTS (SELECT 1 FROM relances_reports rr WHERE rr.affaire_id=p.affaire_id AND rr.annule_le IS NULL AND rr.jusqu_au>=p_date)),
 m AS (SELECT b.*,array_remove(ARRAY[
   CASE WHEN st='envoye' AND ref_envoi IS NOT NULL AND ref_envoi<p_date-v_n AND (d_max IS NULL OR d_max::date<=ref_envoi) THEN jsonb_build_object('code','envoye_sans_reponse','priorite',1,'jours',p_date-ref_envoi) END,
   CASE WHEN due IS NOT NULL AND due<p_date THEN jsonb_build_object('code','action_en_retard','priorite',2,'jours',p_date-due) END,
   CASE WHEN date_validite IS NOT NULL AND sr IN ('valide','transfere') AND date_validite>=p_date AND date_validite<=p_date+v_v THEN jsonb_build_object('code','validite_proche','priorite',3,'jours',date_validite-p_date) END,
   CASE WHEN st IN ('a_l_etude','presque_gagne') AND coalesce(dt::date,st_depuis,p_date)<=p_date-v_i THEN jsonb_build_object('code','inactif','priorite',4,'jours',p_date-coalesce(dt::date,st_depuis)) END,
   CASE WHEN due IS NULL THEN jsonb_build_object('code','sans_prochaine_action','priorite',5,'jours',NULL) END],NULL) motifs FROM b)
 SELECT coalesce(jsonb_agg(jsonb_build_object('affaire_id',affaire_id,'numero',numero,'titre',nom,'client',client_nom,
   'contact',CASE WHEN c_nom IS NOT NULL OR c_prenom IS NOT NULL OR c_email IS NOT NULL THEN jsonb_build_object('nom',trim(coalesce(c_prenom,'')||' '||coalesce(c_nom,'')),'email',c_email) END,
   'charge_affaires_id',charge_affaires_id,'charge_affaires_nom',charge_nom,'statut',st,'devis_id',devis_id,'devis_numero',devis_numero,'version',version,'statut_redaction',sr,
   'date_envoi',ref_envoi,'validite_le',date_validite,'montant_ht',montant,'source_montant',src,'motifs',to_jsonb(motifs),
   'derniere_action',CASE WHEN dt IS NOT NULL THEN jsonb_build_object('type',t,'date',dt,'texte',tx) END,
   'jours_attente',p_date-coalesce(dt::date,ref_envoi,st_depuis),'prochaine_action_due_le',due)
   ORDER BY (motifs[1]->>'priorite')::int,montant DESC NULLS LAST,numero),'[]'::jsonb) INTO v_rows FROM m WHERE cardinality(motifs)>0;
 RETURN jsonb_build_object('date',p_date,'parametres',jsonb_build_object('delai_envoi',v_n,'delai_validite',v_v,'delai_inactivite',v_i),
   'nb_actives',v_actives,'nb',jsonb_array_length(v_rows),'lignes',v_rows);
END $function$;