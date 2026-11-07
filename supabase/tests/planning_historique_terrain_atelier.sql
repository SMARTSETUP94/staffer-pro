-- Regression checks on the live database; transaction always rolls back.
BEGIN;
DO $$
DECLARE administrateur uuid; personne uuid; chantier uuid; etape uuid:=gen_random_uuid(); externe uuid:=gen_random_uuid(); avant integer; resultat jsonb;
BEGIN
 SELECT user_id INTO administrateur FROM public.user_roles WHERE role='admin' LIMIT 1;
 SELECT id INTO personne FROM public.employes WHERE actif LIMIT 1;
 SELECT id INTO chantier FROM public.affaires WHERE statut='en_cours' LIMIT 1;
 IF administrateur IS NULL OR personne IS NULL OR chantier IS NULL THEN RAISE EXCEPTION 'Fixtures existantes requises'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',administrateur,'role','authenticated')::text,true);
 SELECT count(*) INTO avant FROM public.employes;
 INSERT INTO public.dispos_intervenants(id,prenom,nom,telephone) VALUES(externe,'Recette','Historique','0699990092');
 resultat:=public.planning_terrain_importer(jsonb_build_array(jsonb_build_object('date','2025-06-01','affaire_id',chantier,'dispos_intervenant_id',externe,'format','Original consolidé')),repeat('a',64));
 IF resultat->>'ajoutes'<>'1' THEN RAISE EXCEPTION 'Import externe non ajouté'; END IF;
 resultat:=public.planning_terrain_importer(jsonb_build_array(jsonb_build_object('date','2025-06-01','affaire_id',chantier,'dispos_intervenant_id',externe,'format','Original consolidé')),repeat('a',64));
 IF resultat->>'ajoutes'<>'0' OR resultat->>'existants'<>'1' THEN RAISE EXCEPTION 'Réimport dupliqué'; END IF;
 IF (SELECT count(*) FROM public.employes)<>avant THEN RAISE EXCEPTION 'Employé créé'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.planning_terrain_historique WHERE personne_cle='dispos:'||externe AND format='Original consolidé') THEN RAISE EXCEPTION 'Provenance perdue'; END IF;
 INSERT INTO public.affaire_etapes_logistiques(id,affaire_id,type,date_debut,date_fin,statut) VALUES(etape,chantier,'montage',current_date+10,current_date+12,'valide');
 PERFORM public.planning_terrain_affecter(etape,current_date+10,externe,'dispos','equipier');
 PERFORM public.planning_terrain_affecter(etape,current_date+12,externe,'dispos','equipier');
 PERFORM public.deplacer_etape_logistique(etape,current_date+13,NULL);
 IF (SELECT array_agg(date ORDER BY date) FROM public.assignations WHERE etape_logistique_id=etape) IS DISTINCT FROM ARRAY[current_date+13,current_date+15] THEN RAISE EXCEPTION 'Dates non déplacées'; END IF;
 BEGIN
  UPDATE public.affaire_etapes_logistiques SET date_fin=current_date+13 WHERE id=etape;
  RAISE EXCEPTION 'Réduction incompatible acceptée';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
  IF SQLERRM NOT LIKE 'Affectations hors%' THEN RAISE; END IF;
 END;
 IF (SELECT date_fin FROM public.affaire_etapes_logistiques WHERE id=etape)<>current_date+15 THEN RAISE EXCEPTION 'Déplacement partiel'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.assignations WHERE dispos_intervenant_id=externe AND historique_terrain AND date='2025-06-01') THEN RAISE EXCEPTION 'Import déplacé'; END IF;
 INSERT INTO public.assignations(affaire_id,employe_id,date,demi_journee,heures,type_operation) VALUES(chantier,personne,current_date-100,'JOURNEE',8,'test_atelier_regression');
 IF NOT EXISTS(SELECT 1 FROM public.planning_terrain_historique WHERE personne_cle='employe:'||personne AND date=current_date-100 AND format='Staffing atelier') THEN RAISE EXCEPTION 'Format atelier incorrect'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.planning_terrain_historique_compteurs()->'operations') j WHERE j->>'operation'='test_atelier_regression') THEN RAISE EXCEPTION 'Atelier inclus par défaut'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.planning_terrain_historique_compteurs(true)->'operations') j WHERE j->>'operation'='test_atelier_regression') THEN RAISE EXCEPTION 'Option atelier incorrecte'; END IF;
END $$;
ROLLBACK;