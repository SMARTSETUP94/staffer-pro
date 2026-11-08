# Exports devis — raccordement du lecteur client

## Déjà appliqué et vérifié
- Huit champs facultatifs sur les devis et douze champs sur les paramètres entreprise.
- Adresse officielle enregistrée : **8 avenue du Président Salvador Allende, 94400 Vitry-sur-Seine**.
- SA, capital 40 000 €, APE, SIRET, TVA et règlement confirmés enregistrés.
- Téléphone, IBAN, BIC, logo et CGV restent vides pour Gabin.
- Tests PDF/Excel : 27 passent ; aperçu sans erreur de compilation.

## Redéfinition proposée — accord avant application
Le lecteur client reprendra les mentions, CGV, chemin du logo et conditions de paiement de la fiche entreprise ainsi que les champs facultatifs chantier/signataire. Aucun devis mis à jour. Le signataire vient exclusivement des champs explicitement renseignés : aucune substitution par un auteur technique ou compte générique.

Le lecteur ProGBat appelle déjà ce lecteur client : les mêmes informations y seront disponibles sans changer sa colonne Temps prévu ni ses options.

### SQL complet
```sql
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
    'signataire',CASE WHEN nullif(trim(d.signataire_prenom),'') IS NOT NULL AND nullif(trim(d.signataire_nom),'') IS NOT NULL AND nullif(trim(d.signataire_email),'') IS NOT NULL
      THEN jsonb_build_object('nom',trim(d.signataire_prenom)||' '||trim(d.signataire_nom),'email',d.signataire_email,'telephone',d.signataire_telephone) ELSE NULL END,
    'mentions_legales',(SELECT jsonb_build_object('forme',forme_sociale,'capital',capital_social_euros::text||' €','telephone',telephone,'email',employeur_email_contact,'ape',naf,'tva',tva_intracom,'iban',iban,'bic',bic) FROM parametres_entreprise ORDER BY created_at LIMIT 1),
    'mentions_devis',(SELECT mentions_devis FROM parametres_entreprise ORDER BY created_at LIMIT 1),
    'cgv',(SELECT cgv_devis FROM parametres_entreprise ORDER BY created_at LIMIT 1),
    'logo_storage_path',(SELECT logo_storage_path FROM parametres_entreprise ORDER BY created_at LIMIT 1),
    'reglement',(SELECT jsonb_build_object('mode',mode_reglement,'acompte_pct',acompte_pct,'delai_jours',delai_reglement_jours) FROM parametres_entreprise ORDER BY created_at LIMIT 1),
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
        'finition',l.finition,'texte',l.texte,'option_incluse',l.option_incluse,'montant',(v_calc->'lignes'->>l.id::text)::numeric,'sous_total',(v_calc->'racines'->>l.id::text)::numeric) ORDER BY l.ordre),'[]')
      FROM devis_lignes l WHERE l.devis_id=_devis_id AND l.supprime_le IS NULL AND NOT (l.type='commentaire' AND l.interne)
        AND (l.type='commentaire' OR l.id IN (SELECT vis.a FROM vis))),
    'photos',(SELECT coalesce(jsonb_agg(jsonb_build_object('ligne_id',p.ligne_id,'storage_path',p.storage_path,'thumb_path',p.thumb_path,'legende',p.legende,'mime',p.mime) ORDER BY p.ordre),'[]')
      FROM devis_photos p WHERE p.devis_id=_devis_id AND p.deleted_at IS NULL AND p.visible_client),
    'total_ht',v_calc->'total_ht','remise',coalesce(v_calc->'remise','0'::jsonb),'net_ht',coalesce(v_calc->'net_ht',v_calc->'total_ht'),'tva',v_calc->'tva','tva_pct',v_calc->'tva_pct','ttc',v_calc->'ttc','options_ht',v_calc->'options_ht');
END $function$;
```

## Restant à terminer
- Formulaire paramètres et saisie des champs facultatifs devis (fonction d’édition à présenter séparément avant application).
- Chargement du logo et rendu des conditions de règlement paramétrées.
- Contrôles de validation, captures réelles 9500/9477/6064 et bilan final ; aucune capture finale produite à cette étape.
- Pas de publication, aucune modification automatique d’un devis existant.
