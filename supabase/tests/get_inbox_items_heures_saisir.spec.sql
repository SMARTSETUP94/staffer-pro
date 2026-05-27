-- L4a-ter — pgTAP : source heures_saisir (cap inbox.heures_saisir)
-- Assertions :
--   1. cap-ON  (employe)            → item présent
--   2. cap-OFF (chef_metier_scoped) → item absent (rôle qui n'a PAS la cap)
--   3. statut != brouillon          → exclu

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
\i supabase/tests/_helpers.sql

SELECT plan(3);

DO $$
DECLARE
  v_user uuid := gen_random_uuid();
  v_aff  uuid := gen_random_uuid();
  v_emp  uuid := gen_random_uuid();
  v_h    uuid := gen_random_uuid();
  v_metier int;
BEGIN
  SELECT id INTO v_metier FROM public.metiers ORDER BY id LIMIT 1;
  INSERT INTO public.affaires (id, numero, nom, statut)
    VALUES (v_aff, '5997-TEST', 'Test heures_saisir', 'en_cours');
  INSERT INTO public.employes (id, prenom, nom, metier_principal_id)
    VALUES (v_emp, 'Test', 'Emp', v_metier);
  INSERT INTO public.heures_saisies (id, affaire_id, employe_id, date, statut, heures_reelles)
    VALUES (v_h, v_aff, v_emp, CURRENT_DATE - 1, 'brouillon', 4);

  PERFORM set_config('test.user_id', v_user::text, true);
  PERFORM set_config('test.h_id',    v_h::text,    true);
  PERFORM test_helpers.login_as(v_user);
END $$;

SELECT test_helpers.set_role_for(current_setting('test.user_id')::uuid, 'employe'::app_role);
SELECT ok(
  EXISTS (SELECT 1 FROM public.get_inbox_items()
          WHERE source = 'heures_saisir' AND source_id = current_setting('test.h_id')::uuid),
  'cap-ON (employe) : heures_saisir visible'
);

SELECT test_helpers.set_role_for(current_setting('test.user_id')::uuid, 'chef_metier_scoped'::app_role);
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.get_inbox_items()
              WHERE source = 'heures_saisir' AND source_id = current_setting('test.h_id')::uuid),
  'cap-OFF (chef_metier_scoped) : heures_saisir masquée'
);

SELECT test_helpers.set_role_for(current_setting('test.user_id')::uuid, 'employe'::app_role);
UPDATE public.heures_saisies SET statut = 'soumis' WHERE id = current_setting('test.h_id')::uuid;
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.get_inbox_items()
              WHERE source = 'heures_saisir' AND source_id = current_setting('test.h_id')::uuid),
  'statut soumis : heures_saisir exclue'
);

SELECT * FROM finish();
ROLLBACK;
