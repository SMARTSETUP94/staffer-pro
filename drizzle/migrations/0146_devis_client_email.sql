CREATE OR REPLACE FUNCTION public.devis_client_email(_devis_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT c.email FROM devis d JOIN clients c ON c.id=d.client_id
  WHERE d.id=_devis_id AND devis_peut_lire(_devis_id)
    AND (devis_peut_ecrire(_devis_id) OR user_has_cap('clients.view')) $$;
REVOKE ALL ON FUNCTION public.devis_client_email(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devis_client_email(uuid) TO authenticated;