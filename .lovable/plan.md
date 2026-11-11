# Prix proposés au catalogue : corrections du texte de migration (v2 à relire)

Rien n'est appliqué ni publié. Une fois ce plan accepté, j'écris `prix-proposes-catalogue-migration_v2.sql` avec les corrections ci-dessous, puis je m'arrête jusqu'à l'accord de Gabin. Aucun autre changement n'est apporté au texte v1.

## 1. Règles en base : les valeurs vides
- **Règle « fournisseur requis » : défaut confirmé.** Avec un statut vide et un fournisseur vide, la règle vaut `NULL`, et une règle de ce type accepte `NULL`. Correction :
  `CHECK (coalesce(proposition_statut,'') IN ('propose','refuse') OR fournisseur_id IS NOT NULL)`.
- J'ai relu les trois autres règles :
  - **Statut** : `proposition_statut IS NULL OR proposition_statut IN (...)`. Le vide est voulu (ligne importée) ; une autre valeur est refusée. Aucun changement.
  - **Proposition inactive** : `coalesce(...) NOT IN (...) OR NOT actif`. `actif` est obligatoire et le `coalesce` ne renvoie jamais vide, donc la règle ne peut pas valoir `NULL`. Aucun changement.
  - **Motif de refus** : `IS DISTINCT FROM` et `coalesce(trim(...),'')` ne renvoient jamais `NULL`. Aucun changement.
- **Nouvelle règle (point 2)** : `CHECK (proposition_statut IS DISTINCT FROM 'valide' OR coalesce(prix_achat_net,0) > 0)`. Avec le `coalesce`, un prix vide est bien refusé.
- **Avant d'appliquer**, je vérifie que les 31 962 lignes actuelles respectent toutes les règles : aucune ligne sans fournisseur, aucune ligne avec un statut.
- **Essai après application**, dans un bloc annulé à la fin, sans rien laisser en base :
  - une ligne sans statut ni fournisseur doit être refusée ;
  - une ligne validée avec un prix vide, puis avec un prix nul, doit être refusée ;
  - une proposition active doit être refusée ;
  - un refus sans motif doit être refusé.

## 2. Validation sans prix
`materiau_proposition_valider` refuse la validation tant que le prix n'est pas strictement positif, avec le message : « Prix d'achat manquant ou nul : saisissez un prix supérieur à 0 avant de valider ». La règle en base du point 1 empêche le même cas par tout autre chemin.

## 3. Effet sur le devis quand on propose un prix (vérifié)
Écrire `propose_catalogue` déclenche `devis_marquer_humain_enfant` :
- **Repris par un humain : oui.** La date et l'auteur de la dernière modification humaine du devis sont mis à jour, ce qui retire à Claude le droit de compléter ce devis en autonomie.
- **Date de modification du devis : oui**, par le déclencheur `updated_at` du devis.
- **Recalcul : non.** Les totaux sont calculés à la lecture, et le montant figé ne change qu'à la validation. Aucun total ne change.

**Correction proposée : ne plus écrire `propose_catalogue` du tout.** Le badge lit déjà l'état réel dans les propositions (`devis_materiaux_propositions_etat`), et l'unicité de la ligne d'origine empêche une double proposition. Proposer un prix ne touche donc plus aucune ligne de devis : ni marquage « repris », ni date modifiée. C'est plus simple et plus sûr qu'une exception dans le déclencheur. La colonne existante reste en place, seulement écrite par la case actuelle de création, comme aujourd'hui.

**Conséquence pour la case « Proposer au catalogue » à la création :** elle enregistre la ligne comme aujourd'hui, ce qui marque déjà le devis comme modifié par un humain, puis appelle `materiau_proposer`, qui n'ajoute aucune écriture sur le devis.

## 4. Temps de réponse de la liste (mesuré en lecture, avec les 64 désignations réelles)
| Méthode | Temps |
|---|---|
| Comparaison sur toutes les lignes actives, comme dans la v1 | **54 s** |
| Opérateur d'index sur `search_norm`, pour les 64 propositions à la fois | 9 s |
| Opérateur d'index, pour une seule proposition | **54 ms** |

**Correction :**
- `materiaux_propositions_lister` ne garde que la correspondance exacte « même fournisseur + même référence », qui utilise l'index existant (rapide).
- Une nouvelle fonction, `materiau_proposition_proches(_id)`, réservée à l'admin et qui masque les prix sans `devis.couts`, cherche les 3 lignes proches. Elle utilise l'index sur `search_norm` (`%`, puis tri par ressemblance) et n'est appelée que lorsque l'admin ouvre une proposition.
- Le temps réel de la liste avec les 64 propositions sera mesuré après application et donné dans le compte rendu.

## 5. Remplissage de la recherche (vérifié)
`trg_materiaux_search_text` s'exécute avant chaque insertion, quelles que soient les colonnes : `search_text`, `search_norm` et `produit_norm` sont donc remplis dès l'insertion d'une proposition. Ils sont recalculés lorsque la validation corrige la désignation, la référence, le format ou les dimensions.

Les index de recherche ne couvrent que les lignes actives : une proposition n'y entre qu'au moment de sa validation. Après application, je confirmerai ce point en base sur une proposition d'essai.

## Suite
1. Écrire la v2 du texte avec ces corrections, sans rien appliquer.
2. Attendre l'accord de Gabin, puisque le texte retire l'obligation sur `fournisseur_id`.
3. Après son accord : appliquer, lancer les essais du point 1, puis construire les écrans, les tests et le parcours prévus dans le plan approuvé.
