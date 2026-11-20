CREATE TABLE public.devis_fiches_journal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  devis_id uuid NOT NULL,
  cible text NOT NULL,
  cible_id uuid NOT NULL,
  action text NOT NULL,
  champs text[] NOT NULL DEFAULT '{}',
  acteur uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.devis_fiches_journal TO authenticated;
GRANT ALL ON public.devis_fiches_journal TO service_role;
ALTER TABLE public.devis_fiches_journal ENABLE ROW LEVEL SECURITY;
CREATE POLICY devis_fiches_journal_admin_lecture ON public.devis_fiches_journal FOR SELECT TO authenticated USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.devis_charges_affaires_choix(_devis_id uuid)
RETURNS TABLE(id uuid, prenom text, nom text, habituel boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT e.id, e.prenom, e.nom,
    (e.profile_id IS NOT NULL AND EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id=e.profile_id
       AND ur.role IN ('admin','commercial','bureau_etude','chef_chantier'))) AS habituel
  FROM employes e
  WHERE e.actif
    AND EXISTS (SELECT 1 FROM devis d WHERE d.id=_devis_id AND d.supprime_le IS NULL
                AND user_can_write_affaire(d.affaire_id,'affaires.edit'))
  ORDER BY 4 DESC, e.nom, e.prenom $$;
