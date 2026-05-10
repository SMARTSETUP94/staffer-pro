-- 1. affaire_documents : masquer les soft-deleted dans SELECT
DROP POLICY IF EXISTS affaire_documents_select ON public.affaire_documents;
CREATE POLICY affaire_documents_select
  ON public.affaire_documents
  FOR SELECT
  TO authenticated
  USING (
    (deleted_at IS NULL OR public.is_admin())
    AND (
      public.is_admin()
      OR public.user_has_affaire_access(affaire_id)
      OR public.user_is_mentioned_on_affaire(affaire_id)
    )
  );

-- 2. contrats_signatures : forcer signed_at = now() côté serveur (anti-manipulation client)
CREATE OR REPLACE FUNCTION public.enforce_signed_at_server_side()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.signed_at := now();
  NEW.created_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_signed_at_server ON public.contrats_signatures;
CREATE TRIGGER trg_enforce_signed_at_server
  BEFORE INSERT ON public.contrats_signatures
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_signed_at_server_side();

COMMENT ON FUNCTION public.enforce_signed_at_server_side() IS
  'v0.44.5 — Force signed_at et created_at côté serveur pour empêcher la manipulation par client malveillant. signed_at devient immuable et auditeur de confiance.';