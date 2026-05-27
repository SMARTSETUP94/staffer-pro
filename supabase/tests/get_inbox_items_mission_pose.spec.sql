-- L4a-ter — pgTAP : source mission_pose (cap inbox.mission_pose)
-- Assertions :
--   1. cap-ON  (poseur)  → l'item apparaît
--   2. cap-OFF (employe) → l'item disparaît
--   3. statut refusée    → l'item disparaît même avec cap

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
\i supabase/tests/_helpers.sql

SELECT plan(3);

DO $$
DECLARE
  v_user uuid := gen_random_uuid();
  v_aff  uuid := gen_random_uuid();
  v_emp  uuid := gen_random_uuid();
  v_ass  uuid := gen_random_uuid();
  v_metier int;
BEGIN
  SELECT id INTO v_metier FROM public.metiers ORDER BY id LIMIT 1;

  INSERT INTO public.affaires (id, numero, nom, statut)
    VALUES (v_aff, '4999-TEST', 'Test mission_pose', 'en_cours');
  INSERT INTO public.employes (id, prenom, nom, metier_principal_id)
    VALUES (v_emp, 'Test', 'Poseur', v_metier);
  INSERT INTO public.assignations (id, affaire_id, employe_id, date, demi_journee, phase, statut_confirmation)
    VALUES (v_ass, v_aff, v_emp, CURRENT_DATE + 2, 'AM', 'montage', 'confirmee');

  PERFORM set_config('test.user_id', v_user::text, true);
  PERFORM set_config('test.ass_id',  v_ass::text,  true);
  PERFORM test_helpers.login_as(v_user);
END $$;

-- 1. cap-ON : poseur a inbox.mission_pose → item présent
SELECT test_helpers.set_role_for(current_setting('test.user_id')::uuid, 'poseur'::app_role);
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.get_inbox_items()
    WHERE source = 'mission_pose'
      AND source_id = current_setting('test.ass_id')::uuid
  ),
  'cap-ON (poseur) : mission_pose visible'
);

-- 2. cap-OFF : employe n'a PAS inbox.mission_pose → item absent
SELECT test_helpers.set_role_for(current_setting('test.user_id')::uuid, 'employe'::app_role);
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM public.get_inbox_items()
    WHERE source = 'mission_pose'
      AND source_id = current_setting('test.ass_id')::uuid
  ),
  'cap-OFF (employe) : mission_pose masquée'
);

-- 3. statut-different : on remet la cap mais on passe l'assignation en refusee
SELECT test_helpers.set_role_for(current_setting('test.user_id')::uuid, 'poseur'::app_role);
UPDATE public.assignations
   SET statut_confirmation = 'refusee'
 WHERE id = current_setting('test.ass_id')::uuid;
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM public.get_inbox_items()
    WHERE source = 'mission_pose'
      AND source_id = current_setting('test.ass_id')::uuid
  ),
  'statut refusee : mission_pose exclue malgré cap'
);

SELECT * FROM finish();
ROLLBACK;
