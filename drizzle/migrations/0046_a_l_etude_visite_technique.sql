-- Statut « À l'étude » + visite technique / repérage (oct. 2026)
-- - Nouvelle valeur d'enum opportunite_statut : 'a_l_etude' (après 'envoye')
-- - Colonne affaires.date_visite_technique (visite technique / repérage)
-- - Redéfinitions EXPLICITES des RPC touchées (définitions relues en base le 29/10/2026) :
--   app_modifier_affaire, mcp_dispatch_write, list_opportunites_active

-- 1. Enum
ALTER TYPE public.opportunite_statut ADD VALUE IF NOT EXISTS 'a_l_etude' AFTER 'envoye';

-- 2. Colonne visite technique
ALTER TABLE public.affaires ADD COLUMN IF NOT EXISTS date_visite_technique date;

-- 3. app_modifier_affaire : ajout 'a_l_etude' dans la whitelist de statut
--    et 'date_visite_technique' dans la allow-list de champs.
CREATE OR REPLACE FUNCTION public.app_modifier_affaire(_id uuid, _patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$ DECLARE k text; sets text:=''; result jsonb; BEGIN
  IF _patch ? 'statut_opportunite' AND NOT EXISTS(SELECT 1 FROM affaires WHERE id=_id AND phase='opportunite') THEN RAISE EXCEPTION 'Opportunité déjà signée'; END IF;
  PERFORM public.app_assert_affaire_write(_id,'section.affaires');
  IF _patch ? 'statut_opportunite' THEN
    PERFORM public.app_assert_affaire_write(_id,'action.edit_opportunite');
    IF _patch->>'statut_opportunite' NOT IN ('a_faire','envoye','a_l_etude','presque_gagne','gagne','perdu') THEN RAISE EXCEPTION 'Signature interdite'; END IF;
  END IF;
  IF _patch ? 'ca_estime_ht' AND (_patch->>'ca_estime_ht')::numeric<0 THEN RAISE EXCEPTION 'Montant invalide'; END IF;
  IF jsonb_typeof(_patch)<>'object' OR _patch='{}'::jsonb THEN RAISE EXCEPTION 'Modification vide'; END IF;
  FOR k IN SELECT jsonb_object_keys(_patch) LOOP
    IF k NOT IN ('nom','notes','lieu','date_montage','date_demontage','date_evenement_debut','date_evenement_fin','date_pat','date_visite_technique','typologie_future','ca_estime_ht','charge_affaires_id','chef_projet_id','dessinateur_id','statut','statut_opportunite','contact_site_nom','contact_site_tel','montage_nb_techniciens','montage_travail_nuit','montage_nb_semi','montage_nb_20m3','montage_nature_prestation','montage_notes','client_id','opportunite_source','client_contact_id','client','taille') THEN RAISE EXCEPTION 'Champ interdit: %',k; END IF;
    sets:=sets || CASE WHEN sets='' THEN '' ELSE ',' END || format('%I=p.%I',k,k);
  END LOOP;
  EXECUTE format('UPDATE public.affaires t SET %s FROM jsonb_populate_record(NULL::public.affaires,$1) p WHERE t.id=$2 RETURNING jsonb_build_object(''id'',t.id)',sets) INTO result USING _patch,_id;
  IF result IS NULL THEN RAISE EXCEPTION 'Modification refusée par les droits'; END IF;
  RETURN result; END $function$;

-- 4. mcp_dispatch_write : ajout 'date_visite_technique' dans les champs opportunité
--    et 'a_l_etude' dans les statuts posables par Claude (gagné/perdu toujours réservés à l'application).
CREATE OR REPLACE FUNCTION public.mcp_dispatch_write(_tool text, _p jsonb, _affaire_id uuid, _etape_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE result jsonb; k text; patch jsonb; allowed text[]; a public.affaires; BEGIN PERFORM mcp_assert_write(_tool); IF _tool IN ('ajouter_action_opportunite','mettre_a_jour_opportunite') THEN SELECT * INTO a FROM affaires WHERE id=_affaire_id AND phase='opportunite' AND archived_at IS NULL; IF NOT FOUND THEN RAISE EXCEPTION 'Opportunité non signée requise'; END IF; END IF; IF _tool='creer_opportunite' THEN result:=app_creer_opportunite_client(_p-'email_ids'); IF jsonb_array_length(COALESCE(_p->'email_ids','[]'::jsonb))>0 THEN result:=result || jsonb_build_object('demandes',app_traiter_demande(ARRAY(SELECT jsonb_array_elements_text(_p->'email_ids')::uuid),'rattacher',(result->>'affaire_id')::uuid,NULL,false)); END IF; ELSIF _tool='traiter_demande' THEN result:=app_traiter_demande(ARRAY(SELECT jsonb_array_elements_text(_p->'email_ids_resolus')::uuid),_p->'action',NULLIF(_p->>'opportunite_id','')::uuid,_p->'motif',false); ELSIF _tool='ajouter_action_opportunite' THEN result:=app_ajouter_action_opportunite(_affaire_id,(_p->>'type')::public.opp_action_type,_p->'note',(_p->>'echeance')::date); ELSIF _tool='ajouter_note_chantier' THEN result:=app_ajouter_note_chantier(_affaire_id,_p->>'texte'); ELSIF _tool IN ('modifier_chantier','mettre_a_jour_opportunite') THEN patch:=_p->'patch'; allowed:=CASE WHEN _tool='modifier_chantier' THEN ARRAY['date_montage','date_demontage','lieu','contact_site_nom','contact_site_tel','chef_projet_id','charge_affaires_id','dessinateur_id','statut','montage_nb_techniciens','montage_travail_nuit','montage_nb_semi','montage_nb_20m3','montage_nature_prestation','montage_notes','notes'] ELSE ARRAY['nom','notes','lieu','date_montage','date_demontage','date_evenement_debut','date_evenement_fin','date_pat','date_visite_technique','typologie_future','ca_estime_ht','charge_affaires_id','statut_opportunite'] END; FOR k IN SELECT jsonb_object_keys(patch) LOOP IF NOT k=ANY(allowed) THEN RAISE EXCEPTION 'Champ interdit'; END IF; END LOOP; IF _tool='mettre_a_jour_opportunite' AND patch ? 'statut_opportunite' AND patch->>'statut_opportunite' NOT IN ('a_faire','envoye','a_l_etude','presque_gagne') THEN RAISE EXCEPTION 'Statut gagné/perdu réservé à l''application'; END IF; IF patch<>'{}'::jsonb THEN result:=app_modifier_affaire(_affaire_id,patch); ELSE result:=jsonb_build_object('id',_affaire_id); END IF; IF _tool='mettre_a_jour_opportunite' THEN IF _p->>'prochaine_action' IS NOT NULL THEN PERFORM app_ajouter_action_opportunite(_affaire_id,'note_interne',_p->>'prochaine_action',(_p->>'echeance')::date); END IF; IF _p->>'motif' IS NOT NULL THEN PERFORM app_ajouter_action_opportunite(_affaire_id,'note_interne',_p->>'motif',NULL); END IF; IF _p->>'jalon' IS NOT NULL THEN IF _p->>'jalon' NOT IN ('qualification','devis_envoye','negociation') THEN RAISE EXCEPTION 'Jalon signature interdit'; END IF; UPDATE opportunite_jalons SET date_prevue=(_p->>'echeance')::date WHERE affaire_id=_affaire_id AND etape::text=_p->>'jalon'; IF NOT FOUND THEN RAISE EXCEPTION 'Jalon absent: initialiser dans l’UI'; END IF; END IF; END IF; ELSIF _tool='creer_etape_logistique' THEN result:=app_creer_etape_logistique(_p-'cle_externe'); ELSIF _tool='modifier_etape_logistique' THEN patch:=_p->'patch'; IF patch ? 'statut' AND patch->>'statut' NOT IN ('propose','valide','fait') THEN RAISE EXCEPTION 'Annulation nécessite motif'; END IF; result:=app_modifier_etape_logistique(_etape_id,patch); ELSIF _tool='deplacer_etape_logistique' THEN result:=deplacer_etape_logistique(_etape_id,(_p->>'nouveau_debut')::date,(_p->>'nouvelle_fin')::date); ELSIF _tool='annuler_etape_logistique' THEN IF length(trim(_p->>'motif')) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Motif obligatoire'; END IF; result:=app_modifier_etape_logistique(_etape_id,jsonb_build_object('statut','annule','commentaire_equipe',_p->>'motif')); ELSIF _tool='affecter_role_projet' THEN result:=app_affecter_role_projet(_affaire_id,(_p->>'role')::public.projet_role,(_p->>'employe_id')::uuid,(_p->>'date_debut')::date,(_p->>'date_fin')::date,NULL,COALESCE((_p->>'remplacer_dates')::boolean,false)); ELSE RAISE EXCEPTION 'Outil interdit'; END IF; RETURN result || jsonb_build_object('affaire_id',COALESCE(_affaire_id,(result->>'affaire_id')::uuid)); END $function$;

-- 5. list_opportunites_active : + date_visite_technique en sortie
--    (DROP nécessaire : le type de retour change ; GRANT ré-appliqué juste après).
DROP FUNCTION public.list_opportunites_active();
CREATE FUNCTION public.list_opportunites_active()
 RETURNS TABLE(id uuid, numero text, nom text, client text, charge_affaires_id uuid, taille opportunite_taille, statut_opportunite opportunite_statut, date_opportunite date, date_pat date, date_visite_technique date, date_montage date, date_demontage date, notes text, typologie_future text, next_action_due_le date, next_action_text text, last_jalon_etape text, last_jalon_date_atteinte date, actions_count integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT
    a.id,
    a.numero,
    a.nom,
    a.client,
    a.charge_affaires_id,
    a.taille,
    a.statut_opportunite,
    a.date_opportunite,
    a.date_pat,
    a.date_visite_technique,
    a.date_montage,
    a.date_demontage,
    a.notes,
    a.typologie_future,
    na.prochaine_action_due_le AS next_action_due_le,
    na.texte AS next_action_text,
    lj.etape::text AS last_jalon_etape,
    lj.date_atteinte AS last_jalon_date_atteinte,
    COALESCE(ac.cnt, 0)::int AS actions_count
  FROM public.affaires a
  LEFT JOIN LATERAL (
    SELECT oa.prochaine_action_due_le, oa.texte
    FROM public.opportunite_actions oa
    WHERE oa.affaire_id = a.id
      AND oa.prochaine_action_due_le IS NOT NULL
    ORDER BY oa.created_at DESC
    LIMIT 1
  ) na ON TRUE
  LEFT JOIN LATERAL (
    SELECT oj.etape, oj.date_atteinte
    FROM public.opportunite_jalons oj
    WHERE oj.affaire_id = a.id
      AND oj.date_atteinte IS NOT NULL
    ORDER BY oj.date_atteinte DESC
    LIMIT 1
  ) lj ON TRUE
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt
    FROM public.opportunite_actions oa2
    WHERE oa2.affaire_id = a.id
  ) ac ON TRUE
  WHERE a.phase = 'opportunite'
    AND a.archived_at IS NULL
  ORDER BY a.date_opportunite DESC NULLS LAST, a.created_at DESC;
$function$;
GRANT EXECUTE ON FUNCTION public.list_opportunites_active() TO authenticated;