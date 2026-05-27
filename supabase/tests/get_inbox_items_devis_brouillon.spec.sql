-- L4a-ter — pgTAP : source devis_brouillon (cap inbox.devis_brouillon)
-- Assertions :
--   1. cap-ON  (commercial) → item présent
--   2. cap-OFF (poseur)     → item absent
--   3. statut != brouillon  → exclu

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
\i supabase/tests/_helpers.sql

SELECT plan(3);

DO $$
DECLARE
  v_user uuid := gen_random_uuid();
  v_aff  uuid := gen_random_uuid();
  v_dev  uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.affaires (id, numero, nom, statut)
    VALUES (v_aff, '5998-TEST', 'Test devis_brouillon', 'en_cours');
  INSERT INTO public.devis (id, affaire_id, numero, statut, archive)
    VALUES (v_dev, v_aff, 'D-TEST-1', 'brouillon', false);

  PERFORM set_config('test.user_id', v_user::text, true);
  PERFORM set_config('test.dev_id',  v_dev::text,  true);
  PERFORM test_helpers.login_as(v_user);
END $$;

SELECT test_helpers.set_role_for(current_setting('test.user_id')::uuid, 'commercial'::app_role);
SELECT ok(
  EXISTS (SELECT 1 FROM public.get_inbox_items()
          WHERE source = 'devis_brouillon' AND source_id = current_setting('test.dev_id')::uuid),
  'cap-ON (commercial) : devis_brouillon visible'
);

SELECT test_helpers.set_role_for(current_setting('test.user_id')::uuid, 'poseur'::app_role);
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.get_inbox_items()
              WHERE source = 'devis_brouillon' AND source_id = current_setting('test.dev_id')::uuid),
  'cap-OFF (poseur) : devis_brouillon masqué'
);

SELECT test_helpers.set_role_for(current_setting('test.user_id')::uuid, 'commercial'::app_role);
UPDATE public.devis SET statut = 'envoye' WHERE id = current_setting('test.dev_id')::uuid;
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.get_inbox_items()
              WHERE source = 'devis_brouillon' AND source_id = current_setting('test.dev_id')::uuid),
  'statut envoye : devis_brouillon exclu'
);

SELECT * FROM finish();
ROLLBACK;
