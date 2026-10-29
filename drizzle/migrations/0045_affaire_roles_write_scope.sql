CREATE OR REPLACE FUNCTION public.user_can_write_affaire(_affaire_id uuid, _cap text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.user_has_cap(_cap)
     AND EXISTS (
       SELECT 1
       FROM public.affaires a
       WHERE a.id = _affaire_id
         AND a.archived_at IS NULL
         AND (
               public.user_cap_scope(_cap) = 'all'
           OR (public.user_cap_scope(_cap) = 'own'
               AND a.charge_affaires_id = auth.uid())
           OR (public.user_cap_scope(_cap) IN ('team','affaire','assigned')
               AND public.user_has_affaire_access(_affaire_id))
         )
     );
$function$;

REVOKE ALL ON FUNCTION public.user_can_write_affaire(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_can_write_affaire(uuid, text) TO authenticated, service_role;

DROP POLICY IF EXISTS affaire_roles_write ON public.affaire_roles;
CREATE POLICY affaire_roles_write
  ON public.affaire_roles
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (public.user_can_write_affaire(affaire_id, 'affaires.edit'))
  WITH CHECK (public.user_can_write_affaire(affaire_id, 'affaires.edit'));