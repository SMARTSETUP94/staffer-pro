# Corrections des exports devis Staffing (PDF client + Excel ProGBat)

Ce plan fait suite à l'audit du 7/11 sur les devis 9500-R1, 9477-R1 et 6064-R1. Aucun devis existant n'est modifié et rien n'est publié.

## Résultat de l'audit — PDF (référence : modèle D-202611-2509)

| Élément du modèle | Dans le PDF Staffing ? | Écart |
|---|---|---|
| Logo SET UP « constructeur d'imaginaire » | Non | Texte « SET UP PARIS » sans logo |
| Devis n° … du jj/mm/aaaa | Partiel | « DEVIS 9500-R1 » + « Date du devis » sur deux lignes |
| Chantier : code_nom | Partiel | Titre du devis à gauche, sans libellé « Chantier » |
| Adresse du chantier | Non | Champ inexistant |
| Travaux : Fabrication décor | Non | — |
| Validité du devis | Oui | Écrit « Valable jusqu'au » |
| Début des travaux + N jours | Non | Seule la date d'événement est affichée |
| Chargé d'affaires (Prénom Nom - email) | Non | Affiche l'email société (edwige.a@…). Le chargé de 9500 est « Gabin C / smart@ », un compte générique |
| Bloc émetteur Smart Restructuring / SET UP / Vitry | Oui | SIRET affiché ici au lieu du pied de page |
| Bloc client grisé : adresse, CP, ville, pays, TVA | Partiel | Nom et contact seulement. 9500 n'a ni adresse, ni SIRET, ni TVA : aucun contrôle ne le signale |
| Encadré des mentions (non forfaitaire, éclairage, feu, options) | Non | Deux phrases courtes en bas de page |
| Colonnes N° / Désignation / U / Qté / PUHT / Total | Partiel | Pas de N°, pas d'unité |
| Ligne titre par objet (fond bleu) + descriptif en italique | Partiel | Titre en gras, descriptif non italique. Les dimensions apparaissent deux fois (« 1200 × 500 × 2100 mm », puis « Dimensions : … ») |
| Livraison : titre court + descriptif | Non | Le long libellé de chapitre sert de titre, en majuscules sur 2 lignes |
| Montant forfaitaire des chapitres | Non | 9477 Pose 561 € : seuls les « Livreurs » 300 € sont détaillés, les 261 € de forfait n'ont pas de ligne. Même chose pour 6064 (Suivi 5 252 €, Pose 19 946 €) |
| Options hors total | Erreur | 9477 : le sous-total de la zone (5 601,47 €) inclut l'option de 2 282 €, alors que le Total HT l'exclut. Les chiffres de la page ne s'additionnent pas |
| Encadré des totaux (Total HT, Remise, Net HT, TVA, TTC) | Partiel | Pas de remise ni de net HT (aucune remise sur ces 3 devis) |
| Tableau % TVA / Base / Total TVA | Non | — |
| Règlement : virement, pénalités, indemnité 40 €, délai 30 jours | Non | — |
| « 50 % à la signature, soit X EUR TTC » | Partiel | « Acompte de 50 % » sans montant |
| Deux cadres de signature (Client avec rappel « lu et approuvé », Entreprise) | Partiel | Un seul cadre « Bon pour accord » |
| Pied de page société (forme, capital, tél, APE, SIRET, TVA, IBAN/BIC) | Non | Seulement « Devis 9500-R1 — page 1/1 » |
| Conditions générales de vente | Non | — |
| Filigrane « PROJET » sur brouillon | Oui | 9477 et 6064 ; 9500 validé sans filigrane |
| Synthétique | Partiel | Le prix unitaire et le total de la ligne objet sont vides |

## Résultat de l'audit — Excel ProGBat (9500-R1)

| Élément attendu | Présent ? | Écart |
|---|---|---|
| Colonnes N° / Désignation / Quantité / Unité / Prix unitaire / Temps prévu | Oui | « Temps prévu » contient les heures (36, 3, 6, 4) : à confirmer, voir question 1 |
| Titres de chapitre (1, 2, 3, 4) | Oui | Les titres 3 et 4 reprennent le long libellé de Pose / Dépose, répété mot pour mot sur leur ligne de prix |
| Descriptif sous l'objet | Oui | Dimensions en double, comme dans le PDF |
| Options | Sans objet ici | Aucune option sur 9500. Réglage manuel dans ProGBat prévu par les consignes |
| Remise | Sans objet ici | Réglage manuel prévu par les consignes |
| Total du fichier = Total HT | Oui | 3 403,34 € dans le fichier, sur la fiche de contrôle, dans le calcul et dans le PDF |

## Points demandés sur 9500-R1

