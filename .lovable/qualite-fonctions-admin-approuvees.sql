-- Qualité des données : fonctions réservées aux admins (aucune suppression)
CREATE OR REPLACE FUNCTION public.qualite_assert_admin() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN IF auth.jwt()->>'client_id' IS NOT NULL THEN RAISE EXCEPTION 'Actions qualité réservées à l’application'; END IF; IF auth.uid() IS NULL OR NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Réservé aux administrateurs'; END IF; END $$;

CREATE OR REPLACE FUNCTION public.qualite_journal(_avant jsonb, _champ text, _de jsonb, _a jsonb) RETURNS jsonb
LANGUAGE sql VOLATILE SET search_path TO 'public' AS $$
  SELECT coalesce(_avant,'[]'::jsonb) || jsonb_build_object('champ',_champ,'avant',_de,'apres',_a,'par',auth.uid(),'le',now())
$$;

-- 1. Relier une fiche Dispos à un employé / refuser un homonyme
CREATE OR REPLACE FUNCTION public.qualite_relier_dispos(_dispos uuid, _employe uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN PERFORM qualite_assert_admin();
  IF EXISTS (SELECT 1 FROM dispos_intervenants WHERE employe_id=_employe AND id<>_dispos) THEN RAISE EXCEPTION 'Employé déjà relié à une autre fiche Dispos'; END IF;
  UPDATE dispos_intervenants SET employe_id=_employe WHERE id=_dispos AND employe_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fiche Dispos introuvable ou déjà reliée'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.qualite_refuser_homonyme(_dispos uuid, _employe uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN PERFORM qualite_assert_admin();
  UPDATE dispos_intervenants SET employes_refuses=array(SELECT DISTINCT unnest(employes_refuses||_employe)) WHERE id=_dispos;
END $$;

-- 2. Appliquer les infos terrain Dispos à la fiche employé (champs autorisés uniquement)
CREATE OR REPLACE FUNCTION public.qualite_appliquer_dispos(_dispos uuid, _champs text[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE d dispos_intervenants; e employes; c text; h jsonb;
BEGIN PERFORM qualite_assert_admin();
  SELECT * INTO d FROM dispos_intervenants WHERE id=_dispos;
  IF d.employe_id IS NULL THEN RAISE EXCEPTION 'Fiche Dispos non reliée'; END IF;
  SELECT * INTO e FROM employes WHERE id=d.employe_id FOR UPDATE; h:=e.historique_qualite;
  FOREACH c IN ARRAY _champs LOOP
    IF c='telephone' AND nullif(trim(d.telephone),'') IS NOT NULL THEN h:=qualite_journal(h,c,to_jsonb(e.telephone),to_jsonb(d.telephone)); e.telephone:=d.telephone;
    ELSIF c='permis' THEN h:=qualite_journal(h,c,to_jsonb(e.categories_permis),to_jsonb(d.permis));
      e.categories_permis:=array(SELECT p::categorie_permis FROM unnest(d.permis) p WHERE p IN ('B','C','CE','D'));
    ELSIF c='caces' THEN h:=qualite_journal(h,c,to_jsonb(e.caces),to_jsonb(d.caces)); e.caces:=array(SELECT x FROM unnest(d.caces) x WHERE x<>'aucun');
    ELSIF c='poste' AND nullif(trim(d.poste_terrain),'') IS NOT NULL THEN h:=qualite_journal(h,c,to_jsonb(e.poste_principal),to_jsonb(d.poste_terrain)); e.poste_principal:=d.poste_terrain;
    ELSIF c='chef' THEN h:=qualite_journal(h,c,to_jsonb(e.est_chef_equipe_terrain),to_jsonb(d.est_chef_equipe_terrain)); e.est_chef_equipe_terrain:=coalesce(d.est_chef_equipe_terrain,false);
    ELSIF c NOT IN ('telephone','poste') THEN RAISE EXCEPTION 'Champ interdit: %',c; END IF;
  END LOOP;
  UPDATE employes SET telephone=e.telephone, categories_permis=e.categories_permis, caces=e.caces, poste_principal=e.poste_principal,
    est_chef_equipe_terrain=e.est_chef_equipe_terrain, historique_qualite=h WHERE id=e.id;
END $$;

-- 3. Fusion d'employés : références déplacées sauf conflit d'unicité (laissées et listées), fiche fusionnée désactivée
CREATE OR REPLACE FUNCTION public.qualite_fusionner_employes(_garder uuid, _fusionner uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n int; r jsonb:='{}'; g employes; f employes;
BEGIN PERFORM qualite_assert_admin();
  IF _garder=_fusionner THEN RAISE EXCEPTION 'Même fiche'; END IF;
  SELECT * INTO g FROM employes WHERE id=_garder FOR UPDATE; SELECT * INTO f FROM employes WHERE id=_fusionner FOR UPDATE;
  IF g.id IS NULL OR f.id IS NULL OR f.fusionne_dans IS NOT NULL OR g.fusionne_dans IS NOT NULL THEN RAISE EXCEPTION 'Fiches invalides'; END IF;
  IF EXISTS (SELECT 1 FROM contrats_intermittents WHERE employee_id=_fusionner) THEN RAISE EXCEPTION 'Fusion refusée : contrats liés, aucune écriture contrat autorisée'; END IF;
  UPDATE absences SET employe_id=_garder WHERE employe_id=_fusionner; GET DIAGNOSTICS n=ROW_COUNT; r:=r||jsonb_build_object('absences',n);
  UPDATE affaires SET chef_chantier_id=_garder WHERE chef_chantier_id=_fusionner; GET DIAGNOSTICS n=ROW_COUNT; r:=r||jsonb_build_object('affaires',n);

  UPDATE heures_saisies_historique SET pour_compte_de=_garder WHERE pour_compte_de=_fusionner;
  UPDATE heures_validations SET valide_par_chef_id=_garder WHERE valide_par_chef_id=_fusionner;
  UPDATE mission_events SET employe_id=_garder WHERE employe_id=_fusionner;
  UPDATE swap_requests SET from_employe_id=_garder WHERE from_employe_id=_fusionner;
  UPDATE swap_requests SET to_employe_id=_garder WHERE to_employe_id=_fusionner;
  UPDATE trajets SET chauffeur_id=_garder WHERE chauffeur_id=_fusionner;
  -- Tables avec unicité : seulement les lignes sans conflit
  UPDATE assignations a SET employe_id=_garder WHERE employe_id=_fusionner AND NOT (historique_terrain AND EXISTS (SELECT 1 FROM assignations b WHERE b.employe_id=_garder AND b.affaire_id=a.affaire_id AND b.date=a.date AND b.historique_terrain));
  GET DIAGNOSTICS n=ROW_COUNT; r:=r||jsonb_build_object('affectations',n);
  UPDATE heures_saisies h SET employe_id=_garder WHERE employe_id=_fusionner AND NOT (assignation_id IS NOT NULL AND EXISTS (SELECT 1 FROM heures_saisies x WHERE x.employe_id=_garder AND x.assignation_id=h.assignation_id));
  GET DIAGNOSTICS n=ROW_COUNT; r:=r||jsonb_build_object('heures',n);
  UPDATE affaire_equipe a SET employe_id=_garder WHERE employe_id=_fusionner AND NOT EXISTS (SELECT 1 FROM affaire_equipe b WHERE b.employe_id=_garder AND b.affaire_id=a.affaire_id AND b.phase=a.phase);
  UPDATE affaire_roles SET employe_id=_garder WHERE employe_id=_fusionner;
  UPDATE employe_metiers a SET employe_id=_garder WHERE employe_id=_fusionner AND NOT EXISTS (SELECT 1 FROM employe_metiers b WHERE b.employe_id=_garder AND b.metier_id=a.metier_id);
  UPDATE role_referents a SET employe_id=_garder WHERE employe_id=_fusionner AND NOT EXISTS (SELECT 1 FROM role_referents b WHERE b.employe_id=_garder AND b.role=a.role);
  UPDATE employes_autorisations_vehicules a SET employe_id=_garder WHERE employe_id=_fusionner AND NOT EXISTS (SELECT 1 FROM employes_autorisations_vehicules b WHERE b.employe_id=_garder AND b.type_autorisation=a.type_autorisation);
  UPDATE vehicule_chauffeurs_autorises a SET employe_id=_garder WHERE employe_id=_fusionner AND NOT EXISTS (SELECT 1 FROM vehicule_chauffeurs_autorises b WHERE b.employe_id=_garder AND b.vehicule_id=a.vehicule_id);
  UPDATE fabrication_objet_equipe a SET employe_id=_garder WHERE employe_id=_fusionner AND NOT EXISTS (SELECT 1 FROM fabrication_objet_equipe b WHERE b.employe_id=_garder AND b.objet_id=a.objet_id);
  UPDATE staffing_plan_assignment a SET employe_id=_garder WHERE employe_id=_fusionner AND NOT EXISTS (SELECT 1 FROM staffing_plan_assignment b WHERE b.employe_id=_garder AND b.step_id=a.step_id AND b.date=a.date);
  UPDATE dispos_intervenants SET employe_id=_garder WHERE employe_id=_fusionner AND NOT EXISTS (SELECT 1 FROM dispos_intervenants WHERE employe_id=_garder);
  -- Compte de connexion repris s'il manque sur la fiche gardée
  IF g.profile_id IS NULL AND f.profile_id IS NOT NULL THEN UPDATE employes SET profile_id=NULL WHERE id=_fusionner; UPDATE employes SET profile_id=f.profile_id WHERE id=_garder; END IF;
  r:=r||jsonb_build_object('references_restantes',jsonb_build_object(
    'assignations',(SELECT coalesce(jsonb_agg(id),'[]') FROM assignations WHERE employe_id=_fusionner),
    'heures_saisies',(SELECT coalesce(jsonb_agg(id),'[]') FROM heures_saisies WHERE employe_id=_fusionner),
    'affaire_equipe',(SELECT coalesce(jsonb_agg(id),'[]') FROM affaire_equipe WHERE employe_id=_fusionner),
    'employe_metiers',(SELECT coalesce(jsonb_agg(id),'[]') FROM employe_metiers WHERE employe_id=_fusionner),
    'role_referents',(SELECT coalesce(jsonb_agg(id),'[]') FROM role_referents WHERE employe_id=_fusionner),
    'autorisations',(SELECT coalesce(jsonb_agg(id),'[]') FROM employes_autorisations_vehicules WHERE employe_id=_fusionner),
    'vehicules',(SELECT coalesce(jsonb_agg(id),'[]') FROM vehicule_chauffeurs_autorises WHERE employe_id=_fusionner),
    'fabrication',(SELECT coalesce(jsonb_agg(id),'[]') FROM fabrication_objet_equipe WHERE employe_id=_fusionner),
    'staffing',(SELECT coalesce(jsonb_agg(id),'[]') FROM staffing_plan_assignment WHERE employe_id=_fusionner),
    'dispos',(SELECT coalesce(jsonb_agg(id),'[]') FROM dispos_intervenants WHERE employe_id=_fusionner),
    'profile_id',(SELECT profile_id FROM employes WHERE id=_fusionner)));
  UPDATE employes SET actif=false, fusionne_dans=_garder, fusionne_le=now(),
    notes=concat_ws(E'\n',notes,'Fusionnée dans '||g.prenom||' '||g.nom||' ('||_garder||') le '||to_char(now(),'DD/MM/YYYY')),
    historique_qualite=qualite_journal(historique_qualite,'fusion',to_jsonb(_fusionner),to_jsonb(_garder)) WHERE id=_fusionner;
  UPDATE employes SET historique_qualite=qualite_journal(historique_qualite,'fusion_recue',to_jsonb(_fusionner),r) WHERE id=_garder;
  RETURN r;
END $$;

-- 4. Désactivation / réactivation en lot, sans changement de contrat
CREATE OR REPLACE FUNCTION public.qualite_activer_employes(_ids uuid[], _actif boolean) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n int; BEGIN PERFORM qualite_assert_admin();
  IF _actif AND _ids && ARRAY['28370e42-020d-4168-b9ad-fdb89124d6b2','a4f657ea-49b8-430b-a3b1-fb000f8afc28','9aad1e59-df05-4da8-9c70-cc4e630cc101']::uuid[] THEN RAISE EXCEPTION 'Ces trois fiches doivent rester inactives'; END IF;
  UPDATE employes SET actif=_actif, historique_qualite=qualite_journal(historique_qualite,'actif',to_jsonb(actif),to_jsonb(_actif))
  WHERE id=ANY(_ids) AND fusionne_dans IS NULL AND actif<>_actif; GET DIAGNOSTICS n=ROW_COUNT; RETURN n; END $$;

-- 5. Fusion de clients (références déplacées, contacts en doublon d'email laissés et comptés)
CREATE OR REPLACE FUNCTION public.qualite_fusionner_clients(_garder uuid, _fusionner uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n int; r jsonb:='{}'; g clients;
BEGIN PERFORM qualite_assert_admin();
  PERFORM set_config('app.devis_rpc','true',true);
  SELECT * INTO g FROM clients WHERE id=_garder FOR UPDATE;
  PERFORM 1 FROM clients WHERE id=_fusionner FOR UPDATE;
  IF g.id IS NULL OR _garder=_fusionner OR NOT EXISTS (SELECT 1 FROM clients WHERE id=_fusionner AND fusionne_dans IS NULL) THEN RAISE EXCEPTION 'Fiches invalides'; END IF;
  UPDATE affaires SET client_id=_garder WHERE client_id=_fusionner; GET DIAGNOSTICS n=ROW_COUNT; r:=r||jsonb_build_object('affaires',n);
  UPDATE devis SET client_id=_garder WHERE client_id=_fusionner; GET DIAGNOSTICS n=ROW_COUNT; r:=r||jsonb_build_object('devis',n);
  UPDATE devis SET client_final_id=_garder WHERE client_final_id=_fusionner;
  UPDATE emails_entrants SET client_id=_garder WHERE client_id=_fusionner; GET DIAGNOSTICS n=ROW_COUNT; r:=r||jsonb_build_object('demandes',n);
  UPDATE contacts_logistiques SET client_id=_garder WHERE client_id=_fusionner;
  UPDATE client_contacts a SET client_id=_garder WHERE client_id=_fusionner AND NOT (email IS NOT NULL AND EXISTS (SELECT 1 FROM client_contacts b WHERE b.client_id=_garder AND lower(b.email)=lower(a.email)));
  GET DIAGNOSTICS n=ROW_COUNT; r:=r||jsonb_build_object('contacts',n,'contacts_restants',(SELECT count(*) FROM client_contacts WHERE client_id=_fusionner));
  UPDATE clients SET siret=coalesce(siret,(SELECT siret FROM clients WHERE id=_fusionner)), tva_intracom=coalesce(tva_intracom,(SELECT tva_intracom FROM clients WHERE id=_fusionner)),
    adresse=coalesce(adresse,(SELECT adresse FROM clients WHERE id=_fusionner)), code_postal=coalesce(code_postal,(SELECT code_postal FROM clients WHERE id=_fusionner)),
    ville=coalesce(ville,(SELECT ville FROM clients WHERE id=_fusionner)),
    domaines_email=array(SELECT DISTINCT unnest(coalesce(domaines_email,'{}')||coalesce((SELECT domaines_email FROM clients WHERE id=_fusionner),'{}'))),
    historique_qualite=qualite_journal(historique_qualite,'fusion_recue',to_jsonb(_fusionner),r) WHERE id=_garder;
  UPDATE clients SET actif=false, fusionne_dans=_garder, fusionne_le=now(),
    notes=concat_ws(E'\n',notes,'Fusionné dans '||g.nom||' ('||_garder||') le '||to_char(now(),'DD/MM/YYYY')),
    historique_qualite=qualite_journal(historique_qualite,'fusion',to_jsonb(_fusionner),to_jsonb(_garder)) WHERE id=_fusionner;
  RETURN r;
END $$;

-- 6. CA estimé d'une opportunité (saisi ou repris du devis) et rattachement client d'une demande
CREATE OR REPLACE FUNCTION public.qualite_definir_ca(_affaire uuid, _ca numeric) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN PERFORM qualite_assert_admin();
  IF _ca IS NULL OR _ca<0 THEN RAISE EXCEPTION 'CA invalide'; END IF;
  UPDATE affaires SET ca_estime_ht=_ca WHERE id=_affaire AND phase='opportunite' AND archived_at IS NULL; IF NOT FOUND THEN RAISE EXCEPTION 'Opportunité introuvable'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.qualite_rattacher_demande(_email uuid, _client uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN PERFORM qualite_assert_admin();
  UPDATE emails_entrants SET client_id=_client, client_a_identifier=false WHERE id=_email;
  IF NOT FOUND THEN RAISE EXCEPTION 'Demande introuvable'; END IF;
END $$;

REVOKE ALL ON FUNCTION public.qualite_journal(jsonb,text,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.qualite_journal(jsonb,text,jsonb,jsonb) TO authenticated;
DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['qualite_relier_dispos(uuid,uuid)','qualite_refuser_homonyme(uuid,uuid)','qualite_appliquer_dispos(uuid,text[])',
    'qualite_fusionner_employes(uuid,uuid)','qualite_activer_employes(uuid[],boolean)',
    'qualite_fusionner_clients(uuid,uuid)','qualite_definir_ca(uuid,numeric)','qualite_rattacher_demande(uuid,uuid)','qualite_assert_admin()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;