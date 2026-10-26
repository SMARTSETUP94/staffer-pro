-- Ferme les RPC historiques SECURITY DEFINER aux jetons OAuth MCP hors exécution confirmée.
-- Chaque définition ci-dessous est reprise telle quelle de la base actuelle, seule la ligne de garde est ajoutée.
CREATE TABLE IF NOT EXISTS public.mcp_write_dispatch_context(
  txid bigint PRIMARY KEY,
  tool text NOT NULL,
  user_id uuid NOT NULL,
  client_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.mcp_write_dispatch_context FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.mcp_write_dispatch_context TO service_role;
ALTER TABLE public.mcp_write_dispatch_context ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.mcp_assert_legacy_oauth_write(_fn text)
 RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.jwt()->>'client_id' IS NULL THEN RETURN; END IF;
  IF EXISTS(SELECT 1 FROM public.mcp_write_dispatch_context
            WHERE txid=txid_current() AND user_id=auth.uid() AND client_id=auth.jwt()->>'client_id') THEN RETURN; END IF;
  RAISE EXCEPTION 'Écriture OAuth uniquement via confirmation MCP (%)', _fn USING ERRCODE='42501';
END $function$;
REVOKE ALL ON FUNCTION public.mcp_assert_legacy_oauth_write(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mcp_assert_legacy_oauth_write(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.archive_affaire(_affaire_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.mcp_assert_legacy_oauth_write('archive_affaire');
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission denied: archive_affaire requires admin';
  END IF;
  UPDATE public.affaires
     SET archived_at = now()
   WHERE id = _affaire_id
     AND archived_at IS NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_opportunite(_client text, _nom text, _code text, _charge_affaires_id uuid, _taille opportunite_taille, _date_opportunite date, _commentaires text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _id uuid; _allocated_code text;
BEGIN
  PERFORM public.mcp_assert_legacy_oauth_write('create_opportunite');
  IF NOT public.is_chef_or_admin() THEN
    RAISE EXCEPTION 'Action réservée aux chefs et admins.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _code IS NULL OR _code !~ '^9[0-9]{3}$' THEN
    RAISE EXCEPTION 'Code opportunité invalide (attendu 9XXX). Reçu: %', _code USING ERRCODE = 'check_violation';
  END IF;
  LOCK TABLE public.affaires IN SHARE ROW EXCLUSIVE MODE;
  _allocated_code := public.next_affaire_numero(9);
  INSERT INTO public.affaires (numero, nom, client, phase, statut_opportunite, charge_affaires_id, taille, date_opportunite, notes, statut)
  VALUES (_allocated_code, COALESCE(NULLIF(trim(_nom), ''), _client), _client, 'opportunite', 'a_faire', _charge_affaires_id, _taille, COALESCE(_date_opportunite, CURRENT_DATE), _commentaires, 'prospect')
  RETURNING id INTO _id;
  RETURN _id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sign_opportunite(_affaire_id uuid, _new_code text, _chef_projet_id uuid, _dessinateur_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  PERFORM public.mcp_assert_legacy_oauth_write('sign_opportunite');
  IF NOT public.user_has_cap('action.sign_opportunite') THEN
    RAISE EXCEPTION 'Action réservée : capability action.sign_opportunite requise.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _dessinateur_id IS NOT NULL AND _new_code !~ '^6[0-9]{3}$' THEN
    RAISE EXCEPTION 'Le dessinateur est réservé aux chantiers Fabrication 6XXX.' USING ERRCODE = 'check_violation';
  END IF;
  v_id := public.sign_opportunite(_affaire_id, _new_code);
  UPDATE public.affaires SET chef_projet_id = _chef_projet_id, dessinateur_id = _dessinateur_id WHERE id = v_id;
  RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sign_opportunite(_affaire_id uuid, _new_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _old_code text;
  _phase public.affaire_phase;
  _statut public.opportunite_statut;
  _exists boolean;
BEGIN
  PERFORM public.mcp_assert_legacy_oauth_write('sign_opportunite');
  IF NOT public.user_has_cap('action.sign_opportunite') THEN
    RAISE EXCEPTION 'Action réservée : capability action.sign_opportunite requise.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Regex aligné sur le front : fabrication → 6XXX (5XXX épuisés), 4XXX montage/démontage,
  -- 1XXX/3XXX non opérationnel, 2XXXX stockage. 9XXX (prototype) refusé : reste opportunité.
  IF _new_code !~ '^([1-6][0-9]{3}|2[0-9]{4})$' THEN
    RAISE EXCEPTION 'Code affaire invalide. Attendu : 1XXX, 2XXXX, 3XXX, 4XXX, 5XXX ou 6XXX. Reçu : %', _new_code
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT numero, phase, statut_opportunite
    INTO _old_code, _phase, _statut
    FROM public.affaires
   WHERE id = _affaire_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Opportunité introuvable.' USING ERRCODE = 'no_data_found';
  END IF;

  IF _phase <> 'opportunite' THEN
    RAISE EXCEPTION 'Cette affaire n''est pas une opportunité (phase=%).', _phase
      USING ERRCODE = 'check_violation';
  END IF;

  IF _statut <> 'gagne' THEN
    RAISE EXCEPTION 'Seules les opportunités gagnées peuvent être signées.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Anti-collision : un autre affaire ne doit pas déjà porter ce numéro.
  SELECT EXISTS (
    SELECT 1 FROM public.affaires
    WHERE numero = _new_code AND id <> _affaire_id
  ) INTO _exists;
  IF _exists THEN
    RAISE EXCEPTION 'Le code % est déjà utilisé par une autre affaire.', _new_code
      USING ERRCODE = 'unique_violation';
  END IF;

  UPDATE public.affaires
     SET numero = _new_code,
         code_opportunite = _old_code,
         phase = 'signe',
         statut_opportunite = NULL,
         statut = 'en_cours',
         signed_at = now(),
         updated_at = now()
   WHERE id = _affaire_id;

  RETURN _affaire_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sign_opportunite(_affaire_id uuid)
 RETURNS TABLE(affaire_id uuid, ancien_numero text, nouveau_numero text, signed_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_numero text;
  v_new_numero_int integer;
  v_new_numero text;
  v_signed_at timestamptz := now();
BEGIN
  PERFORM public.mcp_assert_legacy_oauth_write('sign_opportunite');
  IF NOT public.user_has_cap('action.sign_opportunite') THEN
    RAISE EXCEPTION 'forbidden: action.sign_opportunite required';
  END IF;

  PERFORM 1 FROM public.affaires
  WHERE id = _affaire_id AND phase = 'opportunite'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'opportunite not found or already signed: %', _affaire_id;
  END IF;

  SELECT numero INTO v_current_numero
  FROM public.affaires WHERE id = _affaire_id;

  PERFORM pg_advisory_xact_lock(hashtext('sign_opportunite_6xxx'));

  SELECT COALESCE(MAX(numero::int), 5999) + 1
    INTO v_new_numero_int
  FROM public.affaires
  WHERE numero ~ '^6[0-9]{3}$';

  IF v_new_numero_int > 6999 THEN
    RAISE EXCEPTION 'numero 6XXX overflow — max 6999 atteint';
  END IF;

  v_new_numero := v_new_numero_int::text;

  UPDATE public.affaires
  SET phase = 'signe',
      numero = v_new_numero,
      signed_at = v_signed_at,
      statut_opportunite = NULL
  WHERE id = _affaire_id;

  UPDATE public.opportunite_jalons
  SET date_atteinte = v_signed_at::date
  WHERE opportunite_jalons.affaire_id = _affaire_id AND etape = 'signature';

  INSERT INTO public.opportunite_actions (affaire_id, type, date, auteur_id, texte)
  VALUES (
    _affaire_id, 'autre', v_signed_at, auth.uid(),
    'Opportunité signée — code ' || v_current_numero || ' → ' || v_new_numero
  );

  RETURN QUERY SELECT _affaire_id, v_current_numero, v_new_numero, v_signed_at;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.mcp_execute_write_locked(_confirmation_id uuid, _tool text, _arguments_hash text, _payload jsonb, _diff jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE c public.mcp_write_confirmations; cap text; output jsonb; kh text; a public.affaires; current_snapshot text; existing public.mcp_write_external_keys;
BEGIN BEGIN
cap:=mcp_assert_write(_tool);
IF user_cap_scope(cap) IS DISTINCT FROM 'all' THEN RAISE EXCEPTION 'Périmètre global requis pour les écritures MCP'; END IF;
SELECT * INTO c FROM mcp_write_confirmations WHERE id=_confirmation_id AND user_id=auth.uid() AND client_id=auth.jwt()->>'client_id' FOR UPDATE;
IF NOT FOUND OR c.tool<>_tool OR c.arguments_hash<>_arguments_hash OR c.payload_hash<>encode(extensions.digest(_payload::text,'sha256'),'hex') THEN RAISE EXCEPTION 'Confirmation invalide ou arguments modifiés'; END IF;
IF _tool='creer_opportunite' THEN IF c.affaire_id IS NOT NULL OR c.etape_id IS NOT NULL THEN RAISE EXCEPTION 'Cible création incohérente'; END IF;
ELSE
IF c.affaire_id IS NULL OR c.snapshot IS NULL THEN RAISE EXCEPTION 'Cible et état initial obligatoires'; END IF;
SELECT * INTO a FROM affaires WHERE id=c.affaire_id AND archived_at IS NULL FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Accès affaire refusé'; END IF;
IF _tool='creer_etape_logistique' AND (_payload->>'affaire_id')::uuid IS DISTINCT FROM c.affaire_id THEN RAISE EXCEPTION 'Chantier de création incohérent'; END IF;
IF _tool IN ('modifier_etape_logistique','deplacer_etape_logistique','annuler_etape_logistique') THEN
IF c.etape_id IS NULL THEN RAISE EXCEPTION 'Étape obligatoire'; END IF;
SELECT updated_at::text INTO current_snapshot FROM affaire_etapes_logistiques WHERE id=c.etape_id AND affaire_id=c.affaire_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Étape et chantier incohérents'; END IF;
ELSE IF c.etape_id IS NOT NULL THEN RAISE EXCEPTION 'Étape inattendue'; END IF; current_snapshot:=a.updated_at::text; END IF;
END IF;
IF c.executed_at IS NOT NULL THEN RETURN c.result || jsonb_build_object('idempotent',true); END IF;
IF c.expires_at<=now() THEN RAISE EXCEPTION 'Confirmation expirée'; END IF;
IF c.snapshot IS NOT NULL AND c.snapshot::timestamptz IS DISTINCT FROM current_snapshot::timestamptz THEN RAISE EXCEPTION 'Données changées: demander un nouvel aperçu'; END IF;
IF _payload->>'cle_externe' IS NOT NULL THEN
kh:=encode(extensions.digest(auth.uid()::text||':'||(auth.jwt()->>'client_id')||':'||(_payload->>'cle_externe'),'sha256'),'hex');
PERFORM pg_advisory_xact_lock(hashtextextended(_tool||kh,0));
SELECT * INTO existing FROM mcp_write_external_keys WHERE tool=_tool AND key_hash=kh;
IF FOUND THEN IF existing.request_hash IS DISTINCT FROM _arguments_hash OR (_tool<>'creer_opportunite' AND existing.affaire_id IS DISTINCT FROM c.affaire_id) THEN RAISE EXCEPTION 'Clé externe déjà utilisée avec un contenu différent'; END IF; output:=existing.result||jsonb_build_object('doublon_cle_externe',true); END IF;
END IF;
IF output IS NULL THEN
  INSERT INTO public.mcp_write_dispatch_context(txid,tool,user_id,client_id) VALUES(txid_current(),_tool,auth.uid(),auth.jwt()->>'client_id');
  output:=mcp_dispatch_write(_tool,_payload,c.affaire_id,c.etape_id);
  DELETE FROM public.mcp_write_dispatch_context WHERE txid=txid_current();
END IF;
IF kh IS NOT NULL THEN INSERT INTO mcp_write_external_keys(tool,key_hash,affaire_id,etape_id,result,request_hash) VALUES(_tool,kh,(output->>'affaire_id')::uuid,CASE WHEN _tool='creer_etape_logistique' THEN (output->>'id')::uuid END,output,_arguments_hash) ON CONFLICT DO NOTHING; END IF;
UPDATE mcp_write_confirmations SET executed_at=now(),result=output WHERE id=c.id;
INSERT INTO mcp_audit_log(user_id,client_id,tool,statut,confirmation_id,affaire_id,etape_id,diff,nb_lignes) VALUES(auth.uid(),auth.jwt()->>'client_id',_tool,'executed',c.id,COALESCE(c.affaire_id,(output->>'affaire_id')::uuid),COALESCE(c.etape_id,CASE WHEN _tool='creer_etape_logistique' THEN (output->>'id')::uuid END),mcp_safe_diff(_diff),1);
RETURN output||jsonb_build_object('statut','executed');
EXCEPTION WHEN OTHERS THEN INSERT INTO mcp_audit_log(user_id,client_id,tool,statut,confirmation_id,affaire_id,etape_id) VALUES(auth.uid(),auth.jwt()->>'client_id',_tool,'refused',_confirmation_id,c.affaire_id,c.etape_id); RETURN jsonb_build_object('error',SQLERRM,'statut','refused'); END; END $function$;

DROP POLICY IF EXISTS mcp_oauth_block_insert ON public.affaires;
CREATE POLICY mcp_oauth_block_insert ON public.affaires AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (auth.jwt()->>'client_id' IS NULL OR current_user='mcp_business_rls');
DROP POLICY IF EXISTS mcp_oauth_block_update ON public.affaires;
CREATE POLICY mcp_oauth_block_update ON public.affaires AS RESTRICTIVE FOR UPDATE TO authenticated USING (auth.jwt()->>'client_id' IS NULL OR current_user='mcp_business_rls') WITH CHECK (auth.jwt()->>'client_id' IS NULL OR current_user='mcp_business_rls');
DROP POLICY IF EXISTS mcp_oauth_block_delete ON public.affaires;
CREATE POLICY mcp_oauth_block_delete ON public.affaires AS RESTRICTIVE FOR DELETE TO authenticated USING (auth.jwt()->>'client_id' IS NULL OR current_user='mcp_business_rls');
DROP POLICY IF EXISTS mcp_oauth_block_insert ON public.clients;
CREATE POLICY mcp_oauth_block_insert ON public.clients AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (auth.jwt()->>'client_id' IS NULL OR current_user='mcp_business_rls');
DROP POLICY IF EXISTS mcp_oauth_block_update ON public.clients;
CREATE POLICY mcp_oauth_block_update ON public.clients AS RESTRICTIVE FOR UPDATE TO authenticated USING (auth.jwt()->>'client_id' IS NULL OR current_user='mcp_business_rls') WITH CHECK (auth.jwt()->>'client_id' IS NULL OR current_user='mcp_business_rls');
DROP POLICY IF EXISTS mcp_oauth_block_delete ON public.clients;
CREATE POLICY mcp_oauth_block_delete ON public.clients AS RESTRICTIVE FOR DELETE TO authenticated USING (auth.jwt()->>'client_id' IS NULL OR current_user='mcp_business_rls');
DROP POLICY IF EXISTS mcp_oauth_block_insert ON public.client_contacts;
CREATE POLICY mcp_oauth_block_insert ON public.client_contacts AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (auth.jwt()->>'client_id' IS NULL OR current_user='mcp_business_rls');
DROP POLICY IF EXISTS mcp_oauth_block_update ON public.client_contacts;
CREATE POLICY mcp_oauth_block_update ON public.client_contacts AS RESTRICTIVE FOR UPDATE TO authenticated USING (auth.jwt()->>'client_id' IS NULL OR current_user='mcp_business_rls') WITH CHECK (auth.jwt()->>'client_id' IS NULL OR current_user='mcp_business_rls');
DROP POLICY IF EXISTS mcp_oauth_block_delete ON public.client_contacts;
CREATE POLICY mcp_oauth_block_delete ON public.client_contacts AS RESTRICTIVE FOR DELETE TO authenticated USING (auth.jwt()->>'client_id' IS NULL OR current_user='mcp_business_rls');
DROP POLICY IF EXISTS mcp_oauth_block_insert ON public.opportunite_actions;
CREATE POLICY mcp_oauth_block_insert ON public.opportunite_actions AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (auth.jwt()->>'client_id' IS NULL OR current_user='mcp_business_rls');
DROP POLICY IF EXISTS mcp_oauth_block_update ON public.opportunite_actions;
CREATE POLICY mcp_oauth_block_update ON public.opportunite_actions AS RESTRICTIVE FOR UPDATE TO authenticated USING (auth.jwt()->>'client_id' IS NULL OR current_user='mcp_business_rls') WITH CHECK (auth.jwt()->>'client_id' IS NULL OR current_user='mcp_business_rls');
DROP POLICY IF EXISTS mcp_oauth_block_delete ON public.opportunite_actions;
CREATE POLICY mcp_oauth_block_delete ON public.opportunite_actions AS RESTRICTIVE FOR DELETE TO authenticated USING (auth.jwt()->>'client_id' IS NULL OR current_user='mcp_business_rls');
DROP POLICY IF EXISTS mcp_oauth_block_insert ON public.opportunite_jalons;
CREATE POLICY mcp_oauth_block_insert ON public.opportunite_jalons AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (auth.jwt()->>'client_id' IS NULL OR current_user='mcp_business_rls');
DROP POLICY IF EXISTS mcp_oauth_block_update ON public.opportunite_jalons;
CREATE POLICY mcp_oauth_block_update ON public.opportunite_jalons AS RESTRICTIVE FOR UPDATE TO authenticated USING (auth.jwt()->>'client_id' IS NULL OR current_user='mcp_business_rls') WITH CHECK (auth.jwt()->>'client_id' IS NULL OR current_user='mcp_business_rls');
DROP POLICY IF EXISTS mcp_oauth_block_delete ON public.opportunite_jalons;
CREATE POLICY mcp_oauth_block_delete ON public.opportunite_jalons AS RESTRICTIVE FOR DELETE TO authenticated USING (auth.jwt()->>'client_id' IS NULL OR current_user='mcp_business_rls');
DROP POLICY IF EXISTS mcp_oauth_block_insert ON public.affaire_etapes_logistiques;
CREATE POLICY mcp_oauth_block_insert ON public.affaire_etapes_logistiques AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (auth.jwt()->>'client_id' IS NULL OR current_user='mcp_business_rls');
DROP POLICY IF EXISTS mcp_oauth_block_update ON public.affaire_etapes_logistiques;
CREATE POLICY mcp_oauth_block_update ON public.affaire_etapes_logistiques AS RESTRICTIVE FOR UPDATE TO authenticated USING (auth.jwt()->>'client_id' IS NULL OR current_user='mcp_business_rls') WITH CHECK (auth.jwt()->>'client_id' IS NULL OR current_user='mcp_business_rls');
DROP POLICY IF EXISTS mcp_oauth_block_delete ON public.affaire_etapes_logistiques;
CREATE POLICY mcp_oauth_block_delete ON public.affaire_etapes_logistiques AS RESTRICTIVE FOR DELETE TO authenticated USING (auth.jwt()->>'client_id' IS NULL OR current_user='mcp_business_rls');
DROP POLICY IF EXISTS mcp_oauth_block_insert ON public.affaire_commentaires;
CREATE POLICY mcp_oauth_block_insert ON public.affaire_commentaires AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (auth.jwt()->>'client_id' IS NULL OR current_user='mcp_business_rls');
DROP POLICY IF EXISTS mcp_oauth_block_update ON public.affaire_commentaires;
CREATE POLICY mcp_oauth_block_update ON public.affaire_commentaires AS RESTRICTIVE FOR UPDATE TO authenticated USING (auth.jwt()->>'client_id' IS NULL OR current_user='mcp_business_rls') WITH CHECK (auth.jwt()->>'client_id' IS NULL OR current_user='mcp_business_rls');
DROP POLICY IF EXISTS mcp_oauth_block_delete ON public.affaire_commentaires;
CREATE POLICY mcp_oauth_block_delete ON public.affaire_commentaires AS RESTRICTIVE FOR DELETE TO authenticated USING (auth.jwt()->>'client_id' IS NULL OR current_user='mcp_business_rls');