-- Bloc 10.1 — pgTAP : sign_opportunite (génération 5XXX + double signature)
\i supabase/tests/_helpers.sql

BEGIN;
SELECT plan(3);

-- Setup admin user + cap action.sign_opportunite via rôle admin
INSERT INTO auth.users (id, email, instance_id, aud, role)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'admin10@test.local',
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;

SELECT test_helpers.set_role_for('aaaaaaaa-0000-0000-0000-000000000001', 'admin'::app_role);
SELECT test_helpers.login_as('aaaaaaaa-0000-0000-0000-000000000001');

-- 2 opportunités test
INSERT INTO public.affaires (id, numero, nom, phase, code_opportunite, statut_opportunite, date_opportunite)
VALUES
  ('aaaaaaaa-0000-0000-0000-00000000aaa1', '9901', 'Test sign 1', 'opportunite', '9901', 'qualifie', now()),
  ('aaaaaaaa-0000-0000-0000-00000000aaa2', '9902', 'Test sign 2', 'opportunite', '9902', 'qualifie', now());

-- Cas 1 : signature génère un numéro 5XXX valide
SELECT ok(
  (SELECT nouveau_numero FROM public.sign_opportunite('aaaaaaaa-0000-0000-0000-00000000aaa1') LIMIT 1) ~ '^5[0-9]{3}$',
  'Signature génère un numéro 5XXX valide'
);

-- Cas 2 : 2 signatures séquentielles donnent 2 numéros distincts
SELECT isnt(
  (SELECT nouveau_numero FROM public.sign_opportunite('aaaaaaaa-0000-0000-0000-00000000aaa2') LIMIT 1),
  (SELECT numero FROM public.affaires WHERE id = 'aaaaaaaa-0000-0000-0000-00000000aaa1'),
  'Deux signatures séquentielles produisent deux numéros distincts'
);

-- Cas 3 : re-signer une opp déjà signée throw
SELECT throws_ok(
  $$ SELECT public.sign_opportunite('aaaaaaaa-0000-0000-0000-00000000aaa1'::uuid) $$,
  'P0001',
  'opportunite not found or already signed: aaaaaaaa-0000-0000-0000-00000000aaa1',
  'Signature double throw une erreur'
);

SELECT * FROM finish();
ROLLBACK;
