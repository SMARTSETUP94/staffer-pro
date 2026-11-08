# Exports devis — champs chantier et signataire dans l’éditeur

Le lecteur PDF approuvé est appliqué et vérifié. Le PDF reprend désormais les paramètres de règlement ; 31 tests PDF/Excel passent. Aucun devis existant modifié, rien publié.

## Modification proposée avant application
La fonction d’édition existante conserve sa vérification des droits et son comportement, avec huit champs facultatifs supplémentaires explicitement autorisés. Aucune exécution sur les devis existants. Les dates, adresse et signataire resteront vides tant qu’un humain ne les saisit pas.

```sql
CREATE OR REPLACE FUNCTION public.devis_entete_modifier(_devis_id uuid, _patch jsonb, _maj_affaire_client boolean DEFAULT false)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE d record;
BEGIN
  PERFORM devis_assert_ecriture(_devis_id);
  IF _patch ? 'contact_id' AND NULLIF(_patch->>'contact_id','') IS NOT NULL AND NOT EXISTS (
     SELECT 1 FROM client_contacts WHERE id=(_patch->>'contact_id')::uuid AND client_id=coalesce(NULLIF(_patch->>'client_id','')::uuid,(SELECT client_id FROM devis WHERE id=_devis_id))) THEN
    RAISE EXCEPTION 'Ce contact n''appartient pas au client facturé'; END IF;
  UPDATE devis SET
    client_id = CASE WHEN _patch ? 'client_id' THEN NULLIF(_patch->>'client_id','')::uuid ELSE client_id END,
    contact_id = CASE WHEN _patch ? 'contact_id' THEN NULLIF(_patch->>'contact_id','')::uuid
                      WHEN _patch ? 'client_id' AND NULLIF(_patch->>'client_id','')::uuid IS DISTINCT FROM client_id THEN NULL ELSE contact_id END,
    client_final_id = CASE WHEN _patch ? 'client_final_id' THEN NULLIF(_patch->>'client_final_id','')::uuid ELSE client_final_id END,
    date_devis = CASE WHEN _patch ? 'date_devis' THEN coalesce(NULLIF(_patch->>'date_devis','')::date,current_date) ELSE date_devis END,
    date_validite = CASE WHEN _patch ? 'date_validite' THEN NULLIF(_patch->>'date_validite','')::date ELSE date_validite END,
    date_validite_manuelle = CASE WHEN _patch ? 'date_validite' THEN NULLIF(_patch->>'date_validite','') IS NOT NULL ELSE date_validite_manuelle END,
    numero_progbat = CASE WHEN _patch ? 'numero_progbat' THEN NULLIF(_patch->>'numero_progbat','') ELSE numero_progbat END,
    libelle = CASE WHEN _patch ? 'libelle' THEN _patch->>'libelle' ELSE libelle END,
    coef_materiaux_defaut = CASE WHEN _patch ? 'coef_materiaux_defaut' THEN (_patch->>'coef_materiaux_defaut')::numeric ELSE coef_materiaux_defaut END,
    validite_jours = CASE WHEN _patch ? 'validite_jours' THEN (_patch->>'validite_jours')::int ELSE validite_jours END,
    modele_nom = CASE WHEN est_modele AND _patch ? 'modele_nom' THEN _patch->>'modele_nom' ELSE modele_nom END,
    modele_categorie = CASE WHEN est_modele AND _patch ? 'modele_categorie' THEN _patch->>'modele_categorie' ELSE modele_categorie END,
    modele_description = CASE WHEN est_modele AND _patch ? 'modele_description' THEN _patch->>'modele_description' ELSE modele_description END,
    chantier_adresse = CASE WHEN _patch ? 'chantier_adresse' THEN NULLIF(_patch->>'chantier_adresse','')::text ELSE chantier_adresse END,
    travaux_libelle = CASE WHEN _patch ? 'travaux_libelle' THEN NULLIF(_patch->>'travaux_libelle','')::text ELSE travaux_libelle END,
    travaux_debut = CASE WHEN _patch ? 'travaux_debut' THEN NULLIF(_patch->>'travaux_debut','')::date ELSE travaux_debut END,
    travaux_duree_jours = CASE WHEN _patch ? 'travaux_duree_jours' THEN NULLIF(_patch->>'travaux_duree_jours','')::integer ELSE travaux_duree_jours END,
    signataire_prenom = CASE WHEN _patch ? 'signataire_prenom' THEN NULLIF(_patch->>'signataire_prenom','')::text ELSE signataire_prenom END,
    signataire_nom = CASE WHEN _patch ? 'signataire_nom' THEN NULLIF(_patch->>'signataire_nom','')::text ELSE signataire_nom END,
    signataire_email = CASE WHEN _patch ? 'signataire_email' THEN NULLIF(_patch->>'signataire_email','')::text ELSE signataire_email END,
    signataire_telephone = CASE WHEN _patch ? 'signataire_telephone' THEN NULLIF(_patch->>'signataire_telephone','')::text ELSE signataire_telephone END,
    updated_at = now()
  WHERE id=_devis_id RETURNING * INTO d;
  IF _maj_affaire_client AND d.affaire_id IS NOT NULL THEN
    UPDATE affaires SET client_id=d.client_id, client_contact_id=d.contact_id, updated_at=now() WHERE id=d.affaire_id;
  END IF;
END $function$;

```

## Après accord
- Ajouter la saisie des champs chantier/signataire à l’éditeur, sans remplissage automatique ni compte générique.
- Ajouter le formulaire paramètres pour le téléphone, IBAN, BIC, logo et CGV : valeurs saisies par Gabin, jamais demandées dans le chat.
- Poursuivre les contrôles et captures avant/après réelles de 9500/9477/6064 ; le bilan final n’est pas encore produit.
