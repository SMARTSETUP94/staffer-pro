-- Bloc 10.1 — pgTAP : RLS opportunite_actions scope own/all
\i supabase/tests/_helpers.sql

BEGIN;
SELECT plan(3);

-- 2 users : CA1 (commercial, scope own), Admin (scope all)
INSERT INTO auth.users (id, email, instance_id, aud, role)
VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001', 'ca1@test.local',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'admin2@test.local','00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, email) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001', 'ca1@test.local'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'admin2@test.local')
ON CONFLICT (id) DO NOTHING;

SELECT test_helpers.set_role_for('bbbbbbbb-0000-0000-0000-000000000001', 'commercial'::app_role);
SELECT test_helpers.set_role_for('bbbbbbbb-0000-0000-0000-000000000002', 'admin'::app_role);

-- 2 opportunités : une à CA1, une à un autre CA (NULL)
INSERT INTO public.affaires (id, numero, nom, phase, code_opportunite, statut_opportunite, date_opportunite, charge_affaires_id)
VALUES
  ('bbbbbbbb-0000-0000-0000-00000000bbb1', '9801', 'Opp CA1',   'opportunite', '9801', 'qualifie', now(), 'bbbbbbbb-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-00000000bbb2', '9802', 'Opp other', 'opportunite', '9802', 'qualifie', now(), NULL);

-- Actions seedées en bypass RLS (avant de switcher de user)
INSERT INTO public.opportunite_actions (affaire_id, type, texte, auteur_id) VALUES
  ('bbbbbbbb-0000-0000-0000-00000000bbb1', 'note_interne', 'Note CA1',   'bbbbbbbb-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-00000000bbb2', 'note_interne', 'Note other', NULL);

-- Cas 1 : CA1 voit son action
SELECT test_helpers.login_as('bbbbbbbb-0000-0000-0000-000000000001');
SELECT ok(
  EXISTS (SELECT 1 FROM public.opportunite_actions WHERE affaire_id = 'bbbbbbbb-0000-0000-0000-00000000bbb1'),
  'CA1 (scope own) voit ses propres actions'
);

-- Cas 2 : CA1 ne voit pas l'action de l'autre
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.opportunite_actions WHERE affaire_id = 'bbbbbbbb-0000-0000-0000-00000000bbb2'),
  'CA1 ne voit pas les actions hors de son scope'
);

-- Cas 3 : Admin voit tout
SELECT test_helpers.login_as('bbbbbbbb-0000-0000-0000-000000000002');
SELECT is(
  (SELECT count(*)::int FROM public.opportunite_actions
    WHERE affaire_id IN ('bbbbbbbb-0000-0000-0000-00000000bbb1', 'bbbbbbbb-0000-0000-0000-00000000bbb2')),
  2,
  'Admin (scope all) voit toutes les actions'
);

SELECT * FROM finish();
ROLLBACK;
