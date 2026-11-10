CREATE OR REPLACE FUNCTION public.demande_log_config_admin_enregistrer(_config jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v text;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Accès administrateur requis'; END IF;
 IF nullif(auth.jwt()->>'client_id','') IS NOT NULL THEN RAISE EXCEPTION 'Réglages réservés à l''application'; END IF;
 IF jsonb_typeof(_config)<>'object' OR jsonb_typeof(_config->'categories') IS DISTINCT FROM 'array' OR jsonb_array_length(_config->'categories')=0 OR jsonb_typeof(_config->'obligatoires') IS DISTINCT FROM 'array' OR jsonb_typeof(_config->'accueil') IS DISTINCT FROM 'string' OR length(_config->>'accueil')>1000 THEN RAISE EXCEPTION 'Réglages invalides'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(_config) k WHERE k NOT IN ('chefs','categories','obligatoires','accueil')) THEN RAISE EXCEPTION 'Réglage inconnu'; END IF;
 IF coalesce(jsonb_typeof(_config->'chefs'),'null') NOT IN ('array','null') THEN RAISE EXCEPTION 'Chefs invalides'; END IF;
 FOR v IN SELECT jsonb_array_elements_text(_config->'categories') LOOP
 IF v NOT IN ('appro','emballage','chargement','livraison','tracage','montage','finitions','permanence','rotation','demontage','dechargement') THEN RAISE EXCEPTION 'Catégorie invalide'; END IF; END LOOP;
 FOR v IN SELECT jsonb_array_elements_text(_config->'obligatoires') LOOP
 IF v NOT IN ('heure_debut','lieu','contact_sur_place','vehicule','nb_personnes','responsable','commentaire') THEN RAISE EXCEPTION 'Champ invalide'; END IF; END LOOP;
 IF jsonb_typeof(_config->'chefs')='array' THEN
 FOR v IN SELECT jsonb_array_elements_text(_config->'chefs') LOOP
 IF NOT EXISTS(SELECT 1 FROM public.dispos_intervenants WHERE id::text=v AND actif) AND NOT EXISTS(SELECT 1 FROM public.employes e WHERE e.id::text=v AND e.actif AND NOT EXISTS(SELECT 1 FROM public.dispos_intervenants d WHERE d.employe_id=e.id)) THEN RAISE EXCEPTION 'Chef inconnu ou inactif'; END IF;
 END LOOP; END IF;
 UPDATE public.logistique_parametres SET demande_log_config=_config,updated_at=now() WHERE id=true;
 IF NOT FOUND THEN RAISE EXCEPTION 'Paramètres absents'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.demande_log_config_admin_enregistrer(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.demande_log_config_admin_enregistrer(jsonb) TO authenticated;