| Point | Constat |
|---|---|
| Bloc client vide | Confirmé : nom seul, aucun contrôle |
| Signataire générique | Le PDF n'affiche aucun chargé d'affaires, seulement l'email société |
| Adresse chantier, début et durée | Absents |
| Titres Pose / Dépose trop longs | Confirmé (PDF et Excel) |
| Commentaire « Pré-chiffrage… » | Absent du PDF et de l'Excel (vérifié) |
| Matières à 0 € « prix à confirmer » | 2 lignes (roulettes, tringle/quincaillerie) dans ce devis validé, sans alerte |
| Heures, taux, coûts, marge | Absents du PDF. Seules les heures sont dans l'Excel (colonne Temps prévu) |
| Totaux | Identiques partout : 3 403,34 € HT, 4 084,01 € TTC |

## Corrections proposées

**1. Contrôles avant validation et export** (bloquants sauf mention contraire)
- Fiche client incomplète (adresse, CP, ville, SIRET ou TVA manquant) : export refusé, lien direct vers la fiche client.
- Signataire obligatoire : une personne nommée (prénom, nom, email), choisie dans l'éditeur. Par défaut, le chargé d'affaires, sauf s'il s'agit d'un compte générique.
- Matières à 0 € ou « prix à confirmer » : alerte à la validation, confirmation explicite demandée (non bloquant).

**2. Informations chantier sur le devis**
- Ajout de trois champs : adresse du chantier, date de début des travaux, durée en jours.
- Ajout d'un champ « Travaux », par défaut « Fabrication décor ».
- Les trois sont modifiables dans l'en-tête de l'éditeur.

**3. PDF au niveau du modèle**
- En-tête :
  - logo SET UP ;
  - « Devis n° … du … », « Chantier : … », adresse du chantier, Travaux, Validité, « Début des travaux le … N jours » ;
  - signataire « Prénom Nom - email ».
- Bloc client grisé complet : raison sociale, adresse, CP, ville, pays, « T.V.A. : … ».
- Encadré des mentions du modèle :
  - « non forfaitaire » ;
  - éclairage non inclus ;
  - décor non classé résistant au feu ;
  - options non comprises dans le total.
- Tableau N° / Désignation / U / Qté / PUHT / Total H.T. :
  - titre d'objet sur fond bleu ;
  - descriptif en italique, dimensions une seule fois.
- Chapitres Pose / Dépose / Livraison :
  - titre court (« Livraison », « Pose », « Dépose », ou le titre court saisi) ;
  - le long libellé passe en descriptif ;
  - le forfait du chapitre devient une ligne visible, pour que les lignes s'additionnent.
- Options : affichées « en option, non comprises dans le total », et exclues des sous-totaux.
- Page des totaux :
  - Total HT, Remise, Net HT, TVA, TTC ;
  - tableau des taux de TVA ;
  - virement, pénalités, indemnité de 40 €, délai de 30 jours ;
  - « 50 % à la signature, soit X EUR TTC » ;
  - deux cadres de signature.
- Pied de page sur chaque page : informations société, numéro du devis et « 1 / N ».
- Dernière page : conditions générales de vente.
- Synthétique : prix unitaire et total renseignés sur chaque ligne d'objet.

**4. Excel ProGBat importable sans retouche**
- Titres de chapitre courts. Le long libellé passe en ligne de commentaire sous la ligne de prix.
- Dimensions une seule fois.
- Options marquées dans le libellé (« Option : … ») avec quantité, en attendant votre réponse à la question 2.

**5. Tests**
- Contrôles bloquants (client incomplet, signataire générique), alerte à 0 €.
- Sous-totaux = somme des lignes, options exclues, forfait de chapitre visible.
- Totaux identiques PDF = Excel = calcul sur 9500, 9477 et 6064.
- Aucun champ interne (heures, taux, coûts, marge, commentaire Claude) dans le PDF.
- Captures avant / après des trois devis.

## Questions à trancher avant la réalisation
1. **Heures dans l'Excel** : la colonne « Temps prévu » (heures par ligne) sert-elle à l'import ProGBat, et faut-il la garder ? Je propose de la garder : c'est un fichier interne, jamais remis au client.
2. **Options dans ProGBat** : faut-il les importer comme lignes normales, puis les passer en « Option » à la main (comme aujourd'hui), ou ProGBat reconnaît-il un marqueur dans le fichier ?
3. **Contenus du modèle** : il me faut le logo SET UP « constructeur d'imaginaire », le texte des conditions générales, et les informations de pied de page (forme sociale, capital, téléphone, APE, TVA, IBAN/BIC). Je les reprends de la fiche entreprise si elle les contient ; sinon, merci de me les envoyer.

## Détails techniques
- Changement de base, montré avant application : colonnes facultatives sur les devis (adresse chantier, début, durée, travaux, signataire), ajoutées aux listes autorisées des fonctions d'écriture des devis. Les deux lecteurs d'export (client et ProGBat) les renvoient, ainsi que les champs société nécessaires.
- Rendu dans `pdf-client.ts` (module partagé app / Claude) et `progbat-export.ts` ; contrôles dans les fonctions de validation et d'export.
