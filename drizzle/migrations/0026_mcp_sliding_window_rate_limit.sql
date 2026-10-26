ALTER TABLE public.mcp_audit_log DROP CONSTRAINT mcp_audit_log_statut_check;
ALTER TABLE public.mcp_audit_log ADD CONSTRAINT mcp_audit_log_statut_check CHECK (statut IN ('ok','refuse','erreur','rate_limited'));
CREATE TABLE public.mcp_rate_limit_windows (user_id uuid PRIMARY KEY REFERENCES public.profiles(id), accepted_at timestamptz[] NOT NULL DEFAULT '{}');
GRANT SELECT ON public.mcp_rate_limit_windows TO authenticated;
GRANT ALL ON public.mcp_rate_limit_windows TO service_role;
ALTER TABLE public.mcp_rate_limit_windows ENABLE ROW LEVEL SECURITY;
CREATE POLICY mcp_rate_limit_read ON public.mcp_rate_limit_windows FOR SELECT TO authenticated USING (user_id = auth.uid() AND public.user_has_cap('api.mcp'));
COMMENT ON TABLE public.mcp_rate_limit_windows IS 'Bounded technical MCP quota: at most 60 accepted timestamps per user, shared across clients and Worker instances. Written only by the atomic caller-verified quota function.';
CREATE FUNCTION public.consume_mcp_rate_limit(_tool text DEFAULT 'request', _arguments jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_client text := auth.jwt()->>'client_id';
  v_times timestamptz[];
  v_now timestamptz;
  v_retry integer;
  v_start timestamptz := clock_timestamp();
  v_args jsonb;
BEGIN
  IF v_user IS NULL OR v_client IS NULL OR NOT public.user_has_cap('api.mcp') OR NOT public.is_feature_flag_enabled('mcp_v1') OR NOT EXISTS (SELECT 1 FROM public.mcp_connections WHERE user_id=v_user AND client_id=v_client AND revoked_at IS NULL) THEN
    RETURN jsonb_build_object('applicable',false);
  END IF;
  INSERT INTO public.mcp_rate_limit_windows(user_id) VALUES(v_user) ON CONFLICT(user_id) DO NOTHING;
  SELECT accepted_at INTO v_times FROM public.mcp_rate_limit_windows WHERE user_id=v_user FOR UPDATE;
  v_now := clock_timestamp();
  SELECT COALESCE(array_agg(t ORDER BY t),'{}'::timestamptz[]) INTO v_times FROM unnest(v_times) t WHERE t > v_now - interval '60 seconds';
  IF cardinality(v_times) >= 60 THEN
    v_retry := greatest(1,ceil(extract(epoch FROM (v_times[1] + interval '60 seconds' - v_now)))::integer);
    SELECT COALESCE(jsonb_object_agg(key,value),'{}'::jsonb) INTO v_args FROM jsonb_each(CASE WHEN jsonb_typeof(_arguments)='object' THEN _arguments ELSE '{}'::jsonb END) WHERE key IN ('limit','cursor','du','au','montage_du','montage_au','fenetre') AND ((jsonb_typeof(value)='string' AND length(value #>> '{}')<=40) OR (jsonb_typeof(value)='number' AND length(value::text)<=40));
    INSERT INTO public.mcp_audit_log(user_id,client_id,tool,arguments,nb_lignes,duree_ms,statut) VALUES(v_user,v_client,CASE WHEN _tool IN ('rechercher_affaires','fiche_affaire','pipeline_opportunites','qui_est_ou','charge_atelier','heures_affaire','echeances','demandes_clients','mon_profil','initialize','notifications/initialized','tools/list','tools/call','ping') THEN _tool ELSE 'request' END,v_args,0,greatest(0,floor(extract(epoch FROM (clock_timestamp()-v_start))*1000))::integer,'rate_limited');
    RETURN jsonb_build_object('applicable',true,'allowed',false,'retry_after_seconds',v_retry);
  END IF;
  UPDATE public.mcp_rate_limit_windows SET accepted_at=array_append(v_times,v_now) WHERE user_id=v_user;
  RETURN jsonb_build_object('applicable',true,'allowed',true,'retry_after_seconds',0);
END;
$$;
REVOKE ALL ON FUNCTION public.consume_mcp_rate_limit(text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_mcp_rate_limit(text,jsonb) TO authenticated;
COMMENT ON FUNCTION public.consume_mcp_rate_limit(text,jsonb) IS 'Atomic per-authenticated-user sliding 60 requests/60s MCP quota and refusal audit. Identity and OAuth client come only from verified JWT. No business reads, arbitrary identity, or caller-chosen quota.';