INSERT INTO public.capabilities(key,label,description,category,sort_order)
VALUES ('devis.pennylane','Transférer les devis vers Pennylane','Rapprochement clients et transfert des devis signés','devis',905)
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.role_capabilities(role,capability,granted,scope) VALUES
 ('admin','devis.pennylane',true,'all'),('commercial','devis.pennylane',true,'all')
ON CONFLICT DO NOTHING;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS pennylane_rapproche_le timestamptz,
  ADD COLUMN IF NOT EXISTS pennylane_rapproche_par uuid,
  ADD COLUMN IF NOT EXISTS pennylane_rapprochement_motif text;
CREATE UNIQUE INDEX IF NOT EXISTS clients_pennylane_id_uniq ON public.clients(pennylane_id) WHERE pennylane_id IS NOT NULL;

ALTER TABLE public.devis
  ADD COLUMN IF NOT EXISTS pennylane_quote_id text,
  ADD COLUMN IF NOT EXISTS pennylane_numero text,
  ADD COLUMN IF NOT EXISTS pennylane_lien text,
  ADD COLUMN IF NOT EXISTS pennylane_transfere_le timestamptz,
  ADD COLUMN IF NOT EXISTS pennylane_transfere_par uuid,
  ADD COLUMN IF NOT EXISTS pennylane_options_retenues uuid[],
  ADD COLUMN IF NOT EXISTS pennylane_total_ht numeric(12,2),
  ADD COLUMN IF NOT EXISTS pennylane_etat text CHECK (pennylane_etat IN ('en_cours','transfere','ecart','echec'));
CREATE UNIQUE INDEX IF NOT EXISTS devis_pennylane_quote_uniq ON public.devis(pennylane_quote_id) WHERE pennylane_quote_id IS NOT NULL;

CREATE TABLE public.pennylane_journal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  devis_id uuid REFERENCES public.devis(id),
  client_id uuid REFERENCES public.clients(id),
  etape text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}',
  auteur uuid DEFAULT auth.uid(),
  cree_le timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pennylane_journal TO authenticated;
GRANT ALL ON public.pennylane_journal TO service_role;
ALTER TABLE public.pennylane_journal ENABLE ROW LEVEL SECURITY;
CREATE POLICY pennylane_journal_lire ON public.pennylane_journal FOR SELECT TO authenticated
  USING (public.current_user_has_capability('devis.pennylane'));

