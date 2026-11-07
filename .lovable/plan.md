# Audit des exports devis Staffing (PDF client + Excel ProGBat)

Prioritaire, avant « Qualité des données ». Aucun devis existant n'est modifié et rien n'est publié.

La modification de base du planning logistique (besoins qualifiés, profil « Écran atelier ») reste prête mais **non appliquée** : elle attend toujours votre accord.

## Étape 1 : générer les exports (sans rien enregistrer)
- Les trois devis existent en base : 9500-R1, 9477-R1 et 6064-R1.
- Je produis dans un espace temporaire, avec la même fabrication que l'application, et sans aucun enregistrement dans l'historique des exports :
  - 9500-R1 : PDF détaillé, PDF synthétique et Excel ProGBat ;
  - 9477-R1 et 6064-R1 : PDF détaillé.
- Je fais une capture de chaque page des PDF.
- Je lis l'Excel ligne par ligne : colonnes, titres, descriptifs, chapitres, options, remise.

## Étape 2 : comparer au modèle ProGBat (D-202611-2509, chantier 6068)
Deux tableaux « Élément du modèle | Présent ? | Écart », avec les captures :
- **PDF** :
  - en-tête (logo, n° et date, chantier, adresse, travaux, validité, début et durée, chargé d'affaires) ;
  - blocs émetteur et client, encadré des mentions ;
  - tableau N°/Désignation/U/Qté/PUHT/Total, avec un titre par objet et le descriptif en italique ;
  - livraison ;
  - page des totaux (remise, net HT, TVA, TTC, acompte de 50 %, règlement, signatures) ;
  - pied de page « 1 / N » avec les informations de la société ;
  - conditions générales de vente.
- **Excel** : colonnes attendues par l'import ProGBat, titres et descriptifs, chapitres, options, remise.

## Étape 3 : contrôler les points repérés sur 9500-R1
Chaque point sera noté vérifié ou écart, avec la page concernée :
- bloc client vide (pas d'adresse, de SIRET ni de TVA) ;
- signataire « SMART RESTR » au lieu d'une personne ;
- adresse du chantier, début des travaux et durée absents ;
- titres de Pose / Dépose trop longs ;
- commentaire interne « Pré-chiffrage… » : absent du PDF et de l'Excel ?
- lignes matières à 0 € « prix à confirmer » ;
- aucune heure, aucun taux, aucun coût ni aucune marge dans les deux exports ;
- totaux identiques entre PDF, Excel, fiche de contrôle et calcul (3 403,34 € HT attendus).

## Étape 4 : bilan et plan de corrections
- Je vous remets les deux tableaux d'écarts et les captures.
- Je propose ensuite un **second plan**, à valider par vous, pour corriger le PDF et l'Excel. Pistes probables, à confirmer par l'audit :
  - contrôle bloquant « fiche client incomplète » avant validation et export, avec un lien vers la fiche ;
  - choix d'un signataire nommé (prénom, nom, email) ;
  - champs chantier sur le devis : adresse, début, durée ;
  - titre court + descriptif pour Pose / Dépose / Livraison ;
  - alerte sur les prix à 0 € au moment de la validation ;
  - mise en page alignée sur le modèle ;
  - colonnes Excel conformes à l'import ProGBat.
- Rien n'est corrigé pendant cet audit.

## Feuille de route
L'audit et le lot « Qualité des données » seront ajoutés à la feuille de route au démarrage. L'ordre sera : audit devis, puis Qualité des données.

## Détails techniques
- La fabrication réutilise `src/lib/devis/pdf-client.ts` (données du lecteur client uniquement) et `src/lib/devis/progbat-export.ts`, lancés par un script temporaire avec une session admin en lecture. Le script n'appelle ni l'enregistrement des exports ni le stockage.
- Les captures des pages sont faites en images temporaires, jamais dans Files.
- L'Excel est lu en lecture seule, sans modification.
