
-- ============================================================
-- BUCKET STORAGE : contrats-intermittents (privé)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('contrats-intermittents', 'contrats-intermittents', false)
ON CONFLICT (id) DO NOTHING;

-- RLS sur storage.objects pour ce bucket
-- Lecture : admin OU employé concerné (via path qui contient l'employee_id)
-- Pattern de path : {employee_id}/{contrat_id}/v{1|2|3}.pdf  ou  {employee_id}/{contrat_id}/sig_{role}.png

DROP POLICY IF EXISTS "contrats_storage_select_admin_or_self" ON storage.objects;
CREATE POLICY "contrats_storage_select_admin_or_self"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'contrats-intermittents'
  AND (
    public.is_admin()
    OR (
      (storage.foldername(name))[1] IN (
        SELECT e.id::text FROM public.employes e WHERE e.profile_id = auth.uid()
      )
    )
  )
);

-- Upload : autorisé pour les utilisateurs authentifiés (admin ou employé concerné)
-- Le contenu sera contrôlé via les RPCs SECURITY DEFINER côté serveur
DROP POLICY IF EXISTS "contrats_storage_insert_admin_or_self" ON storage.objects;
CREATE POLICY "contrats_storage_insert_admin_or_self"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'contrats-intermittents'
  AND (
    public.is_admin()
    OR (
      (storage.foldername(name))[1] IN (
        SELECT e.id::text FROM public.employes e WHERE e.profile_id = auth.uid()
      )
    )
  )
);

DROP POLICY IF EXISTS "contrats_storage_update_admin" ON storage.objects;
CREATE POLICY "contrats_storage_update_admin"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'contrats-intermittents' AND public.is_admin())
WITH CHECK (bucket_id = 'contrats-intermittents' AND public.is_admin());

DROP POLICY IF EXISTS "contrats_storage_delete_admin" ON storage.objects;
CREATE POLICY "contrats_storage_delete_admin"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'contrats-intermittents' AND public.is_admin());

