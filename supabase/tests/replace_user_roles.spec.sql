-- L3a — Test pgTAP : replace_user_roles préserve chef_metier_scoped legacy
--
-- Exécution :
--   psql -f supabase/tests/replace_user_roles.spec.sql
-- ou via pg_prove :
--   pg_prove -d "$DATABASE_URL" supabase/tests/replace_user_roles.spec.sql
--
-- Tout l'ensemble s'exécute dans une transaction ROLLBACK → aucune donnée persistée.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(5);

DO $$
DECLARE
  v_user uuid := gen_random_uuid();
BEGIN
  -- Fixture : user fictif avec rôle legacy chef_metier_scoped + employe
  INSERT INTO public.user_roles (user_id, role)
  VALUES
    (v_user, 'chef_metier_scoped'::app_role),
    (v_user, 'employe'::app_role);

  -- Stocker l'uuid pour les assertions suivantes
  PERFORM set_config('test.user_id', v_user::text, true);
END $$;

-- 1. Setup : 2 rôles présents avant l'appel
SELECT is(
  (SELECT count(*)::int FROM public.user_roles WHERE user_id = current_setting('test.user_id')::uuid),
  2,
  'Setup : 2 rôles présents (chef_metier_scoped + employe)'
);

-- 2. Appel replace_user_roles avec ['atelier_chef'] uniquement
SELECT lives_ok(
  $$ SELECT public.replace_user_roles(
       current_setting('test.user_id')::uuid,
       ARRAY['atelier_chef']::app_role[]
     ) $$,
  'replace_user_roles s''exécute sans erreur'
);

-- 3. chef_metier_scoped TOUJOURS présent (préservé pour rollback L5)
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = current_setting('test.user_id')::uuid
      AND role = 'chef_metier_scoped'::app_role
  ),
  'chef_metier_scoped legacy préservé après replace_user_roles'
);

-- 4. Nouveau rôle atelier_chef bien inséré
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = current_setting('test.user_id')::uuid
      AND role = 'atelier_chef'::app_role
  ),
  'Nouveau rôle atelier_chef inséré'
);

-- 5. Ancien rôle employe supprimé (pas dans la nouvelle liste)
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = current_setting('test.user_id')::uuid
      AND role = 'employe'::app_role
  ),
  'Ancien rôle employe (non listé) bien supprimé'
);

SELECT * FROM finish();

ROLLBACK;
