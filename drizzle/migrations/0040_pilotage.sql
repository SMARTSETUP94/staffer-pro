CREATE OR REPLACE FUNCTION public.charge_roles_projet()
RETURNS TABLE(employe_id uuid, role public.projet_role, nb_en_cours int, nb_potentielles int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL
     OR NOT (public.user_has_cap('planning.pilotage') OR public.user_has_cap('affaires.edit')) THEN
    RAISE EXCEPTION 'Accès réservé au planning de pilotage' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  SELECT ar.employe_id, ar.role,
    (count(*) FILTER (WHERE
         (a.phase = 'signe' AND a.statut NOT IN ('termine','annule'))
      OR (a.phase = 'opportunite' AND a.statut_opportunite IN ('presque_gagne','gagne'))))::int,
    (count(*) FILTER (WHERE
         a.phase = 'opportunite' AND a.statut_opportunite IN ('a_faire','envoye')))::int
  FROM public.affaire_roles ar
  JOIN public.affaires a ON a.id = ar.affaire_id
  WHERE a.archived_at IS NULL
  GROUP BY ar.employe_id, ar.role;
END $$;
REVOKE EXECUTE ON FUNCTION public.charge_roles_projet() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.charge_roles_projet() TO authenticated;

CREATE OR REPLACE FUNCTION public.app_affecter_role_projet(
  _affaire_id uuid, _role public.projet_role, _employe_id uuid,
  _date_debut date DEFAULT NULL, _date_fin date DEFAULT NULL, _note text DEFAULT NULL,
  _remplacer_dates boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.mcp_assert_legacy_oauth_write('app_affecter_role_projet');
  PERFORM public.app_assert_affaire_write(_affaire_id, 'affaires.edit');
  IF _employe_id IS NULL THEN
    DELETE FROM public.affaire_roles WHERE affaire_id = _affaire_id AND role = _role;
    RETURN jsonb_build_object('affaire_id', _affaire_id, 'role', _role, 'retire', true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.employes WHERE id = _employe_id AND actif) THEN
    RAISE EXCEPTION 'Employé inconnu ou inactif';
  END IF;
  INSERT INTO public.affaire_roles(affaire_id, role, employe_id, date_debut, date_fin, note)
  VALUES (_affaire_id, _role, _employe_id, _date_debut, _date_fin, _note)
  ON CONFLICT (affaire_id, role) DO UPDATE SET
    employe_id = EXCLUDED.employe_id,
    date_debut = CASE WHEN _remplacer_dates THEN EXCLUDED.date_debut
                      ELSE COALESCE(EXCLUDED.date_debut, affaire_roles.date_debut) END,
    date_fin   = CASE WHEN _remplacer_dates THEN EXCLUDED.date_fin
                      ELSE COALESCE(EXCLUDED.date_fin, affaire_roles.date_fin) END,
    note       = COALESCE(EXCLUDED.note, affaire_roles.note)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'affaire_id', _affaire_id, 'role', _role, 'employe_id', _employe_id);
END $$;
REVOKE EXECUTE ON FUNCTION public.app_affecter_role_projet(uuid, public.projet_role, uuid, date, date, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_affecter_role_projet(uuid, public.projet_role, uuid, date, date, text, boolean) TO authenticated, mcp_business_rls;

CREATE OR REPLACE FUNCTION public.app_modifier_affaire(_id uuid, _patch jsonb)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public'
AS $function$ DECLARE k text; sets text:=''; result jsonb; BEGIN
  IF _patch ? 'statut_opportunite' AND NOT EXISTS(SELECT 1 FROM affaires WHERE id=_id AND phase='opportunite') THEN RAISE EXCEPTION 'Opportunité déjà signée'; END IF;
  PERFORM public.app_assert_affaire_write(_id,'section.affaires');
  IF _patch ? 'statut_opportunite' THEN
    PERFORM public.app_assert_affaire_write(_id,'action.edit_opportunite');
    IF _patch->>'statut_opportunite' NOT IN ('a_faire','envoye','presque_gagne','gagne','perdu') THEN RAISE EXCEPTION 'Signature interdite'; END IF;
  END IF;
  IF _patch ? 'ca_estime_ht' AND (_patch->>'ca_estime_ht')::numeric<0 THEN RAISE EXCEPTION 'Montant invalide'; END IF;
  IF jsonb_typeof(_patch)<>'object' OR _patch='{}'::jsonb THEN RAISE EXCEPTION 'Modification vide'; END IF;
  FOR k IN SELECT jsonb_object_keys(_patch) LOOP
    IF k NOT IN ('nom','notes','lieu','date_montage','date_demontage','date_evenement_debut','date_evenement_fin','date_pat','typologie_future','ca_estime_ht','charge_affaires_id','chef_projet_id','dessinateur_id','statut','statut_opportunite','contact_site_nom','contact_site_tel','montage_nb_techniciens','montage_travail_nuit','montage_nb_semi','montage_nb_20m3','montage_nature_prestation','montage_notes','client_id','opportunite_source','client_contact_id','client','taille') THEN RAISE EXCEPTION 'Champ interdit: %',k; END IF;
    sets:=sets || CASE WHEN sets='' THEN '' ELSE ',' END || format('%I=p.%I',k,k);
  END LOOP;
  EXECUTE format('UPDATE public.affaires t SET %s FROM jsonb_populate_record(NULL::public.affaires,$1) p WHERE t.id=$2 RETURNING jsonb_build_object(''id'',t.id)',sets) INTO result USING _patch,_id;
  IF result IS NULL THEN RAISE EXCEPTION 'Modification refusée par les droits'; END IF;
  RETURN result; END $function$;

CREATE OR REPLACE FUNCTION public.sign_opportunite(_affaire_id uuid, _new_code text, _chef_projet_id uuid, _dessinateur_id uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  PERFORM public.mcp_assert_legacy_oauth_write('sign_opportunite');
  IF NOT public.user_has_cap('action.sign_opportunite') THEN
    RAISE EXCEPTION 'Action réservée : capability action.sign_opportunite requise.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_id := public.sign_opportunite(_affaire_id, _new_code);
  UPDATE public.affaires
     SET chef_projet_id = COALESCE(_chef_projet_id, chef_projet_id),
         dessinateur_id = COALESCE(_dessinateur_id, dessinateur_id)
   WHERE id = v_id;
  RETURN v_id;
END;
$function$;

INSERT INTO public.capabilities(key, label, description, category, sort_order)
VALUES ('planning.pilotage', 'Planning BE / projets',
        'Lire le planning de pilotage des concepteurs et responsables projet', 'planning', 50)
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.role_capabilities(role, capability, granted)
SELECT r::public.app_role, 'planning.pilotage', true
FROM unnest(ARRAY['admin','chef_chantier','bureau_etude','commercial']) r
ON CONFLICT DO NOTHING;