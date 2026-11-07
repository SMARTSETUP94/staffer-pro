BEGIN;
DO $$
DECLARE u uuid; a uuid; p uuid; b jsonb; r jsonb; eid uuid; n int;
BEGIN
 SELECT user_id INTO u FROM user_roles WHERE role='admin' LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 SELECT id INTO a FROM affaires WHERE numero='4132';
 INSERT INTO dispos_intervenants(nom,prenom,telephone) VALUES('TEST IMPORT HEBDO','Recette','+33600000991') RETURNING id INTO p;
 b:=jsonb_build_array(jsonb_build_object('affaire_id',a,'date','2026-11-15','type','tracage','heure',null,'heure_fin',null,'lieu','TEST IMPORT HEBDO','responsable','Test','note','heure à confirmer','personnes',jsonb_build_array(jsonb_build_object('id',p,'origine','dispos','nom_original','TEST IMPORT HEBDO Recette'))));
 r:=planning_terrain_import_semaine(b,'test.pdf');
 IF (r->>'ajoutes')::int<>1 OR (r->>'etapes_creees')::int<>1 THEN RAISE EXCEPTION 'premier import incorrect %',r; END IF;
 eid:=(r->'etape_ids'->>0)::uuid;
 r:=planning_terrain_import_semaine(b,'renomme.xlsx');
 IF (r->>'ajoutes')::int<>0 OR (r->>'existants')::int<>1 OR (r->>'etapes_creees')::int<>0 THEN RAISE EXCEPTION 'doublon %',r; END IF;
 SELECT count(*) INTO n FROM assignations WHERE dispos_intervenant_id=p;
 IF n<>1 THEN RAISE EXCEPTION 'externe doublonné'; END IF;
 SELECT count(*) INTO n FROM employes WHERE nom='TEST IMPORT HEBDO';
 IF n<>0 THEN RAISE EXCEPTION 'employé créé'; END IF;
 UPDATE affaire_etapes_logistiques SET note='Correction humaine' WHERE id=eid;
 PERFORM planning_terrain_import_semaine(b,'test.pdf');
 IF (SELECT note FROM affaire_etapes_logistiques WHERE id=eid)<>'Correction humaine' THEN RAISE EXCEPTION 'correction écrasée'; END IF;
 BEGIN
  PERFORM planning_terrain_import_semaine(jsonb_build_array((b->0)||jsonb_build_object('lieu','TEST ATOMIC'),(b->0)||jsonb_build_object('lieu','TEST ERREUR','personnes',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'origine','dispos','nom_original','inconnu')))),'erreur.pdf');
  RAISE EXCEPTION 'ERREUR NON REFUSEE';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='ERREUR NON REFUSEE' THEN RAISE; END IF; END;
 IF EXISTS(SELECT 1 FROM affaire_etapes_logistiques WHERE lieu_libre='TEST ATOMIC') THEN RAISE EXCEPTION 'écriture partielle'; END IF;
 PERFORM set_config('request.jwt.claim.sub','',true); PERFORM set_config('request.jwt.claims','{}',true);
 BEGIN PERFORM planning_terrain_import_semaine(b,'anonyme.pdf'); RAISE EXCEPTION 'ANONYME ACCEPTE'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'Recette réussie : import externe, réimport renommé, correction préservée, atomicité, refus anonyme';
END $$;
ROLLBACK;
SELECT count(*) as essais_restants FROM dispos_intervenants WHERE nom='TEST IMPORT HEBDO';
