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
  RETURN result; END $function$

