CREATE OR REPLACE FUNCTION public.mcp_execute_write_locked(_confirmation_id uuid,_tool text,_arguments_hash text,_payload jsonb,_diff jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_variable
DECLARE c public.mcp_write_confirmations; cap text; result jsonb; kh text; a public.affaires; current_snapshot text;
BEGIN BEGIN
cap:=mcp_assert_write(_tool);
SELECT * INTO c FROM mcp_write_confirmations WHERE id=_confirmation_id AND user_id=auth.uid() AND client_id=auth.jwt()->>'client_id' FOR UPDATE;
IF NOT FOUND OR c.tool<>_tool OR c.arguments_hash<>_arguments_hash OR c.payload_hash<>encode(extensions.digest(_payload::text,'sha256'),'hex') THEN RAISE EXCEPTION 'Confirmation invalide ou arguments modifiés'; END IF;
IF c.affaire_id IS NOT NULL THEN SELECT * INTO a FROM affaires WHERE id=c.affaire_id AND archived_at IS NULL FOR UPDATE; IF NOT FOUND OR NOT (user_cap_scope(cap)='all' OR (user_cap_scope(cap)='own' AND a.charge_affaires_id=auth.uid()) OR user_has_affaire_access(c.affaire_id)) THEN RAISE EXCEPTION 'Accès affaire refusé'; END IF; END IF;
IF c.executed_at IS NOT NULL THEN RETURN c.result || jsonb_build_object('idempotent',true); END IF;
IF c.expires_at<=now() THEN RAISE EXCEPTION 'Confirmation expirée'; END IF;
IF c.etape_id IS NOT NULL THEN SELECT updated_at::text INTO current_snapshot FROM affaire_etapes_logistiques WHERE id=c.etape_id FOR UPDATE; ELSIF c.affaire_id IS NOT NULL THEN current_snapshot:=a.updated_at::text; END IF;
IF c.snapshot IS NOT NULL AND c.snapshot::timestamptz IS DISTINCT FROM current_snapshot::timestamptz THEN RAISE EXCEPTION 'Données changées: demander un nouvel aperçu'; END IF;
IF _payload->>'cle_externe' IS NOT NULL THEN kh:=encode(extensions.digest(_payload->>'cle_externe','sha256'),'hex'); PERFORM pg_advisory_xact_lock(hashtextextended(_tool||kh,0)); SELECT x.result INTO result FROM mcp_write_external_keys x WHERE x.tool=_tool AND key_hash=kh; IF result IS NOT NULL THEN IF NOT EXISTS(SELECT 1 FROM mcp_write_external_keys x JOIN affaires aa ON aa.id=x.affaire_id WHERE x.tool=_tool AND key_hash=kh AND (user_cap_scope(cap)='all' OR user_has_affaire_access(aa.id))) THEN RAISE EXCEPTION 'Accès affaire refusé'; END IF; result:=result || jsonb_build_object('doublon_cle_externe',true); END IF; END IF;
IF result IS NULL THEN result:=mcp_dispatch_write(_tool,_payload,c.affaire_id,c.etape_id); END IF;
IF kh IS NOT NULL THEN INSERT INTO mcp_write_external_keys(tool,key_hash,affaire_id,etape_id,result) VALUES(_tool,kh,(result->>'affaire_id')::uuid,CASE WHEN _tool='creer_etape_logistique' THEN (result->>'id')::uuid END,result) ON CONFLICT DO NOTHING; END IF;
UPDATE mcp_write_confirmations SET executed_at=now(),result=result WHERE id=c.id;
INSERT INTO mcp_audit_log(user_id,client_id,tool,statut,confirmation_id,affaire_id,etape_id,diff,nb_lignes) VALUES(auth.uid(),auth.jwt()->>'client_id',_tool,'executed',c.id,COALESCE(c.affaire_id,(result->>'affaire_id')::uuid),COALESCE(c.etape_id,CASE WHEN _tool='creer_etape_logistique' THEN (result->>'id')::uuid END),mcp_safe_diff(_diff),1);
RETURN result || jsonb_build_object('statut','executed');
EXCEPTION WHEN OTHERS THEN INSERT INTO mcp_audit_log(user_id,client_id,tool,statut,confirmation_id,affaire_id,etape_id) VALUES(auth.uid(),auth.jwt()->>'client_id',_tool,'refused',_confirmation_id,c.affaire_id,c.etape_id); RETURN jsonb_build_object('error',SQLERRM,'statut','refused'); END; END $$;