DO $$
DECLARE v_old uuid := 'd65ba705-bdd3-4aa3-94bf-9be9d86c3e0d';
        v_new uuid := '68f44ab5-c3a0-4514-9c7b-5ae0fd54290f';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.employes WHERE id = v_old) THEN RETURN; END IF;
  IF (SELECT profile_id FROM public.employes WHERE id = v_old) IS NOT NULL THEN
    RAISE EXCEPTION 'Fusion annulée : la fiche à fusionner a un compte';
  END IF;
  UPDATE public.employe_metiers m SET employe_id = v_new
   WHERE m.employe_id = v_old
     AND NOT EXISTS (SELECT 1 FROM public.employe_metiers x
                     WHERE x.employe_id = v_new AND x.metier_id = m.metier_id);
  UPDATE public.absences                       SET employe_id = v_new WHERE employe_id = v_old;
  UPDATE public.affaire_equipe                 SET employe_id = v_new WHERE employe_id = v_old;
  UPDATE public.affaires                       SET chef_chantier_id = v_new WHERE chef_chantier_id = v_old;
  UPDATE public.assignations                   SET employe_id = v_new WHERE employe_id = v_old;
  UPDATE public.contrats_intermittents         SET employee_id = v_new WHERE employee_id = v_old;
  UPDATE public.employes_autorisations_vehicules SET employe_id = v_new WHERE employe_id = v_old;
  UPDATE public.fabrication_objet_equipe       SET employe_id = v_new WHERE employe_id = v_old;
  UPDATE public.heures_saisies                 SET employe_id = v_new WHERE employe_id = v_old;
  UPDATE public.heures_saisies_historique      SET pour_compte_de = v_new WHERE pour_compte_de = v_old;
  UPDATE public.heures_validations             SET valide_par_chef_id = v_new WHERE valide_par_chef_id = v_old;
  UPDATE public.mission_events                 SET employe_id = v_new WHERE employe_id = v_old;
  UPDATE public.staffing_plan_assignment       SET employe_id = v_new WHERE employe_id = v_old;
  UPDATE public.swap_requests                  SET from_employe_id = v_new WHERE from_employe_id = v_old;
  UPDATE public.swap_requests                  SET to_employe_id = v_new WHERE to_employe_id = v_old;
  UPDATE public.trajets                        SET chauffeur_id = v_new WHERE chauffeur_id = v_old;
  UPDATE public.vehicule_chauffeurs_autorises  SET employe_id = v_new WHERE employe_id = v_old
   AND NOT EXISTS (SELECT 1 FROM public.vehicule_chauffeurs_autorises x
                   WHERE x.employe_id = v_new AND x.vehicule_id = vehicule_chauffeurs_autorises.vehicule_id);
  UPDATE public.affaire_equipe_historique      SET employe_id = v_new WHERE employe_id = v_old;
  UPDATE public.employes SET actif = false,
         notes = concat_ws(E'\n', notes, 'Fiche fusionnée dans 68f44ab5 (Kevin Lebon) le ' || now()::date)
   WHERE id = v_old;
END $$;

DO $$
DECLARE fk record; v_n bigint; v_reste text := '';
BEGIN
  FOR fk IN
    SELECT c.conrelid::regclass AS tbl, a.attname AS col
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
     WHERE c.contype = 'f' AND c.confrelid = 'public.employes'::regclass
  LOOP
    EXECUTE format('SELECT count(*) FROM %s WHERE %I = $1', fk.tbl, fk.col)
      INTO v_n USING 'd65ba705-bdd3-4aa3-94bf-9be9d86c3e0d'::uuid;
    IF v_n > 0 THEN v_reste := v_reste || format('%s.%s=%s ', fk.tbl, fk.col, v_n); END IF;
  END LOOP;
  IF v_reste <> '' THEN RAISE EXCEPTION 'Fusion Kevin incomplète : %', v_reste; END IF;
END $$;

