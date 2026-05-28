-- Bloc 10.2 — pgTAP spec : get_inbox_items source opp_action
-- 3 assertions : cap-on / cap-off / scope own filter
BEGIN;
\i supabase/tests/_helpers.sql

SELECT plan(3);

-- Setup
DO $$
DECLARE
  v_admin uuid := '11111111-1111-1111-1111-111111111111';
  v_ca    uuid := '22222222-2222-2222-2222-222222222222';
  v_other uuid := '33333333-3333-3333-3333-333333333333';
  v_aff   uuid;
BEGIN
  -- Seed minimal auth users + roles
  INSERT INTO auth.users(id, email) VALUES
    (v_admin, 'admin-opp@test'),(v_ca,'ca-opp@test'),(v_other,'other-opp@test')
    ON CONFLICT (id) DO NOTHING;
  PERFORM test_helpers.set_role_for(v_admin, 'admin'::app_role);
  PERFORM test_helpers.set_role_for(v_ca,    'commercial'::app_role);
  PERFORM test_helpers.set_role_for(v_other, 'commercial'::app_role);

  -- Affaire opp due demain, owned by v_ca
  INSERT INTO public.affaires(numero, nom, phase, statut_opportunite, charge_affaires_id, code_opportunite)
    VALUES ('9TEST', 'test opp 10.2', 'opportunite', 'envoye', v_ca, '9TEST')
    RETURNING id INTO v_aff;
  INSERT INTO public.opportunite_actions(affaire_id, type, date, auteur_id, texte, prochaine_action_due_le)
    VALUES (v_aff, 'note', now(), v_ca, 'relance', CURRENT_DATE + 1);
END $$;

-- 1) admin (cap on + read.all) voit opp_action
SELECT test_helpers.login_as('11111111-1111-1111-1111-111111111111');
SELECT ok(
  EXISTS (SELECT 1 FROM public.get_inbox_items(200) WHERE source='opp_action' AND affaire_numero='9TEST'),
  'admin avec cap inbox.opp_action voit l''item opp_action'
);

-- 2) other CA (cap on mais scope own) ne voit pas l'opp de v_ca
SELECT test_helpers.login_as('33333333-3333-3333-3333-333333333333');
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.get_inbox_items(200) WHERE source='opp_action' AND affaire_numero='9TEST'),
  'autre commercial sans cap read.all ne voit pas l''opp d''un autre CA'
);

-- 3) v_ca (owner) voit son opp
SELECT test_helpers.login_as('22222222-2222-2222-2222-222222222222');
SELECT ok(
  EXISTS (SELECT 1 FROM public.get_inbox_items(200) WHERE source='opp_action' AND affaire_numero='9TEST'),
  'CA propriétaire voit son opp_action'
);

SELECT * FROM finish();
ROLLBACK;
