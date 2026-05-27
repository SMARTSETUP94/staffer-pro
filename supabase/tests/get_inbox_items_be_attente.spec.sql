-- L4a-ter — pgTAP : source be_attente (cap inbox.be_attente)
-- Assertions :
--   1. cap-ON  (bureau_etude) → item présent
--   2. cap-OFF (poseur)       → item absent
--   3. respo_fab_id renseigné → item exclu (BE plus en attente)

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
\i supabase/tests/_helpers.sql

SELECT plan(3);

DO $$
DECLARE
  v_user uuid := gen_random_uuid();
  v_aff  uuid := gen_random_uuid();
  v_obj  uuid := gen_random_uuid();
  v_emp  uuid := gen_random_uuid();
  v_metier int;
BEGIN
  SELECT id INTO v_metier FROM public.metiers ORDER BY id LIMIT 1;
  INSERT INTO public.affaires (id, numero, nom, statut, date_debut)
    VALUES (v_aff, '5999-TEST', 'Test be_attente', 'en_cours', CURRENT_DATE + 5);
  INSERT INTO public.employes (id, prenom, nom, metier_principal_id)
    VALUES (v_emp, 'Test', 'BE', v_metier);
  INSERT INTO public.fabrication_objets (id, affaire_id, reference, nom, respo_fab_id)
    VALUES (v_obj, v_aff, 'REF-T1', 'Objet test', NULL);

  PERFORM set_config('test.user_id', v_user::text, true);
  PERFORM set_config('test.obj_id',  v_obj::text,  true);
  PERFORM set_config('test.emp_id',  v_emp::text,  true);
  PERFORM test_helpers.login_as(v_user);
END $$;

-- 1. cap-ON
SELECT test_helpers.set_role_for(current_setting('test.user_id')::uuid, 'bureau_etude'::app_role);
SELECT ok(
  EXISTS (SELECT 1 FROM public.get_inbox_items()
          WHERE source = 'be_attente' AND source_id = current_setting('test.obj_id')::uuid),
  'cap-ON (bureau_etude) : be_attente visible'
);

-- 2. cap-OFF
SELECT test_helpers.set_role_for(current_setting('test.user_id')::uuid, 'poseur'::app_role);
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.get_inbox_items()
              WHERE source = 'be_attente' AND source_id = current_setting('test.obj_id')::uuid),
  'cap-OFF (poseur) : be_attente masquée'
);

-- 3. respo_fab_id assigné → exclu
SELECT test_helpers.set_role_for(current_setting('test.user_id')::uuid, 'bureau_etude'::app_role);
UPDATE public.fabrication_objets
   SET respo_fab_id = current_setting('test.emp_id')::uuid
 WHERE id = current_setting('test.obj_id')::uuid;
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.get_inbox_items()
              WHERE source = 'be_attente' AND source_id = current_setting('test.obj_id')::uuid),
  'respo_fab_id renseigné : be_attente exclu'
);

SELECT * FROM finish();
ROLLBACK;
