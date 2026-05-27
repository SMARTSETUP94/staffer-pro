-- L4a-ter — pgTAP : source rh_contrats (cap inbox.rh_contrats)
-- Assertions :
--   1. cap-ON  (rh)     → item présent
--   2. cap-OFF (poseur) → item absent
--   3. statut signe     → exclu

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
\i supabase/tests/_helpers.sql

SELECT plan(3);

DO $$
DECLARE
  v_user uuid := gen_random_uuid();
  v_emp  uuid := gen_random_uuid();
  v_c    uuid := gen_random_uuid();
  v_metier int;
BEGIN
  SELECT id INTO v_metier FROM public.metiers ORDER BY id LIMIT 1;
  INSERT INTO public.employes (id, prenom, nom, metier_principal_id)
    VALUES (v_emp, 'Test', 'Intermittent', v_metier);
  INSERT INTO public.contrats_intermittents (id, employee_id, date_debut, date_fin, statut)
    VALUES (v_c, v_emp, CURRENT_DATE + 5, CURRENT_DATE + 12, 'a_signer_employe');

  PERFORM set_config('test.user_id', v_user::text, true);
  PERFORM set_config('test.c_id',    v_c::text,    true);
  PERFORM test_helpers.login_as(v_user);
END $$;

SELECT test_helpers.set_role_for(current_setting('test.user_id')::uuid, 'rh'::app_role);
SELECT ok(
  EXISTS (SELECT 1 FROM public.get_inbox_items()
          WHERE source = 'rh_contrats' AND source_id = current_setting('test.c_id')::uuid),
  'cap-ON (rh) : rh_contrats visible'
);

SELECT test_helpers.set_role_for(current_setting('test.user_id')::uuid, 'poseur'::app_role);
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.get_inbox_items()
              WHERE source = 'rh_contrats' AND source_id = current_setting('test.c_id')::uuid),
  'cap-OFF (poseur) : rh_contrats masqué'
);

SELECT test_helpers.set_role_for(current_setting('test.user_id')::uuid, 'rh'::app_role);
UPDATE public.contrats_intermittents SET statut = 'signe' WHERE id = current_setting('test.c_id')::uuid;
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.get_inbox_items()
              WHERE source = 'rh_contrats' AND source_id = current_setting('test.c_id')::uuid),
  'statut signe : rh_contrats exclu'
);

SELECT * FROM finish();
ROLLBACK;
