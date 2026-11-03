-- Lot 3a : transfert ProGBat. « transfere » reste le statut figé ; transfert ProGBat (numero_progbat) et envoi client (date_envoi) sont deux faits distincts.
ALTER TABLE public.devis
  ADD COLUMN IF NOT EXISTS transfere_progbat_le timestamptz,
  ADD COLUMN IF NOT EXISTS transfere_progbat_par uuid,
  ADD COLUMN IF NOT EXISTS total_progbat numeric(14,2),
  ADD COLUMN IF NOT EXISTS ecart_progbat_motif text;
ALTER TABLE public.devis ADD CONSTRAINT devis_numero_progbat_format CHECK (numero_progbat IS NULL OR numero_progbat ~ '^D-\d{6}-\d{4}$') NOT VALID;
CREATE UNIQUE INDEX IF NOT EXISTS devis_numero_progbat_unique ON public.devis(numero_progbat) WHERE numero_progbat IS NOT NULL AND redige_dans_staffing AND supprime_le IS NULL;

ALTER TABLE public.devis_exports ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'pdf';
ALTER TABLE public.devis_exports ADD COLUMN IF NOT EXISTS fiche jsonb;
ALTER TABLE public.devis_exports DROP CONSTRAINT IF EXISTS devis_exports_niveau_check;
ALTER TABLE public.devis_exports ADD CONSTRAINT devis_exports_niveau_check CHECK (niveau IN ('detaille','synthetique','progbat'));
ALTER TABLE public.devis_exports ADD CONSTRAINT devis_exports_format_check CHECK (format IN ('pdf','progbat_xlsx'));

