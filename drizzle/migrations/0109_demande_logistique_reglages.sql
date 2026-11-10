ALTER TABLE public.logistique_parametres ADD COLUMN demande_log_config jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.demande_log_config_lire(_jeton text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.demande_log_acces(_jeton) THEN RAISE EXCEPTION 'Lien invalide'; END IF;
 RETURN coalesce((SELECT demande_log_config FROM public.logistique_parametres WHERE id=true),'{}'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.demande_log_config_lire(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.demande_log_config_lire(text) TO service_role;

CREATE OR REPLACE FUNCTION public.demande_log_config_admin_lire()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Accès administrateur requis'; END IF;
 RETURN coalesce((SELECT demande_log_config FROM public.logistique_parametres WHERE id=true),'{}'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.demande_log_config_admin_lire() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.demande_log_config_admin_lire() TO authenticated;

CREATE OR REPLACE FUNCTION public.demande_log_config_admin_enregistrer(_config jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v text;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Accès administrateur requis'; END IF;
 PERFORM public.mcp_assert_legacy_oauth_write();
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

CREATE OR REPLACE FUNCTION public.demande_log_verifier_config()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c jsonb; i jsonb; k text;
BEGIN
 IF NEW.metadata_ia->>'origine' IS DISTINCT FROM 'formulaire' THEN RETURN NEW; END IF;
 SELECT demande_log_config INTO c FROM public.logistique_parametres WHERE id=true;
 FOR i IN SELECT jsonb_array_elements(NEW.metadata_ia->'echeances') LOOP
 IF c ? 'categories' AND NOT (c->'categories' ? (i->>'type')) THEN RAISE EXCEPTION 'Catégorie non autorisée'; END IF;
 IF jsonb_typeof(c->'chefs')='array' AND nullif(i->>'responsable_id','') IS NOT NULL AND NOT (c->'chefs' ? (i->>'responsable_id')) THEN RAISE EXCEPTION 'Chef non proposé'; END IF;
 FOR k IN SELECT jsonb_array_elements_text(coalesce(c->'obligatoires','[]'::jsonb)) LOOP
 IF nullif(trim(coalesce(i->>k,'')),'') IS NULL OR (k='nb_personnes' AND coalesce((i->>k)::numeric,0)<=0) THEN RAISE EXCEPTION 'Champ obligatoire manquant : %',k; END IF;
 END LOOP;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.demande_log_verifier_config() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER demande_log_verifier_config BEFORE INSERT ON public.emails_entrants FOR EACH ROW EXECUTE FUNCTION public.demande_log_verifier_config();