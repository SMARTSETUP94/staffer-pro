# Prix proposés au catalogue fournisseurs depuis un devis (v2)

## Ce qui existe déjà (vérifié en base et dans le code)
- `materiaux_catalogue` a déjà les colonnes `source`, `date_tarif`, `actif`, `desactive_le` et `import_id` (facultatif). En revanche, `fournisseur_id` y est **obligatoire**.
- La case « Proposer au catalogue » (onglet « Pas trouvé » de la fenêtre d'ajout de matériau) envoie `propose_catalogue = true` à `devis_materiau_enregistrer`. Celle-ci l'enregistre sur la ligne du devis, et c'est tout. Aucune ligne n'a cette valeur à vrai aujourd'hui.
- Le badge « proposé au catalogue » affiche seulement ce booléen. La copie d'un devis (`devis_copier_sous_arbre`) le recopie tel quel.
- Création de fournisseur : la fonction `fournisseur_tarif_enregistrer` existe déjà et exige la capacité `devis.parametres`.

## Où sont stockées les propositions
Directement dans `materiaux_catalogue`, toujours avec `actif = false` tant qu'elles ne sont pas validées. Aucune nouvelle table.

Colonnes ajoutées, toutes facultatives :
- `proposition_statut` : vide pour une ligne importée, sinon `propose`, `valide` ou `refuse` ;
- `fournisseur_libre` : nom tapé par le chiffreur quand le fournisseur n'est pas dans la liste ;
- `propose_par`, `propose_le`, `devis_origine_id`, `devis_materiau_origine_id` (unique) ;
- `decision_par`, `decision_le`, `motif_refus` ;
- `remplace_materiau_id` : la ligne du catalogue que celle-ci remplace.

Une ligne validée reçoit `source = 'saisie_manuelle'` et garde le devis d'origine et la date.

## 1. Fournisseur inconnu : le chiffreur n'est jamais bloqué
- Le chiffreur choisit un fournisseur de la liste, ou tape un nom libre (enregistré dans `fournisseur_libre`).
- `fournisseur_id` devient facultatif, mais une règle en base le compense : `proposition_statut IN ('propose','refuse') OR fournisseur_id IS NOT NULL`. Une ligne active ou validée a donc toujours un vrai fournisseur, et rien ne change pour les lignes existantes.
- Retirer l'obligation sur une colonne est une opération que votre réglage de sécurité peut soumettre à confirmation au moment de l'appliquer. La protection est rétablie aussitôt par la règle.
- Autre option, que je déconseille : un faux fournisseur « À identifier ». Il apparaîtrait dans la liste et dans les statistiques des fournisseurs.
- À la validation, l'admin choisit un fournisseur existant, ou en crée un par `fournisseur_tarif_enregistrer`. La validation exige en plus d'être admin. Elle est refusée en base tant qu'aucun fournisseur n'est choisi.

## 2. Prix d'une ligne déjà au catalogue
Quand la proposition correspond à une ligne active (même fournisseur et même référence), l'admin doit choisir :
- **« Remplacer le prix de la ligne existante »** : l'ancienne ligne passe à `actif = false` (avec la date dans `desactive_le`) et n'est jamais supprimée. La nouvelle ligne garde la trace dans `remplace_materiau_id`.
- **« Ajouter comme nouvelle ligne »**.

Sans choix, la validation est refusée en base : aucun doublon actif n'est créé sans décision de l'admin. Les devis qui utilisaient l'ancienne ligne ne changent pas. L'outil existant « écarts de prix » pourra leur signaler le nouveau prix, mais la mise à jour reste manuelle, ligne par ligne, comme aujourd'hui.

## 3. Raccordement de la case et du badge existants
- **Case cochée** : après l'enregistrement de la ligne par `devis_materiau_enregistrer`, l'éditeur appelle `materiau_proposer` avec l'identifiant de cette ligne. Cocher la case déplie les champs utiles : référence, date du prix, format et dimensions.
- **Bouton « Proposer au catalogue »** : il apparaît aussi sur chaque matériau hors catalogue déjà dans le devis et appelle la même fonction.
- **Écriture sur le devis** : `materiau_proposer` met `propose_catalogue` à vrai par une petite fonction `devis_*`. Celle-ci reprend le verrou et les contrôles d'écriture de `devis_materiau_enregistrer` et n'écrit que ce booléen : jamais le prix, jamais le total.
- **Une seule proposition par ligne** : l'unicité de `devis_materiau_origine_id` empêche de proposer deux fois la même ligne. Une proposition refusée ne peut pas être reproposée depuis cette ligne.
- **Badge** : il affiche l'état réel renvoyé par le lecteur du devis, « proposé », « validé » ou « refusé ». Une ligne copiée dans un autre devis n'a pas de proposition à elle : elle n'affiche aucun badge.

## 4. Les autres lecteurs du catalogue (vérifié en base)
Tous ne retiennent que `actif = true`. Une proposition ou un refus, qui reste toujours `actif = false`, n'y apparaît donc pas et ne peut pas être choisi dans un devis.

| Lecteur | Filtre actuel | Après le lot |
|---|---|---|
| `materiaux_rechercher` (écran et outil Claude) | `m.actif` | inchangé, plus une garde sur le statut de proposition |
| `materiaux_acces_rapides` (favoris, récents, ce devis, plus utilisés) | `c.actif` sur les 4 listes | inchangé |
| `devis_materiau_enregistrer` avec un identifiant de matériau | `m.actif`, sinon « Matériau introuvable » | inchangé |
| `devis_materiaux_ecarts`, `devis_materiau_maj_prix` | candidat `c2.actif` | inchangé |
| `devis_copier_sous_arbre` (réévaluation) | `c2.actif` | inchangé |
| `materiaux_fournisseurs_stats` | compte `m.actif` | ajoute un compte séparé des saisies manuelles |
| `materiaux_import_bilan` | « actives avant » et « retirées » sur `actif` | ne compte que les lignes importées, les saisies manuelles à part |
| `materiaux_import_valider` | désactive toutes les lignes actives du fournisseur | ne désactive que les lignes importées |

Aucun écran ne lit la table directement. Un test garde-fou le vérifiera pour le code à venir.

## Cohabitation avec les imports (règle acceptée : conserver et signaler)
Un import ne désactive plus que les lignes issues d'un import. Avant validation, son bilan affiche : « N prix saisis manuellement conservés, dont M avec la même référence qu'une ligne importée ». L'admin peut ensuite désactiver ces doublons d'un clic.

## Lien avec le devis d'origine
La ligne du devis d'origine n'est pas rattachée au catalogue. Elle n'est liée que par `devis_materiau_origine_id`, pour la traçabilité. Ainsi, aucun prix ni aucun total de devis existant ne change.

## Reprise de l'existant
Une action admin « Reprendre les matériaux hors catalogue des devis » transforme les 64 lignes en propositions :
- elles sont regroupées par fournisseur (nom normalisé) et par désignation normalisée ;
- pour chaque groupe, seul le prix le plus récent est gardé, avec son devis d'origine ;
- les groupes déjà proposés ou refusés sont ignorés ;
- le fournisseur est rapproché automatiquement quand le nom correspond exactement à un fournisseur existant, sinon il reste en nom libre.

Toutes ces propositions passent par la même validation admin. Rien n'entre au catalogue automatiquement.

## Écrans
1. **Éditeur de devis** : la case et le bouton « Proposer au catalogue », et le badge d'état. Les prix ne sont visibles qu'avec la capacité `devis.couts`.
2. **Paramètres > Devis > onglet « Prix proposés »** (admin) :
   - filtres À traiter, Validés et Refusés ;
   - pour chaque proposition : qui l'a faite et quand, le devis d'origine avec un lien, le prix ;
   - jusqu'à 3 lignes proches du catalogue avec leur prix actuel, pour comparer ;
   - le choix du fournisseur (existant ou nouveau) et le choix « remplacer » ou « ajouter » quand il s'applique ;
   - les actions Valider (après correction éventuelle des champs) et Refuser (motif obligatoire), et le bouton de reprise ;
   - sur mobile, une carte par proposition.

## Droits et sécurité
- Fonctions en base, aucune lecture directe des tables, rien n'est exécutable par le rôle anonyme.
- `materiau_proposer` : capacité `devis.rediger` et accès au devis.
- `materiaux_propositions_lister` : admin. Les prix sont masqués sans `devis.couts`.
- `materiau_proposition_valider`, `materiau_proposition_refuser` et `materiaux_reprendre_hors_catalogue` : admin, contrôlé dans la fonction.
- Aucune écriture sur le prix ni le total d'un devis. Le barème, les taux et les forfaits ne changent pas. Aucun outil Claude ajouté.
- Une proposition refusée reste consultable. Aucune donnée n'est supprimée.

## Migrations (montrées avant application)
1. Les colonnes, `fournisseur_id` rendu facultatif avec sa règle de compensation, l'unicité sur l'origine et un index sur le statut.
2. Les fonctions nouvelles, la petite fonction `devis_*` qui marque la ligne, et leurs droits.
3. Nouvelle définition de `materiaux_rechercher`, `materiaux_import_valider`, `materiaux_import_bilan` et `materiaux_fournisseurs_stats`. Chacune part de la définition actuelle relue juste avant, avec le texte avant et après pour vous.
4. Retour arrière : les quatre fonctions d'origine sont recréées. Les colonnes sont conservées et marquées comme dépréciées.

## Vérifications
- **Tests des règles** (Vitest, règle pure dans `src/lib/devis/materiaux-propositions.ts`) :
  - proposition, y compris avec un fournisseur en nom libre ;
  - refus d'une deuxième proposition de la même ligne ;
  - validation, avec le choix remplacer ou ajouter ;
  - refus avec motif ;
  - dédoublonnage de la reprise ;
  - import qui conserve et signale les saisies manuelles, et compteurs du bilan qui n'incluent pas les propositions.
- **Parcours admin réel sur un devis d'essai** :
  - proposer un prix, puis vérifier qu'il est introuvable dans la recherche et dans les accès rapides ;
  - valider, puis vérifier qu'il est trouvé ;
  - avec un compte sans `devis.couts`, vérifier qu'aucun prix d'achat n'apparaît.
- **Écrans** à 390 px et à 1366 px.
- **À la fin** : données d'essai effacées, aucun devis réel modifié, rien publié.
- **Compte rendu** : il séparera ce qui a été vu à l'écran de ce qui a seulement été vérifié en base ou par les tests.
