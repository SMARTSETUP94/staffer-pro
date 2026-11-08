# Logo entreprise et avertissements PDF

## Résultat
- Paramètres > Devis : remplacer le chemin du logo par « Ajouter un logo », aperçu, « Remplacer » et « Retirer ».
- Accepter PNG, JPG et SVG ; convertir les SVG en PNG après vérification pour un rendu PDF fiable. Stockage privé existant, aucune nouvelle table.
- Afficher avant l’export PDF un bandeau non bloquant listant les éléments manquants : signataire nommé et email, logo, IBAN, BIC, CGV. Lien vers les paramètres et, pour le signataire, la fiche du devis. Même contrôle depuis la fenêtre d’envoi.
- Aucun devis existant modifié, aucune publication.

## Protection admin et SQL avant application
Le stockage privé `devis-photos` existe. Sa règle actuelle permet aux rédacteurs de devis de téléverser des images. Il faut limiter le dossier du logo à l’admin sans changer les droits sur les photos des objets.

```sql
CREATE POLICY devis_logo_insert_admin
ON storage.objects AS RESTRICTIVE
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id <> 'devis-photos'
  OR name NOT LIKE 'entreprise-logo/%'
  OR public.has_role(auth.uid(), 'admin')
);
```

Les remplacements créent un nouveau fichier à nom unique et changent seulement le logo des paramètres entreprise. Retirer le logo efface son association, pas le fichier historique. Aucun droit de suppression ou d’écrasement ajouté ; aucune suppression physique.

Cette règle sera appliquée après votre accord. Les autres règles existantes continuent de protéger les lectures et la modification des paramètres entreprise.

## Vérifications
- PNG/JPG/SVG : validation, aperçu, remplacement/retrait et lecture du logo dans le PDF.
- Formats non autorisés et SVG contenant scripts ou liens externes refusés.
- Avertissements complets ou absents selon les champs, sans empêcher la génération.
- Écran à 390 et 1366 px ; export testé sans modifier les devis existants.

## Suite déjà approuvée
Les actions admin Qualité des données sont déjà appliquées sans « Classer sans suite » ni écriture contrat/rémunération. « Auto-entrepreneur » existe ; « Intermittent » historique est conservé en base mais masqué dans les choix. La page Qualité et son widget restent à livrer après ce lot.

## Détails techniques
- Composant de téléversement isolé et helper de validation/rastérisation exécuté uniquement dans le navigateur.
- Helper pur pour les avertissements PDF avec tests de règles métier.
- Réutiliser le lecteur client existant et les liens temporaires du stockage privé ; aucune adresse publique du logo.