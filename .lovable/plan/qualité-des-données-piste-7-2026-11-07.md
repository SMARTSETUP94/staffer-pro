# Qualité des données (piste 7)

Les quatre étapes du planning logistique sont écrites. Seule l'étape 4 attend votre accord sur sa modification de base (profil Écran atelier, besoins qualifiés). Ce lot passe ensuite, comme demandé. Aucune suppression, aucune nouvelle table de personnes, aucune rémunération affichée, rien publié.

## Une page admin « Qualité des données »
Compteurs en tête, trois onglets, chaque liste exportable en Excel. Admin uniquement ; la logistique voit l'onglet Personnes en lecture.

### 1. Personnes
- **À relier** : fiches Dispos sans employé qui ont un homonyme probable (nom normalisé, accents, tirets, ordre prénom/nom inversé). Boutons « Relier » et « Pas la même personne » ; ce refus est mémorisé pour ne plus être reproposé.
- **Infos Dispos plus récentes** : pour chaque fiche reliée, comparaison Dispos / fiche employé, champ par champ : téléphone, permis, poste terrain, chef d'équipe. Application par champ ou en bloc, journalisée, jamais automatique. Le contrat et la rémunération ne sont jamais touchés.
- **Doublons employés** : paires probables, fusion assistée. Une fiche est gardée ; l'autre est désactivée avec la note « fusionnée dans … », et ses références (affectations, heures, absences, Dispos, comptes) sont déplacées. Rien n'est supprimé.
- **À revoir** : employés actifs jamais affectés et sans fiche Dispos. Sélection multiple puis « Désactiver » ; c'est réversible avec « Réactiver ». Filtres par statut et par contrat. Français Kévin, Ravi Dylan et Touré Amadou restent inactifs.
- **Fiches incomplètes** : sans téléphone, poste ou statut, avec le statut de contrat modifiable en lot.
- Le Planning et les Dispos affichent déjà les infos terrain de Dispos en priorité. Un indicateur le rappelle sur la page.

### 2. Commercial
- **Opportunités sans CA** : CA proposé = total HT net du dernier devis existant (« Appliquer » / « Appliquer à tous »), sinon saisie en ligne.
- **Sans chargé d'affaires ou sans prochaine action datée** : saisie en ligne.
- **Demandes « client à identifier » / « provenance à confirmer »** : rattachement à un client en un clic (recherche par mot-clé).
- **Clients en doublon probable** (nom normalisé, SIRET/SIREN, domaine mail) : fusion assistée. Les références (opportunités, devis, contacts, demandes, documents) sont déplacées ; le client fusionné est désactivé avec une note.

### 3. Devis
- **Brouillons Claude jamais repris** : affaire, âge, total HT, statut de l'opportunité. « Reprendre » ouvre l'éditeur ; « Classer sans suite » est réversible (« Rouvrir ») et le brouillon sort des listes et du pipeline.

### 4. Widget « Santé des données »
Sur l'accueil admin : nombre total d'anomalies et lien vers la page.

## Modification de base (SQL montré avant application)
- **Statuts de contrat** : ajouter « Intermittent » et « Auto-entrepreneur » aux valeurs possibles (aujourd'hui : Apprenti, Intérim, CDD chantier, CDDU intermittent, CDI). À vous de dire si « CDDU intermittent » suffit pour les intermittents.
- **Colonnes facultatives sur les tables existantes**, aucune nouvelle table de personnes :
  - fiche Dispos : liste des employés « pas la même personne » ;
  - employés et clients : date et cible de fusion ;
  - devis : date de classement sans suite, et par qui.
- **CACES** : la fiche employé n'a pas de champ CACES, alors que Dispos en a un. Je propose d'ajouter un champ CACES à la fiche employé pour pouvoir appliquer ce champ ; sinon, il reste lu seulement depuis Dispos.
- **Journal** : les mises à jour Dispos → employé et les fusions sont journalisées dans le journal technique existant (audit), sans nouvelle table.
- **Fonctions sécurisées admin** pour relier, appliquer le diff, fusionner, désactiver, réactiver, appliquer le CA et classer sans suite. Chacune vérifie le rôle et écrit son entrée de journal.

## Tests
- Rapprochement des noms : accents, ordre inversé, tirets.
- Fusion sans perte de références.
- Désactivation réversible.
- Diff Dispos → employé : contrat et taux jamais modifiés.
- CA repris du dernier devis.
- Devis classé sans suite exclu du pipeline, puis rouvert.
- Droits : la logistique ne fait que lire.
- Écrans à 390 et 1366 px.

## Détails techniques
- Une route admin à onglets ; lecteurs en fonctions d'invocation qui ne renvoient que des champs sûrs, sans taux, forfait ni salaire.
- Rapprochement des noms par un helper pur partagé, testé, réutilisant la normalisation déjà employée par l'import du planning.
- Les écritures passent par des fonctions SECURITY DEFINER qui vérifient le rôle admin.
