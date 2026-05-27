-- L4a-ter — Helpers communs aux specs pgTAP get_inbox_items_<source>.spec.sql
--
-- Usage dans une spec :
--   \i supabase/tests/_helpers.sql
--   SELECT test_helpers.login_as('00000000-0000-0000-0000-000000000001');
--   SELECT test_helpers.set_role_for('uuid', 'admin'::app_role);
--
-- Pattern Supabase RLS testing : on remplit request.jwt.claims via SET LOCAL
-- pour que auth.uid() retourne l'uuid voulu pendant la transaction de test.

CREATE SCHEMA IF NOT EXISTS test_helpers;

CREATE OR REPLACE FUNCTION test_helpers.login_as(_uid uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', _uid::text, 'role', 'authenticated')::text,
    true
  );
  PERFORM set_config('request.jwt.claim.sub', _uid::text, true);
  PERFORM set_config('role', 'authenticated', true);
END;
$$;

-- Remplace l'ensemble des rôles d'un user par une liste donnée (utilise la
-- fonction de prod replace_user_roles si dispo, sinon fallback direct).
CREATE OR REPLACE FUNCTION test_helpers.set_role_for(_uid uuid, _role app_role)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM public.user_roles WHERE user_id = _uid;
  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, _role);
END;
$$;