-- Données d'export ProGBat : vue client + heures par ligne (sans taux ni coût) + remise. Devis validé ou transféré seulement.
CREATE OR REPLACE FUNCTION public.devis_progbat_donnees(_devis_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE d record; v jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT devis_peut_lire(_devis_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO d FROM devis WHERE id=_devis_id AND supprime_le IS NULL AND redige_dans_staffing AND NOT est_modele;
  IF NOT FOUND THEN RAISE EXCEPTION 'Devis introuvable'; END IF;
  IF d.statut_redaction NOT IN ('valide','transfere') THEN RAISE EXCEPTION 'Seul un devis validé peut être exporté vers ProGBat'; END IF;
  v := devis_lire_client(_devis_id);
  RETURN v || jsonb_build_object(
    'numero_progbat', d.numero_progbat, 'remise_mode', coalesce(d.remise_mode,'aucune'), 'remise_valeur', d.remise_valeur,
    'heures', (SELECT coalesce(jsonb_object_agg(ligne_id, h),'{}'::jsonb) FROM (
       SELECT z.ligne_id, round(sum(z.h),2) h FROM (
         SELECT x.ligne_id, x.heures*CASE WHEN x.par_unite THEN coalesce(l.quantite,1) ELSE 1 END h
           FROM devis_heures x JOIN devis_lignes l ON l.id=x.ligne_id
          WHERE l.devis_id=_devis_id AND l.supprime_le IS NULL AND x.supprime_le IS NULL
         UNION ALL
         SELECT x.ligne_id, coalesce(x.heures_info,0)*CASE WHEN x.par_unite THEN coalesce(l.quantite,1) ELSE 1 END
           FROM devis_lignes_libres x JOIN devis_lignes l ON l.id=x.ligne_id
          WHERE l.devis_id=_devis_id AND l.supprime_le IS NULL AND x.supprime_le IS NULL AND coalesce(x.heures_info,0)<>0) z
       GROUP BY z.ligne_id HAVING sum(z.h)<>0) s));
END $$;
REVOKE EXECUTE ON FUNCTION public.devis_progbat_donnees(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.devis_progbat_donnees(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.devis_export_progbat_enregistrer(_devis_id uuid, _storage_path text, _taille integer, _fiche jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE d record; v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT devis_peut_lire(_devis_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF _storage_path IS NULL OR split_part(_storage_path,'/',1) <> _devis_id::text OR _storage_path !~ '\.xlsx$' THEN RAISE EXCEPTION 'Chemin d''export invalide'; END IF;
  SELECT version, statut_redaction::text AS st INTO d FROM devis WHERE id=_devis_id AND supprime_le IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Devis introuvable'; END IF;
  IF d.st NOT IN ('valide','transfere') THEN RAISE EXCEPTION 'Seul un devis validé peut être exporté vers ProGBat'; END IF;
  INSERT INTO devis_exports(devis_id, version, statut_redaction, niveau, filigrane, storage_path, taille_octets, cree_par, format, fiche)
  VALUES (_devis_id, d.version, d.st, 'progbat', false, _storage_path, _taille, auth.uid(), 'progbat_xlsx', _fiche)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'version', d.version);
END $$;
REVOKE EXECUTE ON FUNCTION public.devis_export_progbat_enregistrer(uuid,text,integer,jsonb) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.devis_export_progbat_enregistrer(uuid,text,integer,jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.devis_exports_lister(_devis_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN NOT devis_peut_lire(_devis_id) THEN '[]'::jsonb ELSE coalesce((
    SELECT jsonb_agg(jsonb_build_object('id',e.id,'version',e.version,'statut_redaction',e.statut_redaction,'niveau',e.niveau,'filigrane',e.filigrane,
      'format',e.format,'fiche',e.fiche,
      'storage_path',e.storage_path,'cree_le',e.cree_le,'auteur',coalesce(nullif(trim(p.full_name),''),p.email)) ORDER BY e.cree_le DESC)
    FROM devis_exports e LEFT JOIN profiles p ON p.id=e.cree_par WHERE e.devis_id=_devis_id),'[]'::jsonb) END
$$;

-- Enregistrement du transfert : réservé à l'application (passe MCP ultérieure), droit de validation, devis validé.
CREATE OR REPLACE FUNCTION public.devis_enregistrer_transfert(_devis_id uuid, _numero text, _total_progbat numeric, _motif text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE d record; v_net numeric; v_ecart numeric; v_num text := upper(trim(coalesce(_numero,'')));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF auth.jwt()->>'client_id' IS NOT NULL THEN RAISE EXCEPTION 'Transfert réservé à l''application' USING ERRCODE='42501'; END IF;
  SELECT * INTO d FROM devis WHERE id=_devis_id AND redige_dans_staffing AND NOT est_modele AND supprime_le IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Devis introuvable'; END IF;
  IF NOT devis_peut_valider(_devis_id) THEN RAISE EXCEPTION 'Transfert réservé au chargé d''affaires de l''affaire ou à un admin' USING ERRCODE='42501'; END IF;
  IF d.statut_redaction <> 'valide' THEN RAISE EXCEPTION 'Seul un devis validé peut être transféré dans ProGBat'; END IF;
  IF v_num !~ '^D-\d{6}-\d{4}$' THEN RAISE EXCEPTION 'Numéro ProGBat invalide : format attendu D-AAAAMM-NNNN'; END IF;
  IF EXISTS (SELECT 1 FROM devis WHERE numero_progbat=v_num AND id<>_devis_id AND redige_dans_staffing AND supprime_le IS NULL) THEN
    RAISE EXCEPTION 'Ce numéro ProGBat est déjà attribué à un autre devis'; END IF;
  IF _total_progbat IS NULL THEN RAISE EXCEPTION 'Total HT ProGBat obligatoire'; END IF;
  v_net := coalesce((d.totaux_snapshot->>'net_ht')::numeric, (devis_calculer_interne(_devis_id)->>'net_ht')::numeric);
  v_ecart := round(_total_progbat,2) - round(v_net,2);
  IF v_ecart <> 0 AND nullif(trim(coalesce(_motif,'')),'') IS NULL THEN
    RAISE EXCEPTION 'Écart de % € entre ProGBat et Staffing : motif obligatoire', replace(to_char(v_ecart,'FM999999990.00'),'.',','); END IF;
  PERFORM set_config('app.devis_rpc','on',true);
  UPDATE devis SET statut_redaction='transfere', numero_progbat=v_num, total_progbat=round(_total_progbat,2),
         ecart_progbat_motif=CASE WHEN v_ecart<>0 THEN trim(_motif) END,
         transfere_progbat_le=now(), transfere_progbat_par=auth.uid(), updated_at=now()
   WHERE id=_devis_id;
  RETURN jsonb_build_object('devis_id',_devis_id,'numero_progbat',v_num,'net_ht_staffing',round(v_net,2),'total_progbat',round(_total_progbat,2),'ecart',v_ecart);
END $$;
REVOKE EXECUTE ON FUNCTION public.devis_enregistrer_transfert(uuid,text,numeric,text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.devis_enregistrer_transfert(uuid,text,numeric,text) TO authenticated, service_role;

-- Envoi client : possible aussi après transfert ProGBat (le devis client part de ProGBat).
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
  IF d.statut_redaction NOT IN ('valide','transfere') THEN RAISE EXCEPTION 'Seul un devis validé peut être envoyé'; END IF;
  IF _date IS NULL OR _date > current_date + 1 THEN RAISE EXCEPTION 'Date d''envoi invalide'; END IF;
  v_ht := coalesce((d.totaux_snapshot->>'net_ht')::numeric, (d.totaux_snapshot->>'total_ht')::numeric, d.montant_ht);
  PERFORM set_config('app.devis_rpc','on',true);
  UPDATE devis SET statut_redaction='transfere', date_envoi=_date, updated_at=now() WHERE id=_devis_id;
  IF EXISTS (SELECT 1 FROM affaires WHERE id=d.affaire_id AND phase='opportunite') THEN
    v_avance := devis_opp_avancer(d.affaire_id,'envoye',
      format('Devis %s (R%s) envoyé le %s — %s net HT', coalesce(d.numero_progbat||' / ','')||d.numero, d.version, to_char(_date,'DD/MM/YYYY'), devis_eur_fr(v_ht)));
    UPDATE affaires SET ca_estime_ht=v_ht, updated_at=now() WHERE id=d.affaire_id;
    INSERT INTO opportunite_jalons(affaire_id,etape,date_atteinte,ordre) VALUES(d.affaire_id,'devis_envoye',_date,2)
      ON CONFLICT (affaire_id,etape) DO UPDATE SET date_atteinte=EXCLUDED.date_atteinte, updated_at=now();
  END IF;
  RETURN jsonb_build_object('devis_id',_devis_id,'statut_avance',v_avance,'ca_estime_ht',v_ht);
END $function$;

-- Listes : numéro ProGBat et date d'envoi pour distinguer les deux faits.
DROP FUNCTION public.devis_lister(uuid);
CREATE FUNCTION public.devis_lister(_affaire_id uuid)
 RETURNS TABLE(id uuid, numero text, version integer, statut_redaction devis_redaction_statut, total_ht numeric, date_devis date, auteur text, modele_origine text, created_at timestamp with time zone, numero_progbat text, date_envoi date)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT d.id,d.numero,d.version,d.statut_redaction,
    coalesce((d.totaux_snapshot->>'total_ht')::numeric,(devis_calculer_interne(d.id)->>'total_ht')::numeric),
    d.date_devis,(SELECT coalesce(p.full_name,p.email) FROM profiles p WHERE p.id=d.auteur_id),
    (SELECT m.modele_nom FROM devis m WHERE m.id=d.modele_origine_id), d.created_at, d.numero_progbat, d.date_envoi::date
  FROM devis d WHERE d.affaire_id=_affaire_id AND d.redige_dans_staffing AND NOT d.est_modele AND devis_peut_lire(d.id)
  ORDER BY d.version DESC $function$;
REVOKE EXECUTE ON FUNCTION public.devis_lister(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.devis_lister(uuid) TO authenticated, service_role;

DROP FUNCTION public.devis_lister_global(text,text[],uuid,integer,integer);
CREATE FUNCTION public.devis_lister_global(_recherche text DEFAULT NULL::text, _statuts text[] DEFAULT NULL::text[], _charge_affaires_id uuid DEFAULT NULL::uuid, _limit integer DEFAULT 200, _offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, numero text, version integer, statut_redaction devis_redaction_statut, affaire_id uuid, affaire_numero text, affaire_nom text, client_nom text, net_ht numeric, date_devis date, charge_affaires_id uuid, charge_affaires_nom text, updated_at timestamp with time zone, numero_progbat text, date_envoi date)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT d.id, d.numero, d.version, d.statut_redaction, a.id, a.numero::text, a.nom, c.nom,
         coalesce((d.totaux_snapshot->>'net_ht')::numeric, (devis_calculer_interne(d.id)->>'net_ht')::numeric),
         d.date_devis, r.employe_id, trim(coalesce(e.prenom,'')||' '||coalesce(e.nom,'')), d.updated_at, d.numero_progbat, d.date_envoi::date
    FROM devis d
    JOIN affaires a ON a.id=d.affaire_id
    LEFT JOIN clients c ON c.id=d.client_id
    LEFT JOIN affaire_roles r ON r.affaire_id=a.id AND r.role='charge_affaires'
    LEFT JOIN employes e ON e.id=r.employe_id
   WHERE d.redige_dans_staffing AND NOT d.est_modele
     AND current_user_has_capability('devis.view') AND devis_peut_lire(d.id)
     AND (_statuts IS NULL OR d.statut_redaction::text = ANY(_statuts))
     AND (_charge_affaires_id IS NULL OR r.employe_id=_charge_affaires_id)
     AND (_recherche IS NULL OR concat_ws(' ',d.numero,d.numero_progbat,a.numero,a.nom,c.nom) ILIKE '%'||_recherche||'%')
   ORDER BY d.updated_at DESC, d.id
   LIMIT LEAST(coalesce(_limit,200),500) OFFSET coalesce(_offset,0);
$function$;
REVOKE EXECUTE ON FUNCTION public.devis_lister_global(text,text[],uuid,integer,integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.devis_lister_global(text,text[],uuid,integer,integer) TO authenticated, service_role;

DROP FUNCTION public.devis_derniers_par_affaire(uuid[]);
CREATE FUNCTION public.devis_derniers_par_affaire(_affaire_ids uuid[])
 RETURNS TABLE(affaire_id uuid, devis_id uuid, version integer, statut_redaction devis_redaction_statut, numero_progbat text, date_envoi date)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT DISTINCT ON (d.affaire_id) d.affaire_id, d.id, d.version, d.statut_redaction, d.numero_progbat, d.date_envoi::date
  FROM devis d WHERE d.affaire_id = ANY(_affaire_ids) AND coalesce(array_length(_affaire_ids,1),0) <= 1000
    AND d.redige_dans_staffing AND NOT d.est_modele
    AND current_user_has_capability('devis.view') AND devis_peut_lire(d.id)
  ORDER BY d.affaire_id, d.version DESC $function$;
REVOKE EXECUTE ON FUNCTION public.devis_derniers_par_affaire(uuid[]) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.devis_derniers_par_affaire(uuid[]) TO authenticated, service_role;