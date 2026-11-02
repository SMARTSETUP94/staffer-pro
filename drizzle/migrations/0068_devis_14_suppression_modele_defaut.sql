-- Devis 14 : suppression logique + restauration admin 30 j + modèle par défaut + vue client sans lignes à 0
ALTER TABLE public.devis ADD COLUMN IF NOT EXISTS supprime_le timestamptz;
ALTER TABLE public.devis ADD COLUMN IF NOT EXISTS supprime_par uuid;
ALTER TABLE public.devis ADD COLUMN IF NOT EXISTS modele_defaut boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS devis_un_seul_modele_defaut ON public.devis ((true)) WHERE modele_defaut;
ALTER TABLE public.devis ADD CONSTRAINT devis_modele_defaut_est_modele CHECK (NOT modele_defaut OR est_modele);

CREATE OR REPLACE FUNCTION public.devis_peut_lire(_devis_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM devis d WHERE d.id=_devis_id AND d.redige_dans_staffing AND d.supprime_le IS NULL AND (
     current_user_has_capability('devis.rediger') OR current_user_has_capability('devis.parametres')
     OR (d.affaire_id IS NOT NULL AND current_user_has_capability('devis.view') AND (
          is_admin() OR user_has_affaire_access(d.affaire_id)
          OR EXISTS (SELECT 1 FROM affaires a JOIN employes e ON e.id=a.chef_chantier_id
                     WHERE a.id=d.affaire_id AND e.profile_id=auth.uid())
          OR EXISTS (SELECT 1 FROM affaire_roles r JOIN employes e ON e.id=r.employe_id
                     WHERE r.affaire_id=d.affaire_id AND e.profile_id=auth.uid()))))) $function$;

CREATE OR REPLACE FUNCTION public.devis_peut_ecrire(_devis_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM devis d WHERE d.id=_devis_id AND d.redige_dans_staffing AND d.supprime_le IS NULL AND (
    (d.est_modele AND current_user_has_capability('devis.parametres'))
    OR (NOT d.est_modele AND user_can_write_affaire(d.affaire_id,'devis.rediger')))) $function$;

DROP POLICY IF EXISTS devis_staffing_lecture_restreinte ON public.devis;
CREATE POLICY devis_staffing_lecture_restreinte ON public.devis AS RESTRICTIVE FOR SELECT TO authenticated
  USING ((NOT redige_dans_staffing) OR (supprime_le IS NULL AND (current_user_has_capability('devis.couts') OR devis_peut_lire(id))));

