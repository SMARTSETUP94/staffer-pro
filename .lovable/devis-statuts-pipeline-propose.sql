-- PROPOSITION : non appliquée. Aucun devis/opportunité historique modifié.
-- Cinq statuts visibles ; enum historique conservé pour compatibilité.
-- Le brouillon laisse À faire ; finalisation fait avancer À l'étude ; envoi conserve Envoyé.
-- Aucune rétrogradation de Presque gagné/Envoyé, aucune signature automatique.
-- Soumission Claude : note conservée sans finalisation ni état intermédiaire.

CREATE OR REPLACE FUNCTION public.devis_creer(_affaire_id uuid, _modele_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE a record; v_version int; v_id uuid;
BEGIN
  PERFORM mcp_assert_legacy_oauth_write('devis_creer');
  IF NOT user_can_write_affaire(_affaire_id,'devis.rediger') THEN RAISE EXCEPTION 'Droits insuffisants' USING ERRCODE='42501'; END IF;
  IF _modele_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM devis WHERE id=_modele_id AND est_modele AND modele_actif) THEN
    RAISE EXCEPTION 'Modèle introuvable ou inactif'; END IF;
  SELECT * INTO a FROM affaires WHERE id=_affaire_id;
  PERFORM pg_advisory_xact_lock(hashtext('devis_version:'||_affaire_id::text));
  SELECT coalesce(max(version),0)+1 INTO v_version FROM devis WHERE affaire_id=_affaire_id AND redige_dans_staffing AND NOT est_modele;
  PERFORM set_config('app.devis_rpc','on',true);
  INSERT INTO devis(affaire_id,numero,libelle,statut,redige_dans_staffing,version,statut_redaction,client_id,contact_id,date_devis,
                    validite_jours,tva_pct,coef_materiaux_defaut,modele_origine_id,auteur_id)
  VALUES(_affaire_id, coalesce(a.numero,a.code_opportunite,'?')||'-R'||v_version, a.nom, 'brouillon', true, v_version, 'brouillon',
         a.client_id, a.client_contact_id, current_date,
         (SELECT valeur FROM v_devis_parametres_courants WHERE cle='validite_jours')::int,
         (SELECT valeur FROM v_devis_parametres_courants WHERE cle='tva_pct'),
         coalesce((SELECT valeur FROM v_devis_parametres_courants WHERE cle='coef_materiaux'),1.45),
         _modele_id, auth.uid())
  RETURNING id INTO v_id;
  IF _modele_id IS NOT NULL THEN PERFORM devis_copier_sous_arbre(_modele_id, v_id, NULL, NULL, true); END IF;
  -- Un devis brouillon ne fait plus avancer l'opportunité à l'étude.
  RETURN v_id;