INSERT INTO public.role_referents(employe_id, role, niveau)
SELECT v.e::uuid, v.r::public.projet_role, v.n::public.referent_niveau FROM (VALUES
 ('7b9de5c4-3f3d-4f3d-8608-a533dd0c543d','charge_affaires','principal'),
 ('09758232-d71f-461b-bc3e-d3afdba3a6b0','charge_affaires','principal'),
 ('1dec2ead-feaa-40f6-a7ee-c9be3417e01d','charge_affaires','principal'),
 ('68f44ab5-c3a0-4514-9c7b-5ae0fd54290f','charge_affaires','secondaire'),
 ('23844cc6-b506-4ce0-8872-072230aaa913','charge_affaires','secondaire'),
 ('c77dfa4d-53df-4f9a-beee-5c0d61d18e58','concepteur','principal'),
 ('d84b7bdf-9260-4022-bb45-ba1a8d2c57c2','concepteur','principal'),
 ('68f44ab5-c3a0-4514-9c7b-5ae0fd54290f','concepteur','principal'),
 ('1dec2ead-feaa-40f6-a7ee-c9be3417e01d','concepteur','secondaire'),
 ('2350b9ed-aba2-4de0-a989-2dfb8a16fd17','concepteur','secondaire'),
 ('23844cc6-b506-4ce0-8872-072230aaa913','concepteur','secondaire'),
 ('fa27a6d3-0639-4bb6-a913-f2d37016b659','concepteur','secondaire'),
 ('7b9de5c4-3f3d-4f3d-8608-a533dd0c543d','responsable_projet','principal'),
 ('09758232-d71f-461b-bc3e-d3afdba3a6b0','responsable_projet','principal'),
 ('1dec2ead-feaa-40f6-a7ee-c9be3417e01d','responsable_projet','principal'),
 ('d84b7bdf-9260-4022-bb45-ba1a8d2c57c2','responsable_projet','principal'),
 ('23844cc6-b506-4ce0-8872-072230aaa913','responsable_projet','secondaire'),
 ('68f44ab5-c3a0-4514-9c7b-5ae0fd54290f','responsable_projet','secondaire'),
 ('c77dfa4d-53df-4f9a-beee-5c0d61d18e58','responsable_projet','secondaire'),
 ('fa27a6d3-0639-4bb6-a913-f2d37016b659','responsable_projet','secondaire'),
 ('2350b9ed-aba2-4de0-a989-2dfb8a16fd17','chef_constructeur','principal'),
 ('23844cc6-b506-4ce0-8872-072230aaa913','chef_constructeur','principal'),
 ('68f44ab5-c3a0-4514-9c7b-5ae0fd54290f','chef_constructeur','principal'),
 ('fa27a6d3-0639-4bb6-a913-f2d37016b659','chef_constructeur','secondaire'),
 ('1dd42406-8439-44af-82ef-8ec66c9bcbda','chef_constructeur','secondaire'),
 ('1dec2ead-feaa-40f6-a7ee-c9be3417e01d','chef_constructeur','secondaire'),
 ('bdfcae4c-7a08-45f0-a28d-102177688d78','chef_constructeur','secondaire'),
 ('8fa27b2b-1106-4cb4-ab95-5236a9425524','chef_constructeur','secondaire'),
 ('2e535766-65c9-4660-afc4-9829ef63167b','chef_finition','principal'),
 ('7c9ca23e-7e3a-4d86-891d-b0eb227bf268','chef_finition','secondaire'),
 ('23844cc6-b506-4ce0-8872-072230aaa913','chef_finition','secondaire'),
 ('68f44ab5-c3a0-4514-9c7b-5ae0fd54290f','chef_finition','secondaire'),
 ('2298ac23-56ed-4362-ac63-c92787017fd1','chef_finition','secondaire')
) v(e, r, n)
ON CONFLICT (employe_id, role) DO NOTHING;

INSERT INTO public.role_referents(employe_id, role, niveau)
SELECT v.e::uuid, r.role, v.n::public.referent_niveau
FROM (VALUES
 ('821ec0a3-74f3-4936-a97d-49564e55d9dd','principal'),
 ('186ff868-8158-4620-81dd-45a7fb84935b','principal'),
 ('ddc4c734-4f05-434e-8fcf-4b63890e1129','principal'),
 ('1dec2ead-feaa-40f6-a7ee-c9be3417e01d','principal'),
 ('7b9de5c4-3f3d-4f3d-8608-a533dd0c543d','principal'),
 ('09758232-d71f-461b-bc3e-d3afdba3a6b0','secondaire'),
 ('68f44ab5-c3a0-4514-9c7b-5ae0fd54290f','secondaire'),
 ('23844cc6-b506-4ce0-8872-072230aaa913','secondaire'),
 ('2350b9ed-aba2-4de0-a989-2dfb8a16fd17','secondaire'),
 ('25ddd4ae-2248-4a17-bae3-37ed4ed4cde9','secondaire'),
 ('c77dfa4d-53df-4f9a-beee-5c0d61d18e58','secondaire'),
 ('d84b7bdf-9260-4022-bb45-ba1a8d2c57c2','secondaire'),
 ('313b328b-919b-4453-8eb3-74c720bda8d0','secondaire')
) v(e, n)
CROSS JOIN (VALUES ('chef_montage'::public.projet_role), ('chef_demontage'::public.projet_role)) r(role)
ON CONFLICT (employe_id, role) DO NOTHING;