CREATE FUNCTION public.devis_modele_enregistrer(_devis_id uuid, _nom text, _categorie text, _description text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s record; v_id uuid;
BEGIN
  PERFORM mcp_assert_legacy_oauth_write('devis_modele_enregistrer');
  IF NOT current_user_has_capability('devis.parametres') THEN RAISE EXCEPTION 'Réservé aux admins' USING ERRCODE='42501'; END IF;
  IF NOT devis_peut_lire(_devis_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF coalesce(trim(_nom),'')='' THEN RAISE EXCEPTION 'Nom du modèle obligatoire'; END IF;
  SELECT * INTO s FROM devis WHERE id=_devis_id;
  PERFORM set_config('app.devis_rpc','on',true);
  INSERT INTO devis(affaire_id,numero,libelle,statut,redige_dans_staffing,version,statut_redaction,est_modele,modele_nom,modele_categorie,
                    modele_description,modele_actif,tva_pct,coef_materiaux_defaut,auteur_id)
  VALUES(NULL,'MODELE-'||left(gen_random_uuid()::text,8),_nom,'brouillon',true,1,'brouillon',true,trim(_nom),NULLIF(trim(_categorie),''),
         NULLIF(trim(_description),''),true,s.tva_pct,s.coef_materiaux_defaut,auth.uid())
  RETURNING id INTO v_id;
  PERFORM devis_copier_sous_arbre(_devis_id, v_id, NULL, NULL, false);
  RETURN v_id;
END $$;

CREATE FUNCTION public.devis_modele_creer_vierge(_nom text, _categorie text, _description text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM mcp_assert_legacy_oauth_write('devis_modele_creer_vierge');
  IF NOT current_user_has_capability('devis.parametres') THEN RAISE EXCEPTION 'Réservé aux admins' USING ERRCODE='42501'; END IF;
  PERFORM set_config('app.devis_rpc','on',true);
  INSERT INTO devis(affaire_id,numero,libelle,statut,redige_dans_staffing,version,statut_redaction,est_modele,modele_nom,modele_categorie,modele_description,
                    tva_pct,coef_materiaux_defaut,auteur_id)
  VALUES(NULL,'MODELE-'||left(gen_random_uuid()::text,8),_nom,'brouillon',true,1,'brouillon',true,trim(_nom),NULLIF(trim(_categorie),''),NULLIF(trim(_description),''),
         (SELECT valeur FROM v_devis_parametres_courants WHERE cle='tva_pct'),coalesce((SELECT valeur FROM v_devis_parametres_courants WHERE cle='coef_materiaux'),1.45),auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE FUNCTION public.devis_modele_activer(_devis_id uuid, _actif boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM mcp_assert_legacy_oauth_write('devis_modele_activer');
  IF NOT current_user_has_capability('devis.parametres') THEN RAISE EXCEPTION 'Réservé aux admins' USING ERRCODE='42501'; END IF;
  PERFORM set_config('app.devis_rpc','on',true);
  UPDATE devis SET modele_actif=_actif, updated_at=now() WHERE id=_devis_id AND est_modele;
END $$;

CREATE FUNCTION public.devis_modeles_lister(_actifs_seulement boolean DEFAULT true)
RETURNS TABLE(id uuid, modele_nom text, modele_categorie text, modele_description text, modele_actif boolean, nb_lignes bigint, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT d.id,d.modele_nom,d.modele_categorie,d.modele_description,d.modele_actif,
    (SELECT count(*) FROM devis_lignes l WHERE l.devis_id=d.id AND l.supprime_le IS NULL), d.updated_at
  FROM devis d WHERE d.est_modele AND (NOT _actifs_seulement OR d.modele_actif)
    AND (current_user_has_capability('devis.rediger') OR current_user_has_capability('devis.parametres'))
  ORDER BY d.modele_categorie NULLS LAST, d.modele_nom $$;

-- Bibliothèque : objets des modèles et des autres devis Staffing
CREATE FUNCTION public.devis_bibliotheque_rechercher(_q text, _limit int DEFAULT 40)
RETURNS TABLE(ligne_id uuid, libelle text, descriptif_client text, quantite numeric, source text, source_est_modele boolean, montant numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_q text := devis_normalize(_q);
BEGIN
  IF NOT (current_user_has_capability('devis.rediger') OR current_user_has_capability('devis.parametres')) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT l.id, l.libelle, l.descriptif_client, l.quantite,
    CASE WHEN d.est_modele THEN 'Modèle '||coalesce(d.modele_nom,'') ELSE d.numero END, d.est_modele,
    ((devis_calculer_interne(d.id))->'lignes'->>l.id::text)::numeric
  FROM devis_lignes l JOIN devis d ON d.id=l.devis_id
  WHERE l.type='objet' AND l.supprime_le IS NULL AND d.redige_dans_staffing AND (NOT d.est_modele OR d.modele_actif)
    AND (v_q='' OR devis_normalize(coalesce(l.libelle,'')||' '||coalesce(l.descriptif_client,'')) LIKE '%'||v_q||'%')
  ORDER BY d.est_modele DESC, l.created_at DESC
  LIMIT least(coalesce(_limit,40),100);
END $$;

CREATE FUNCTION public.devis_objet_inserer(_devis_id uuid, _parent_id uuid, _source_ligne_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_src uuid;
BEGIN
  PERFORM devis_assert_ecriture(_devis_id);
  SELECT devis_id INTO v_src FROM devis_lignes WHERE id=_source_ligne_id AND type='objet' AND supprime_le IS NULL;
  IF v_src IS NULL OR NOT devis_peut_lire(v_src) THEN RAISE EXCEPTION 'Objet source introuvable'; END IF;
  IF _parent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM devis_lignes WHERE id=_parent_id AND devis_id=_devis_id AND supprime_le IS NULL) THEN
    RAISE EXCEPTION 'Parent invalide'; END IF;
  RETURN devis_copier_sous_arbre(v_src, _devis_id, _source_ligne_id, _parent_id, true,
     (SELECT coalesce(max(ordre),0)+1 FROM devis_lignes WHERE devis_id=_devis_id AND parent_id IS NOT DISTINCT FROM _parent_id));
END $$;

REVOKE ALL ON FUNCTION public.devis_modele_enregistrer(uuid,text,text,text), public.devis_modele_creer_vierge(text,text,text),
  public.devis_modele_activer(uuid,boolean), public.devis_modeles_lister(boolean), public.devis_bibliotheque_rechercher(text,int),
  public.devis_objet_inserer(uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devis_modele_enregistrer(uuid,text,text,text), public.devis_modele_creer_vierge(text,text,text),
  public.devis_modele_activer(uuid,boolean), public.devis_modeles_lister(boolean), public.devis_bibliotheque_rechercher(text,int),
  public.devis_objet_inserer(uuid,uuid,uuid) TO authenticated;