REVOKE ALL ON FUNCTION public.devis_charges_affaires_choix(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devis_charges_affaires_choix(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.devis_charge_affaires_actuel(_devis_id uuid)
RETURNS TABLE(employe_id uuid, prenom text, nom text, peut_modifier boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT e.id, e.prenom, e.nom, user_can_write_affaire(d.affaire_id,'affaires.edit')
  FROM devis d JOIN affaire_roles r ON r.affaire_id=d.affaire_id AND r.role='charge_affaires'
  JOIN employes e ON e.id=r.employe_id
  WHERE d.id=_devis_id AND devis_peut_lire(_devis_id) $$;
REVOKE ALL ON FUNCTION public.devis_charge_affaires_actuel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devis_charge_affaires_actuel(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.devis_assert_fiches_completables(_devis_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM mcp_assert_legacy_oauth_write('devis');
  IF NOT devis_peut_ecrire(_devis_id) THEN
    RAISE EXCEPTION 'Droits insuffisants sur ce devis' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM devis WHERE id=_devis_id
                 AND coalesce(statut_redaction,'brouillon') IN ('brouillon','a_valider','valide')) THEN
    RAISE EXCEPTION 'Devis transféré, signé ou remplacé : lecture seule' USING ERRCODE='P0001'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.devis_assert_fiches_completables(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.devis_client_completer(_devis_id uuid, _patch jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_client uuid;
BEGIN
  PERFORM devis_assert_fiches_completables(_devis_id);
  SELECT client_id INTO v_client FROM devis WHERE id=_devis_id;
  IF v_client IS NULL THEN RAISE EXCEPTION 'Aucun client facturé sur ce devis'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(_patch) k
             WHERE k NOT IN ('adresse','code_postal','ville','siret','tva_intracom','email')) THEN
    RAISE EXCEPTION 'Champ non autorisé'; END IF;
  UPDATE clients SET
    adresse      = CASE WHEN _patch ? 'adresse'      THEN NULLIF(trim(_patch->>'adresse'),'')      ELSE adresse END,
    code_postal  = CASE WHEN _patch ? 'code_postal'  THEN NULLIF(trim(_patch->>'code_postal'),'')  ELSE code_postal END,
    ville        = CASE WHEN _patch ? 'ville'        THEN NULLIF(trim(_patch->>'ville'),'')        ELSE ville END,
    siret        = CASE WHEN _patch ? 'siret'        THEN NULLIF(regexp_replace(_patch->>'siret','\s','','g'),'') ELSE siret END,
    tva_intracom = CASE WHEN _patch ? 'tva_intracom' THEN NULLIF(upper(regexp_replace(_patch->>'tva_intracom','\s','','g')),'') ELSE tva_intracom END,
    email        = CASE WHEN _patch ? 'email'        THEN NULLIF(trim(_patch->>'email'),'')        ELSE email END,
    updated_at = now()
  WHERE id=v_client;
  INSERT INTO devis_fiches_journal(devis_id,cible,cible_id,action,champs)
  VALUES (_devis_id,'client',v_client,'complement',ARRAY(SELECT jsonb_object_keys(_patch)));
END $$;
REVOKE ALL ON FUNCTION public.devis_client_completer(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devis_client_completer(uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.devis_contact_creer(_devis_id uuid, _prenom text, _nom text, _email text, _telephone text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_client uuid; v_statut text; v_id uuid;
BEGIN
  PERFORM devis_assert_fiches_completables(_devis_id);
  SELECT client_id, coalesce(statut_redaction,'brouillon') INTO v_client, v_statut FROM devis WHERE id=_devis_id;
  IF v_client IS NULL THEN RAISE EXCEPTION 'Aucun client facturé sur ce devis'; END IF;
  IF NULLIF(trim(_nom),'') IS NULL AND NULLIF(trim(_email),'') IS NULL THEN
    RAISE EXCEPTION 'Nom ou e-mail obligatoire'; END IF;
  INSERT INTO client_contacts(client_id, prenom, nom, email, telephone, actif)
  VALUES (v_client, NULLIF(trim(_prenom),''), NULLIF(trim(_nom),''), NULLIF(trim(_email),''), NULLIF(trim(_telephone),''), true)
  RETURNING id INTO v_id;
  IF v_statut='brouillon' THEN
    PERFORM set_config('app.devis_rpc','on',true);
    UPDATE devis SET contact_id=v_id, updated_at=now() WHERE id=_devis_id;
  END IF;
  INSERT INTO devis_fiches_journal(devis_id,cible,cible_id,action,champs)
  VALUES (_devis_id,'contact',v_id,'creation',ARRAY['prenom','nom','email','telephone']);
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.devis_contact_creer(uuid,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devis_contact_creer(uuid,text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.devis_contact_completer(_devis_id uuid, _contact_id uuid, _patch jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM devis_assert_fiches_completables(_devis_id);
  IF NOT EXISTS (SELECT 1 FROM client_contacts c JOIN devis d ON d.client_id=c.client_id
                 WHERE d.id=_devis_id AND c.id=_contact_id) THEN
    RAISE EXCEPTION 'Ce contact n''appartient pas au client facturé'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(_patch) k WHERE k NOT IN ('prenom','nom','email','telephone')) THEN
    RAISE EXCEPTION 'Champ non autorisé'; END IF;
  UPDATE client_contacts SET
    prenom    = CASE WHEN _patch ? 'prenom'    THEN NULLIF(trim(_patch->>'prenom'),'')    ELSE prenom END,
    nom       = CASE WHEN _patch ? 'nom'       THEN NULLIF(trim(_patch->>'nom'),'')       ELSE nom END,
    email     = CASE WHEN _patch ? 'email'     THEN NULLIF(trim(_patch->>'email'),'')     ELSE email END,
    telephone = CASE WHEN _patch ? 'telephone' THEN NULLIF(trim(_patch->>'telephone'),'') ELSE telephone END,
    updated_at = now()
  WHERE id=_contact_id;
  INSERT INTO devis_fiches_journal(devis_id,cible,cible_id,action,champs)
  VALUES (_devis_id,'contact',_contact_id,'complement',ARRAY(SELECT jsonb_object_keys(_patch)));
END $$;
REVOKE ALL ON FUNCTION public.devis_contact_completer(uuid,uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devis_contact_completer(uuid,uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.devis_contacts_client(_devis_id uuid)
RETURNS TABLE(id uuid, prenom text, nom text, email text, telephone text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH voit AS (SELECT devis_peut_ecrire(_devis_id) OR user_has_cap('clients.view') AS ok)
  SELECT c.id, c.prenom, c.nom,
    CASE WHEN voit.ok THEN c.email END, CASE WHEN voit.ok THEN c.telephone END
  FROM client_contacts c JOIN devis d ON d.client_id=c.client_id, voit
  WHERE d.id=_devis_id AND c.actif AND devis_peut_lire(_devis_id)
  ORDER BY c.nom NULLS LAST, c.email $$;
REVOKE ALL ON FUNCTION public.devis_contacts_client(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devis_contacts_client(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.devis_lire_client(_devis_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
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
    'id',d.id,'version',d.version,'statut_redaction',d.statut_redaction,
    'numero',d.numero,'libelle',d.libelle,'date_devis',d.date_devis,'validite_jours',d.validite_jours,
    'date_validite',coalesce(v_dates->>'date_validite',d.date_validite::text),
    'societe',(SELECT jsonb_build_object('raison_sociale',raison_sociale,'marque',marque_commerciale,'adresse',adresse_ligne1,'code_postal',code_postal,'ville',ville,'siret',siret,'email',employeur_email_contact) FROM parametres_entreprise ORDER BY created_at LIMIT 1),
    'chantier',jsonb_build_object('adresse',d.chantier_adresse,'travaux',d.travaux_libelle,'debut',d.travaux_debut,'duree_jours',d.travaux_duree_jours),
    'signataire',CASE WHEN nullif(trim(d.signataire_prenom),'') IS NOT NULL AND nullif(trim(d.signataire_nom),'') IS NOT NULL AND nullif(trim(d.signataire_email),'') IS NOT NULL THEN jsonb_build_object('nom',trim(d.signataire_prenom)||' '||trim(d.signataire_nom),'email',d.signataire_email,'telephone',d.signataire_telephone) ELSE NULL END,
    'mentions_legales',(SELECT jsonb_build_object('forme',forme_sociale,'capital',capital_social_euros::text||' €','telephone',telephone,'email',employeur_email_contact,'ape',naf,'tva',tva_intracom,'iban',iban,'bic',bic) FROM parametres_entreprise ORDER BY created_at LIMIT 1),
    'mentions_devis',(SELECT mentions_devis FROM parametres_entreprise ORDER BY created_at LIMIT 1),
    'cgv',(SELECT cgv_devis FROM parametres_entreprise ORDER BY created_at LIMIT 1),
    'logo_storage_path',(SELECT logo_storage_path FROM parametres_entreprise ORDER BY created_at LIMIT 1),
    'reglement',(SELECT jsonb_build_object('mode',mode_reglement,'acompte_pct',acompte_pct,'delai_jours',delai_reglement_jours) FROM parametres_entreprise ORDER BY created_at LIMIT 1),
    'client',(SELECT jsonb_build_object('nom',nom,'adresse',adresse,'code_postal',code_postal,'ville',ville,'siret',siret,'tva_intracom',tva_intracom) FROM clients WHERE id=d.client_id),
    'client_final',(SELECT nom FROM clients WHERE id=d.client_final_id),
    'interlocuteur',(SELECT jsonb_build_object('nom',trim(coalesce(e.prenom,'')||' '||coalesce(e.nom,'')),
        'email',CASE WHEN lower(p.email) LIKE '%@setup.paris' THEN lower(p.email) WHEN lower(e.email) LIKE '%@setup.paris' THEN lower(e.email) END)
      FROM affaire_roles r JOIN employes e ON e.id=r.employe_id LEFT JOIN profiles p ON p.id=e.profile_id
      WHERE r.affaire_id=d.affaire_id AND r.role='charge_affaires' LIMIT 1),
    'contact',(SELECT jsonb_build_object('nom',coalesce(c.prenom||' ','')||coalesce(c.nom,''),'email',c.email) FROM client_contacts c WHERE c.id=d.contact_id),
    'dates', v_dates,
    'lignes',(WITH RECURSIVE anc AS (
        SELECT l.id, l.id AS a FROM devis_lignes l WHERE l.devis_id=_devis_id AND l.supprime_le IS NULL
        UNION ALL SELECT anc.id, p.parent_id FROM anc JOIN devis_lignes p ON p.id=anc.a WHERE p.parent_id IS NOT NULL),
      vis AS (SELECT DISTINCT anc.a FROM anc WHERE v_calc->'lignes' ? anc.id::text)
      SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'parent_id',l.parent_id,'type',l.type,'ordre',l.ordre,'libelle',l.libelle,
        'quantite',l.quantite,'descriptif_client',l.descriptif_client,'longueur_mm',l.longueur_mm,'largeur_mm',l.largeur_mm,'hauteur_mm',l.hauteur_mm,
        'finition',l.finition,'texte',l.texte,'option_incluse',l.option_incluse,'montant',(v_calc->'lignes'->>l.id::text)::numeric,'sous_total',(v_calc->'racines'->>l.id::text)::numeric) ORDER BY l.ordre),'[]')
      FROM devis_lignes l WHERE l.devis_id=_devis_id AND l.supprime_le IS NULL AND NOT (l.type='commentaire' AND l.interne) AND (l.type='commentaire' OR l.id IN (SELECT vis.a FROM vis))),
    'photos',(SELECT coalesce(jsonb_agg(jsonb_build_object('ligne_id',p.ligne_id,'storage_path',p.storage_path,'thumb_path',p.thumb_path,'legende',p.legende,'mime',p.mime) ORDER BY p.ordre),'[]') FROM devis_photos p WHERE p.devis_id=_devis_id AND p.deleted_at IS NULL AND p.visible_client),
    'total_ht',v_calc->'total_ht','remise',coalesce(v_calc->'remise','0'::jsonb),'net_ht',coalesce(v_calc->'net_ht',v_calc->'total_ht'),'tva',v_calc->'tva','tva_pct',v_calc->'tva_pct','ttc',v_calc->'ttc','options_ht',v_calc->'options_ht');
END $function$;