CREATE OR REPLACE FUNCTION public.devis_eur_fr(_v numeric)
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$ SELECT translate(to_char(round(_v,2),'FM999,999,999,990.00'), ',.', ' ,') || ' €' $$;

CREATE OR REPLACE FUNCTION public.devis_marquer_envoye(_devis_id uuid, _date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE d record; v_ht numeric; v_avance boolean := false;
BEGIN
  IF auth.jwt()->>'client_id' IS NOT NULL THEN RAISE EXCEPTION 'Envoi réservé à l''application' USING ERRCODE='42501'; END IF;
  SELECT * INTO d FROM devis WHERE id=_devis_id AND redige_dans_staffing AND NOT est_modele FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Devis introuvable'; END IF;
  IF NOT devis_peut_valider(_devis_id) THEN RAISE EXCEPTION 'Envoi réservé au chargé d''affaires de l''affaire ou à un admin' USING ERRCODE='42501'; END IF;
  IF d.statut_redaction <> 'valide' THEN RAISE EXCEPTION 'Seul un devis validé peut être envoyé'; END IF;
  IF _date IS NULL OR _date > current_date + 1 THEN RAISE EXCEPTION 'Date d''envoi invalide'; END IF;
  v_ht := coalesce((d.totaux_snapshot->>'net_ht')::numeric, (d.totaux_snapshot->>'total_ht')::numeric, d.montant_ht);
  PERFORM set_config('app.devis_rpc','on',true);
  UPDATE devis SET statut_redaction='transfere', date_envoi=_date, updated_at=now() WHERE id=_devis_id;
  IF EXISTS (SELECT 1 FROM affaires WHERE id=d.affaire_id AND phase='opportunite') THEN
    v_avance := devis_opp_avancer(d.affaire_id,'envoye',
      format('Devis %s (R%s) envoyé le %s — %s net HT', d.numero, d.version, to_char(_date,'DD/MM/YYYY'), devis_eur_fr(v_ht)));
    UPDATE affaires SET ca_estime_ht=v_ht, updated_at=now() WHERE id=d.affaire_id;
    INSERT INTO opportunite_jalons(affaire_id,etape,date_atteinte,ordre) VALUES(d.affaire_id,'devis_envoye',_date,2)
      ON CONFLICT (affaire_id,etape) DO UPDATE SET date_atteinte=EXCLUDED.date_atteinte, updated_at=now();
  END IF;
  RETURN jsonb_build_object('devis_id',_devis_id,'statut_avance',v_avance,'ca_estime_ht',v_ht);
END $function$;