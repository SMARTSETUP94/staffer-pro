-- L4a-ter — pgTAP : source validation_heures (cap inbox.validation_heures)
-- Assertions :
--   1. cap-ON  (chef_chantier) → item présent
--   2. cap-OFF (poseur)        → item absent
--   3. statut brouillon        → exclu (seulement 'soumis' visible)

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
    VALUES (v_aff, '4998-TEST', 'Test val_heures', 'en_cours');
  INSERT INTO public.employes (id, prenom, nom, metier_principal_id)
    VALUES (v_emp, 'Test', 'Employe', v_metier);
  INSERT INTO public.heures_saisies (id, affaire_id, employe_id, date, statut, heures_reelles)
    VALUES (v_h, v_aff, v_emp, CURRENT_DATE - 1, 'soumis', 8);

  PERFORM set_config('test.user_id', v_user::text, true);
  PERFORM set_config('test.h_id',    v_h::text,    true);
  PERFORM test_helpers.login_as(v_user);
END $$;

-- 1. cap-ON
SELECT test_helpers.set_role_for(current_setting('test.user_id')::uuid, 'chef_chantier'::app_role);
SELECT ok(
  EXISTS (SELECT 1 FROM public.get_inbox_items()
          WHERE source = 'validation_heures' AND source_id = current_setting('test.h_id')::uuid),
  'cap-ON (chef_chantier) : validation_heures visible'
);

-- 2. cap-OFF
SELECT test_helpers.set_role_for(current_setting('test.user_id')::uuid, 'poseur'::app_role);
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.get_inbox_items()
              WHERE source = 'validation_heures' AND source_id = current_setting('test.h_id')::uuid),
  'cap-OFF (poseur) : validation_heures masquée'
);

-- 3. statut brouillon → exclu
SELECT test_helpers.set_role_for(current_setting('test.user_id')::uuid, 'chef_chantier'::app_role);
UPDATE public.heures_saisies SET statut = 'brouillon' WHERE id = current_setting('test.h_id')::uuid;
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.get_inbox_items()
              WHERE source = 'validation_heures' AND source_id = current_setting('test.h_id')::uuid),
  'statut brouillon : validation_heures exclue'
);

SELECT * FROM finish();
ROLLBACK;