CREATE OR REPLACE FUNCTION public.devis_charge_be(_affaire_ids uuid[])
 RETURNS TABLE(affaire_id uuid, devis_id uuid, numero text, version integer, heures_be numeric, jours_be numeric, etat text, figee boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT a.id, r.id, r.numero, r.version, r.h,
         ceil(r.h / nullif((SELECT valeur FROM v_devis_parametres_courants WHERE cle='heures_par_jour_be'),0) * 2) / 2,
         CASE WHEN a.statut_opportunite='gagne' OR a.phase='signe' THEN 'confirme' ELSE 'previsionnel' END,
         r.figee
  FROM affaires a
  CROSS JOIN LATERAL (
    SELECT d.id, d.numero, d.version, coalesce(d.heures_be_fige, devis_heures_be(d.id)) h, d.heures_be_fige IS NOT NULL figee
    FROM devis d WHERE d.affaire_id=a.id AND d.redige_dans_staffing AND NOT d.est_modele AND d.supprime_le IS NULL
      AND d.statut_redaction IN ('signe','transfere','valide')
    ORDER BY CASE d.statut_redaction WHEN 'signe' THEN 0 WHEN 'transfere' THEN 1 ELSE 2 END, d.version DESC LIMIT 1) r
  WHERE a.id = ANY(_affaire_ids) AND coalesce(array_length(_affaire_ids,1),0) <= 1000
    AND (a.statut_opportunite IN ('presque_gagne','gagne') OR a.phase='signe')
    AND (current_user_has_capability('planning.pilotage') OR user_has_affaire_access(a.id)) $function$;

CREATE OR REPLACE FUNCTION public.devis_creer_depuis_pipeline(_affaire_id uuid, _modele_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  IF NOT user_can_write_affaire(_affaire_id,'devis.rediger') THEN RAISE EXCEPTION 'Droits insuffisants' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('devis_version:'||_affaire_id::text));
  SELECT id INTO v_id FROM devis WHERE affaire_id=_affaire_id AND redige_dans_staffing AND NOT est_modele AND supprime_le IS NULL ORDER BY version DESC LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN jsonb_build_object('devis_id',v_id,'existant',true); END IF;
  RETURN jsonb_build_object('devis_id',devis_creer(_affaire_id,_modele_id),'existant',false);
END $function$;

CREATE OR REPLACE FUNCTION public.devis_bibliotheque_rechercher(_q text, _limit integer DEFAULT 40)
 RETURNS TABLE(ligne_id uuid, libelle text, descriptif_client text, quantite numeric, source text, source_est_modele boolean, montant numeric)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_q text := devis_normalize(_q);
BEGIN
  IF NOT (current_user_has_capability('devis.rediger') OR current_user_has_capability('devis.parametres')) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT l.id, l.libelle, l.descriptif_client, l.quantite,
    CASE WHEN d.est_modele THEN 'Modèle '||coalesce(d.modele_nom,'') ELSE d.numero END, d.est_modele,
    ((devis_calculer_interne(d.id))->'lignes'->>l.id::text)::numeric
  FROM devis_lignes l JOIN devis d ON d.id=l.devis_id
  WHERE l.type='objet' AND l.supprime_le IS NULL AND d.redige_dans_staffing AND d.supprime_le IS NULL AND (NOT d.est_modele OR d.modele_actif)
    AND (v_q='' OR devis_normalize(coalesce(l.libelle,'')||' '||coalesce(l.descriptif_client,'')) LIKE '%'||v_q||'%')
  ORDER BY d.est_modele DESC, l.created_at DESC
  LIMIT least(coalesce(_limit,40),100);
END $function$;

CREATE OR REPLACE FUNCTION public.devis_peut_supprimer(_devis_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM devis d JOIN affaires a ON a.id=d.affaire_id
    WHERE d.id=_devis_id AND d.redige_dans_staffing AND NOT d.est_modele AND d.supprime_le IS NULL
      AND d.statut_redaction IN ('brouillon','a_valider')
      AND (is_admin() OR (current_user_has_capability('devis.rediger') AND (
            d.auteur_id = auth.uid() OR a.charge_affaires_id = auth.uid()
            OR EXISTS (SELECT 1 FROM affaire_roles r JOIN employes e ON e.id=r.employe_id
                       WHERE r.affaire_id=d.affaire_id AND r.role='charge_affaires' AND e.profile_id=auth.uid()))))) $function$;

CREATE OR REPLACE FUNCTION public.devis_supprimer(_devis_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE d record;
BEGIN
  PERFORM mcp_assert_legacy_oauth_write('devis_supprimer');
  SELECT * INTO d FROM devis WHERE id=_devis_id FOR UPDATE;
  IF NOT FOUND OR NOT d.redige_dans_staffing OR d.est_modele OR d.supprime_le IS NOT NULL THEN RAISE EXCEPTION 'Devis introuvable'; END IF;
  IF d.statut_redaction NOT IN ('brouillon','a_valider') THEN
    RAISE EXCEPTION 'Un devis validé, envoyé ou signé ne se supprime pas : utilisez Marquer refusé ou Nouvelle version' USING ERRCODE='42501'; END IF;
  IF NOT devis_peut_supprimer(_devis_id) THEN RAISE EXCEPTION 'Droits insuffisants pour supprimer ce devis' USING ERRCODE='42501'; END IF;
  PERFORM set_config('app.devis_rpc','on',true);
  UPDATE devis SET supprime_le=now(), supprime_par=auth.uid() WHERE id=_devis_id;
  INSERT INTO devis_deletion_log(devis_id,devis_numero,affaire_id,affaire_numero,action,deleted_by,deleted_by_email)
  VALUES(d.id,d.numero,d.affaire_id,(SELECT coalesce(numero::text,code_opportunite) FROM affaires WHERE id=d.affaire_id),
         'suppression_logique',auth.uid(),(SELECT email FROM profiles WHERE id=auth.uid()));
END $function$;

CREATE OR REPLACE FUNCTION public.devis_restaurer(_devis_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE d record;
BEGIN
  PERFORM mcp_assert_legacy_oauth_write('devis_restaurer');
  IF NOT is_admin() THEN RAISE EXCEPTION 'Réservé aux admins' USING ERRCODE='42501'; END IF;
  SELECT * INTO d FROM devis WHERE id=_devis_id FOR UPDATE;
  IF NOT FOUND OR d.supprime_le IS NULL THEN RAISE EXCEPTION 'Ce devis n''est pas supprimé'; END IF;
  IF d.supprime_le < now() - interval '30 days' THEN RAISE EXCEPTION 'Délai de restauration de 30 jours dépassé'; END IF;
  PERFORM set_config('app.devis_rpc','on',true);
  UPDATE devis SET supprime_le=NULL, supprime_par=NULL WHERE id=_devis_id;
  INSERT INTO devis_deletion_log(devis_id,devis_numero,affaire_id,affaire_numero,action,deleted_by,deleted_by_email)
  VALUES(d.id,d.numero,d.affaire_id,(SELECT coalesce(numero::text,code_opportunite) FROM affaires WHERE id=d.affaire_id),
         'restauration',auth.uid(),(SELECT email FROM profiles WHERE id=auth.uid()));
END $function$;

CREATE OR REPLACE FUNCTION public.devis_supprimes_lister()
 RETURNS TABLE(id uuid, numero text, version integer, statut_redaction devis_redaction_statut, affaire_id uuid, affaire_nom text, supprime_le timestamptz, supprime_par_nom text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT d.id, d.numero, d.version, d.statut_redaction, d.affaire_id, a.nom, d.supprime_le,
         (SELECT coalesce(p.full_name,p.email) FROM profiles p WHERE p.id=d.supprime_par)
  FROM devis d LEFT JOIN affaires a ON a.id=d.affaire_id
  WHERE is_admin() AND d.redige_dans_staffing AND NOT d.est_modele
    AND d.supprime_le IS NOT NULL AND d.supprime_le >= now() - interval '30 days'
  ORDER BY d.supprime_le DESC $function$;

CREATE OR REPLACE FUNCTION public.devis_modele_defaut_id()
 RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT id FROM devis WHERE est_modele AND modele_defaut AND modele_actif AND supprime_le IS NULL
    AND (current_user_has_capability('devis.rediger') OR current_user_has_capability('devis.parametres')) LIMIT 1 $function$;

CREATE OR REPLACE FUNCTION public.devis_modele_definir_defaut(_devis_id uuid, _defaut boolean)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM mcp_assert_legacy_oauth_write('devis_modele_definir_defaut');
  IF NOT current_user_has_capability('devis.parametres') THEN RAISE EXCEPTION 'Réservé aux admins' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM devis WHERE id=_devis_id AND est_modele) THEN RAISE EXCEPTION 'Modèle introuvable'; END IF;
  PERFORM set_config('app.devis_rpc','on',true);
  IF _defaut THEN UPDATE devis SET modele_defaut=false WHERE modele_defaut AND id<>_devis_id; END IF;
  UPDATE devis SET modele_defaut=_defaut WHERE id=_devis_id;
END $function$;

CREATE OR REPLACE FUNCTION public.devis_lire_client(_devis_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE d record; v_calc jsonb; v_dates jsonb;
BEGIN
  IF NOT devis_peut_lire(_devis_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO d FROM devis WHERE id=_devis_id;
  v_calc := coalesce(d.totaux_snapshot, devis_calculer_interne(_devis_id));
  v_dates := coalesce(d.dates_snapshot, (SELECT jsonb_build_object('date_opportunite',a.created_at::date,'date_devis',d.date_devis,'date_validite',d.date_validite,
      'date_visite_technique',a.date_visite_technique,'date_montage',a.date_montage,'date_evenement_debut',a.date_evenement_debut,
      'date_evenement_fin',a.date_evenement_fin,'date_demontage',a.date_demontage) FROM affaires a WHERE a.id=d.affaire_id));
  RETURN jsonb_build_object(
    'numero',d.numero,'libelle',d.libelle,'date_devis',d.date_devis,'validite_jours',d.validite_jours,
    'date_validite',coalesce(v_dates->>'date_validite',d.date_validite::text),
    'client',(SELECT jsonb_build_object('nom',nom,'adresse',adresse,'code_postal',code_postal,'ville',ville,'siret',siret,'tva_intracom',tva_intracom) FROM clients WHERE id=d.client_id),
    'client_final',(SELECT nom FROM clients WHERE id=d.client_final_id),
    'contact',(SELECT jsonb_build_object('nom',coalesce(c.prenom||' ','')||coalesce(c.nom,''),'email',c.email) FROM client_contacts c WHERE c.id=d.contact_id),
    'dates', v_dates,
    'lignes',(WITH RECURSIVE anc AS (
        SELECT l.id, l.id AS a FROM devis_lignes l WHERE l.devis_id=_devis_id AND l.supprime_le IS NULL
        UNION ALL
        SELECT anc.id, p.parent_id FROM anc JOIN devis_lignes p ON p.id=anc.a WHERE p.parent_id IS NOT NULL),
      vis AS (SELECT DISTINCT anc.a FROM anc WHERE v_calc->'lignes' ? anc.id::text)
      SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'parent_id',l.parent_id,'type',l.type,'ordre',l.ordre,'libelle',l.libelle,
        'quantite',l.quantite,'descriptif_client',l.descriptif_client,'longueur_mm',l.longueur_mm,'largeur_mm',l.largeur_mm,'hauteur_mm',l.hauteur_mm,
        'finition',l.finition,'texte',l.texte,'montant',(v_calc->'lignes'->>l.id::text)::numeric,'sous_total',(v_calc->'racines'->>l.id::text)::numeric) ORDER BY l.ordre),'[]')
      FROM devis_lignes l WHERE l.devis_id=_devis_id AND l.supprime_le IS NULL AND NOT (l.type='commentaire' AND l.interne)
        AND (l.type='commentaire' OR l.id IN (SELECT vis.a FROM vis))),
    'photos',(SELECT coalesce(jsonb_agg(jsonb_build_object('ligne_id',p.ligne_id,'storage_path',p.storage_path,'thumb_path',p.thumb_path,'legende',p.legende,'mime',p.mime) ORDER BY p.ordre),'[]')
      FROM devis_photos p WHERE p.devis_id=_devis_id AND p.deleted_at IS NULL AND p.visible_client),
    'total_ht',v_calc->'total_ht','remise',coalesce(v_calc->'remise','0'::jsonb),'net_ht',coalesce(v_calc->'net_ht',v_calc->'total_ht'),'tva',v_calc->'tva','tva_pct',v_calc->'tva_pct','ttc',v_calc->'ttc','options_ht',v_calc->'options_ht');
END $function$;

REVOKE ALL ON FUNCTION public.devis_peut_supprimer(uuid), public.devis_supprimer(uuid), public.devis_restaurer(uuid),
  public.devis_supprimes_lister(), public.devis_modele_defaut_id(), public.devis_modele_definir_defaut(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devis_peut_supprimer(uuid), public.devis_supprimer(uuid), public.devis_restaurer(uuid),
  public.devis_supprimes_lister(), public.devis_modele_defaut_id(), public.devis_modele_definir_defaut(uuid,boolean) TO authenticated;