-- ============================================================
-- RPC : signer_contrat_employe
-- ============================================================
CREATE OR REPLACE FUNCTION public.signer_contrat_employe(
  p_contrat_id uuid,
  p_signature_image_url text,
  p_pdf_v2_url text,
  p_pdf_hash_sha256 text,
  p_client_ip text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_id uuid;
  v_employe_profile uuid;
  v_signature_id uuid;
  v_current_statut contrat_intermittent_statut;
BEGIN
  -- Vérifier que le contrat existe et appartient bien à l'utilisateur connecté
  SELECT ci.employee_id, e.profile_id, ci.statut
    INTO v_employee_id, v_employe_profile, v_current_statut
  FROM contrats_intermittents ci
  JOIN employes e ON e.id = ci.employee_id
  WHERE ci.id = p_contrat_id;

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'Contrat introuvable';
  END IF;

  IF v_employe_profile IS DISTINCT FROM auth.uid() AND NOT is_admin() THEN
    RAISE EXCEPTION 'Vous n''êtes pas autorisé à signer ce contrat';
  END IF;

  IF v_current_statut <> 'a_signer_employe' THEN
    RAISE EXCEPTION 'Contrat déjà signé par l''employé ou dans un statut non éligible (%)', v_current_statut;
  END IF;

  -- Insérer signature (audit trail)
  INSERT INTO contrats_signatures (
    contrat_id, signataire_id, role_signature,
    signature_image_url, pdf_hash_sha256, client_ip, user_agent
  ) VALUES (
    p_contrat_id, auth.uid(), 'employe',
    p_signature_image_url, p_pdf_hash_sha256, p_client_ip, p_user_agent
  ) RETURNING id INTO v_signature_id;

  -- Update contrat : transition vers a_signer_employeur
  UPDATE contrats_intermittents
  SET statut = 'a_signer_employeur',
      pdf_v2_url = p_pdf_v2_url,
      pdf_hash_sha256 = p_pdf_hash_sha256,
      updated_at = now()
  WHERE id = p_contrat_id;

  -- Notification admin(s)
  INSERT INTO notifications (user_id, type, titre, message, lien, metadata)
  SELECT ur.user_id,
         'system'::notification_type,
         'Contrat à contre-signer',
         'Un contrat intermittent attend votre signature employeur.',
         '/rh/contrats?id=' || p_contrat_id::text,
         jsonb_build_object('contrat_id', p_contrat_id)
  FROM user_roles ur
  WHERE ur.role = 'admin';

  RETURN v_signature_id;
END;
$$;

-- ============================================================
-- RPC : signer_contrat_employeur
-- ============================================================
CREATE OR REPLACE FUNCTION public.signer_contrat_employeur(
  p_contrat_id uuid,
  p_signature_image_url text,
  p_pdf_v3_url text,
  p_pdf_hash_sha256 text,
  p_client_ip text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_signature_id uuid;
  v_current_statut contrat_intermittent_statut;
  v_employee_id uuid;
  v_employe_profile uuid;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  SELECT ci.statut, ci.employee_id, e.profile_id
    INTO v_current_statut, v_employee_id, v_employe_profile
  FROM contrats_intermittents ci
  JOIN employes e ON e.id = ci.employee_id
  WHERE ci.id = p_contrat_id;

  IF v_current_statut IS NULL THEN
    RAISE EXCEPTION 'Contrat introuvable';
  END IF;

  IF v_current_statut <> 'a_signer_employeur' THEN
    RAISE EXCEPTION 'Contrat non éligible à la contre-signature (%)', v_current_statut;
  END IF;

  INSERT INTO contrats_signatures (
    contrat_id, signataire_id, role_signature,
    signature_image_url, pdf_hash_sha256, client_ip, user_agent
  ) VALUES (
    p_contrat_id, auth.uid(), 'employeur',
    p_signature_image_url, p_pdf_hash_sha256, p_client_ip, p_user_agent
  ) RETURNING id INTO v_signature_id;

  UPDATE contrats_intermittents
  SET statut = 'signe',
      pdf_v3_url = p_pdf_v3_url,
      pdf_hash_sha256 = p_pdf_hash_sha256,
      updated_at = now()
  WHERE id = p_contrat_id;

  -- Notif employé : contrat finalisé
  IF v_employe_profile IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, titre, message, lien, metadata)
    VALUES (
      v_employe_profile,
      'system'::notification_type,
      'Contrat signé',
      'Votre contrat intermittent est désormais signé par les deux parties.',
      '/mobile/contrats',
      jsonb_build_object('contrat_id', p_contrat_id)
    );
  END IF;

  RETURN v_signature_id;
END;
$$;

-- ============================================================
-- RPC : set_contrat_pdf_url (utilitaire pour stocker l'URL v1)
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_contrat_pdf_url(
  p_contrat_id uuid,
  p_version int,
  p_url text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_id uuid;
  v_employe_profile uuid;
BEGIN
  SELECT ci.employee_id, e.profile_id
    INTO v_employee_id, v_employe_profile
  FROM contrats_intermittents ci
  JOIN employes e ON e.id = ci.employee_id
  WHERE ci.id = p_contrat_id;

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'Contrat introuvable';
  END IF;

  IF NOT is_admin() AND v_employe_profile IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;

  IF p_version = 1 THEN
    UPDATE contrats_intermittents SET pdf_v1_url = p_url, updated_at = now() WHERE id = p_contrat_id;
  ELSIF p_version = 2 THEN
    UPDATE contrats_intermittents SET pdf_v2_url = p_url, updated_at = now() WHERE id = p_contrat_id;
  ELSIF p_version = 3 THEN
    UPDATE contrats_intermittents SET pdf_v3_url = p_url, updated_at = now() WHERE id = p_contrat_id;
  ELSE
    RAISE EXCEPTION 'Version invalide (1, 2 ou 3 attendu)';
  END IF;
END;
$$;

-- ============================================================
-- RPC : annuler_contrat (admin only)
-- ============================================================
CREATE OR REPLACE FUNCTION public.annuler_contrat_intermittent(
  p_contrat_id uuid,
  p_motif text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  UPDATE contrats_intermittents
  SET statut = 'annule', updated_at = now()
  WHERE id = p_contrat_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.signer_contrat_employe(uuid, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.signer_contrat_employeur(uuid, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_contrat_pdf_url(uuid, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.annuler_contrat_intermittent(uuid, text) TO authenticated;