CREATE OR REPLACE FUNCTION public.devis_pennylane_reserver(_devis_id uuid, _options uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE d record; v_pl text; v_bad int;
BEGIN
  IF auth.uid() IS NULL OR NOT current_user_has_capability('devis.pennylane') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO d FROM devis WHERE id=_devis_id AND redige_dans_staffing AND NOT est_modele AND supprime_le IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Devis introuvable'; END IF;
  IF d.statut_redaction <> 'signe' THEN RAISE EXCEPTION 'Seul un devis signé peut être transféré vers Pennylane'; END IF;
  IF d.pennylane_quote_id IS NOT NULL THEN RAISE EXCEPTION 'Ce devis est déjà transféré vers Pennylane'; END IF;
  IF d.pennylane_etat = 'en_cours' AND d.pennylane_transfere_le > now() - interval '10 minutes' THEN
    RAISE EXCEPTION 'Un transfert de ce devis est déjà en cours'; END IF;
  SELECT pennylane_id INTO v_pl FROM clients WHERE id=d.client_id;
  IF v_pl IS NULL THEN RAISE EXCEPTION 'Client non rapproché avec Pennylane'; END IF;
  SELECT count(*) INTO v_bad FROM unnest(coalesce(_options,'{}'::uuid[])) o
   WHERE NOT EXISTS (SELECT 1 FROM devis_lignes l WHERE l.id=o AND l.devis_id=_devis_id AND l.type='option' AND l.supprime_le IS NULL);
  IF v_bad > 0 THEN RAISE EXCEPTION 'Option inconnue pour ce devis'; END IF;
  PERFORM set_config('app.devis_rpc','on',true);
  UPDATE devis SET pennylane_etat='en_cours', pennylane_options_retenues=coalesce(_options,'{}'), pennylane_transfere_le=now(), pennylane_transfere_par=auth.uid() WHERE id=_devis_id;
  INSERT INTO pennylane_journal(devis_id,etape,detail,auteur) VALUES (_devis_id,'reservation',jsonb_build_object('options',coalesce(_options,'{}')),auth.uid());
  RETURN jsonb_build_object('numero',d.numero,'version',d.version,'customer_id',v_pl);
END $$;

CREATE OR REPLACE FUNCTION public.devis_pennylane_enregistrer(_devis_id uuid, _quote_id text, _numero text, _lien text, _total_ht numeric, _ecart boolean, _detail jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE d record;
BEGIN
  IF auth.uid() IS NULL OR NOT current_user_has_capability('devis.pennylane') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO d FROM devis WHERE id=_devis_id FOR UPDATE;
  IF NOT FOUND OR d.pennylane_etat IS DISTINCT FROM 'en_cours' THEN RAISE EXCEPTION 'Aucun transfert en cours pour ce devis'; END IF;
  IF coalesce(_quote_id,'') = '' THEN RAISE EXCEPTION 'Identifiant Pennylane manquant'; END IF;
  PERFORM set_config('app.devis_rpc','on',true);
  UPDATE devis SET pennylane_quote_id=_quote_id, pennylane_numero=nullif(_numero,''), pennylane_lien=nullif(_lien,''),
    pennylane_total_ht=_total_ht, pennylane_etat=CASE WHEN _ecart THEN 'ecart' ELSE 'transfere' END,
    pennylane_transfere_le=now(), pennylane_transfere_par=auth.uid() WHERE id=_devis_id;
  INSERT INTO pennylane_journal(devis_id,etape,detail,auteur)
  VALUES (_devis_id, CASE WHEN _ecart THEN 'ecart' ELSE 'transfere' END, coalesce(_detail,'{}') || jsonb_build_object('quote_id',_quote_id,'numero',_numero,'total_ht',_total_ht), auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.devis_pennylane_echec(_devis_id uuid, _detail jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT current_user_has_capability('devis.pennylane') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  PERFORM set_config('app.devis_rpc','on',true);
  UPDATE devis SET pennylane_etat='echec' WHERE id=_devis_id AND pennylane_quote_id IS NULL AND pennylane_etat='en_cours';
  INSERT INTO pennylane_journal(devis_id,etape,detail,auteur) VALUES (_devis_id,'echec',coalesce(_detail,'{}'),auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.client_pennylane_rapprocher(_client_id uuid, _pennylane_id text, _motif text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_old text;
BEGIN
  IF auth.uid() IS NULL OR NOT current_user_has_capability('devis.pennylane') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF coalesce(trim(_pennylane_id),'') = '' THEN RAISE EXCEPTION 'Identifiant Pennylane manquant'; END IF;
  IF EXISTS (SELECT 1 FROM clients WHERE pennylane_id=trim(_pennylane_id) AND id<>_client_id) THEN
    RAISE EXCEPTION 'Ce client Pennylane est déjà rapproché d''un autre client Staffing'; END IF;
  SELECT pennylane_id INTO v_old FROM clients WHERE id=_client_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Client introuvable'; END IF;
  UPDATE clients SET pennylane_id=trim(_pennylane_id), pennylane_rapproche_le=now(), pennylane_rapproche_par=auth.uid(), pennylane_rapprochement_motif=_motif WHERE id=_client_id;
  INSERT INTO pennylane_journal(client_id,etape,detail,auteur) VALUES (_client_id,'rapprochement',jsonb_build_object('ancien',v_old,'nouveau',trim(_pennylane_id),'motif',_motif),auth.uid());
END $$;

REVOKE EXECUTE ON FUNCTION public.devis_pennylane_reserver(uuid,uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.devis_pennylane_enregistrer(uuid,text,text,text,numeric,boolean,jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.devis_pennylane_echec(uuid,jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.client_pennylane_rapprocher(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devis_pennylane_reserver(uuid,uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.devis_pennylane_enregistrer(uuid,text,text,text,numeric,boolean,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.devis_pennylane_echec(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.client_pennylane_rapprocher(uuid,text,text) TO authenticated;