END $function$;
REVOKE EXECUTE ON FUNCTION public.devis_creer(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devis_creer(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.devis_statut_changer(_devis_id uuid, _statut devis_redaction_statut)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE d record; v_calc jsonb; v_sans_prix text;
BEGIN
  PERFORM devis_assert_ecriture(_devis_id, false);
  SELECT * INTO d FROM devis WHERE id=_devis_id FOR UPDATE;
  IF d.est_modele THEN RAISE EXCEPTION 'Un modèle n''a pas de statut'; END IF;
  IF _statut='a_valider' AND d.statut_redaction='brouillon' THEN
    -- Compatibilité des anciens clients : l'état intermédiaire n'est plus créé.
    RETURN;
  ELSIF _statut='brouillon' AND d.statut_redaction='a_valider' THEN
    UPDATE devis SET statut_redaction='brouillon', updated_at=now() WHERE id=_devis_id;
  ELSIF _statut='valide' AND d.statut_redaction IN ('brouillon','a_valider') THEN
    IF NOT devis_peut_valider(_devis_id) THEN RAISE EXCEPTION 'Validation réservée au chargé d''affaires de l''affaire ou à un admin' USING ERRCODE='42501'; END IF;
    SELECT string_agg(DISTINCT f.designation, ', ') INTO v_sans_prix
      FROM devis_lignes_libres f JOIN devis_lignes l ON l.id=f.ligne_id
     WHERE l.devis_id=_devis_id AND l.supprime_le IS NULL AND f.supprime_le IS NULL
       AND (f.categorie='forfait' OR f.forfait_cle IS NOT NULL) AND f.quantite>0 AND f.prix_forfait IS NULL;
    IF v_sans_prix IS NOT NULL THEN
      RAISE EXCEPTION 'Validation impossible : prix de vente à saisir pour le forfait %', v_sans_prix;
    END IF;
    v_calc := devis_calculer_interne(_devis_id);
    INSERT INTO devis_snapshot_couts(devis_id, cout_total, marge, fige_le, detail)
      VALUES (_devis_id, (v_calc->>'cout_total')::numeric, v_calc->'marge', now(),
              jsonb_build_object('decomposition',v_calc->'decomposition','marge_pct',v_calc->'marge_pct',
                                 'cout_complet',v_calc->'cout_complet','couts_manquants',v_calc->'couts_manquants','net_ht',v_calc->'net_ht'))
      ON CONFLICT (devis_id) DO UPDATE SET cout_total=EXCLUDED.cout_total, marge=EXCLUDED.marge, fige_le=EXCLUDED.fige_le, detail=EXCLUDED.detail;
    UPDATE devis SET statut_redaction='valide', valide_par=auth.uid(), valide_le=now(),
      totaux_snapshot=v_calc - 'cout_total' - 'marge' - 'cout_complet' - 'marge_pct' - 'decomposition' - 'couts_manquants',
      montant_ht=coalesce((v_calc->>'net_ht')::numeric,(v_calc->>'total_ht')::numeric),
      dates_snapshot=(SELECT jsonb_build_object('date_opportunite',a.created_at::date,'date_devis',d.date_devis,'date_validite',d.date_validite,
         'date_visite_technique',a.date_visite_technique,'date_montage',a.date_montage,'date_evenement_debut',a.date_evenement_debut,
         'date_evenement_fin',a.date_evenement_fin,'date_demontage',a.date_demontage) FROM affaires a WHERE a.id=d.affaire_id),
      updated_at=now()
    WHERE id=_devis_id;
    PERFORM devis_opp_avancer(d.affaire_id, 'a_l_etude',
      'Devis finalisé (' || d.numero || ')');
  ELSIF _statut='refuse' AND d.statut_redaction IN ('a_valider','valide','transfere') THEN
    IF auth.jwt()->>'client_id' IS NOT NULL THEN RAISE EXCEPTION 'Refus réservé à l''application' USING ERRCODE='42501'; END IF;
    IF NOT devis_peut_valider(_devis_id) THEN RAISE EXCEPTION 'Droits insuffisants' USING ERRCODE='42501'; END IF;
    UPDATE devis SET statut_redaction='refuse', updated_at=now() WHERE id=_devis_id;
  ELSE
    RAISE EXCEPTION 'Transition non autorisée : % → %', d.statut_redaction, _statut;
  END IF;
END $function$;
REVOKE EXECUTE ON FUNCTION public.devis_statut_changer(uuid, public.devis_redaction_statut) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devis_statut_changer(uuid, public.devis_redaction_statut) TO authenticated;

CREATE OR REPLACE FUNCTION public.devis_soumettre(_devis_id uuid, _note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM devis_assert_ecriture(_devis_id);
  PERFORM set_config('app.devis_rpc','on',true);
  PERFORM devis_note_fusionner(_devis_id, _note);
  RETURN jsonb_build_object('devis_id',_devis_id,'statut_redaction','brouillon');
END $function$;
REVOKE EXECUTE ON FUNCTION public.devis_soumettre(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devis_soumettre(uuid, text) TO authenticated;

