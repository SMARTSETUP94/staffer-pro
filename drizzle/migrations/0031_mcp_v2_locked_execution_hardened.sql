ALTER TABLE public.mcp_write_external_keys ADD COLUMN IF NOT EXISTS request_hash text;
CREATE OR REPLACE FUNCTION public.mcp_execute_write_locked(_confirmation_id uuid,_tool text,_arguments_hash text,_payload jsonb,_diff jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
IF output IS NULL THEN output:=mcp_dispatch_write(_tool,_payload,c.affaire_id,c.etape_id); END IF;
IF kh IS NOT NULL THEN INSERT INTO mcp_write_external_keys(tool,key_hash,affaire_id,etape_id,result,request_hash) VALUES(_tool,kh,(output->>'affaire_id')::uuid,CASE WHEN _tool='creer_etape_logistique' THEN (output->>'id')::uuid END,output,_arguments_hash) ON CONFLICT DO NOTHING; END IF;
UPDATE mcp_write_confirmations SET executed_at=now(),result=output WHERE id=c.id;
INSERT INTO mcp_audit_log(user_id,client_id,tool,statut,confirmation_id,affaire_id,etape_id,diff,nb_lignes) VALUES(auth.uid(),auth.jwt()->>'client_id',_tool,'executed',c.id,COALESCE(c.affaire_id,(output->>'affaire_id')::uuid),COALESCE(c.etape_id,CASE WHEN _tool='creer_etape_logistique' THEN (output->>'id')::uuid END),mcp_safe_diff(_diff),1);
RETURN output||jsonb_build_object('statut','executed');
EXCEPTION WHEN OTHERS THEN INSERT INTO mcp_audit_log(user_id,client_id,tool,statut,confirmation_id,affaire_id,etape_id) VALUES(auth.uid(),auth.jwt()->>'client_id',_tool,'refused',_confirmation_id,c.affaire_id,c.etape_id); RETURN jsonb_build_object('error',SQLERRM,'statut','refused'); END; END $$;
CREATE OR REPLACE FUNCTION public.app_assert_affaire_write(_id uuid,_cap text) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$ DECLARE a public.affaires; BEGIN
IF auth.jwt()->>'client_id' IS NOT NULL AND current_user<>'mcp_business_rls' THEN RAISE EXCEPTION 'Écriture OAuth uniquement via confirmation MCP'; END IF;
IF NOT public.user_has_cap(_cap) THEN RAISE EXCEPTION 'Droit métier insuffisant'; END IF;
SELECT * INTO a FROM affaires WHERE id=_id AND archived_at IS NULL;
IF NOT FOUND OR NOT (public.user_cap_scope(_cap)='all' OR (public.user_cap_scope(_cap)='own' AND a.charge_affaires_id=auth.uid()) OR (public.user_cap_scope(_cap) IN ('team','affaire','assigned') AND public.user_has_affaire_access(_id))) THEN RAISE EXCEPTION 'Accès affaire refusé'; END IF;
END $$;
DO $guards$ DECLARE d text; BEGIN
IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mcp_business_rls' AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls) THEN RAISE EXCEPTION 'Rôle de dispatch non sécurisé'; END IF;
SELECT pg_get_functiondef('public.app_creer_opportunite_client(jsonb)'::regprocedure) INTO d;
d:=replace(d,'BEGIN IF NOT user_has_cap', 'BEGIN IF auth.jwt()->>''client_id'' IS NOT NULL AND current_user<>''mcp_business_rls'' THEN RAISE EXCEPTION ''Écriture OAuth uniquement via confirmation MCP''; END IF; IF NOT user_has_cap'); EXECUTE d;
SELECT pg_get_functiondef('public.app_modifier_affaire(uuid,jsonb)'::regprocedure) INTO d;
d:=replace(d,'BEGIN PERFORM public.app_assert_affaire_write', 'BEGIN IF _patch ? ''statut_opportunite'' AND NOT EXISTS(SELECT 1 FROM affaires WHERE id=_id AND phase=''opportunite'') THEN RAISE EXCEPTION ''Opportunité déjà signée''; END IF; PERFORM public.app_assert_affaire_write'); EXECUTE d;
SELECT pg_get_functiondef('public.app_modifier_etape_logistique(uuid,jsonb)'::regprocedure) INTO d;
d:=replace(d,'BEGIN SELECT * INTO e', 'BEGIN IF _patch->>''statut''=''annule'' AND length(trim(COALESCE(_patch->>''commentaire_equipe'',''''))) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION ''Motif annulation obligatoire''; END IF; SELECT * INTO e'); EXECUTE d;
END $guards$;