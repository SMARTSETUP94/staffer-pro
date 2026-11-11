# Prix proposés au catalogue fournisseurs depuis un devis

## Ce qui existe déjà (vérifié)
- `materiaux_catalogue` porte déjà `source`, `date_tarif`, `actif`, `desactive_le`, `import_id` (nullable) : une ligne saisie à la main peut y vivre sans import.
- La case « proposer au catalogue » existe dans la fenêtre d'ajout de matériau libre de l'éditeur, et un badge « proposé au catalogue » s'affiche sur la ligne. Mais rien n'est enregistré en dehors du devis.
- `materiaux_rechercher` ne remonte que les lignes `actif = true`. `materiaux_import_valider` désactive les anciennes lignes du fournisseur.

## Choix proposés

**Où stocker les propositions.** Directement dans `materiaux_catalogue`, avec `actif = false` et un nouvel état de proposition. On n'ajoute pas de table en doublon. Colonnes à ajouter (toutes facultatives) :
- `proposition_statut` : vide (ligne importée), `propose`, `valide` ou `refuse` ;
- `propose_par`, `propose_le`, `devis_origine_id`, `devis_materiau_origine_id` ;
- `decision_par`, `decision_le`, `motif_refus`.

Les lignes validées prennent `source = 'saisie_manuelle'`. Le fournisseur est choisi dans la liste existante. Si la saisie ne correspond à aucun fournisseur, la proposition est bloquée et on demande d'en choisir un : je ne crée aucun fournisseur automatiquement.

**Recherche.** Une proposition reste `actif = false` tant qu'elle n'est pas validée, donc elle est invisible pour la recherche. J'ajoute aussi une garde explicite dans `materiaux_rechercher` : `proposition_statut IS NULL OR = 'valide'`.

**Cohabitation avec les imports (règle retenue : conserver et signaler).** Un import ne désactive plus que les lignes issues d'un import. Les lignes en saisie manuelle restent actives, et le bilan, avant validation, les liste : « N prix saisis manuellement conservés, dont M avec une référence identique à une ligne importée ». L'admin peut alors désactiver ces doublons d'un clic.
Pourquoi : un import ne doit jamais faire disparaître en silence un prix validé par un admin. Signaler seulement, sans conserver, obligerait à revalider à chaque import.

**Lien avec le devis d'origine.** Après validation, la ligne du devis n'est pas rattachée au catalogue. On garde seulement la référence inverse (`devis_materiau_origine_id`), pour la traçabilité. Pourquoi : rattacher la ligne pourrait déclencher un nouveau calcul du prix à partir du catalogue, et on ne doit changer le prix ni le total d'aucun devis existant. Les devis suivants trouveront la ligne par la recherche.

**Reprise de l'existant.** Une action admin « Reprendre les matériaux hors catalogue des devis » crée des propositions à partir des 64 lignes, sans doublon :
- les lignes sont regroupées par fournisseur et désignation normalisée, et seul le prix le plus récent est gardé, avec le devis d'origine ;
- on ignore ce qui est déjà proposé ou refusé pour la même clé ;
- les lignes sans fournisseur reconnu sont listées à part : un admin choisit le fournisseur à la validation.

Rien n'entre au catalogue automatiquement.

## Écrans
1. **Éditeur de devis** : bouton « Proposer au catalogue » sur chaque matériau hors catalogue. La fenêtre est préremplie : fournisseur, désignation, référence, unité, prix d'achat, date du prix, format et dimensions. L'action ne modifie rien dans le devis. Le prix n'est montré qu'avec `devis.couts`.
2. **Paramètres > Devis > onglet « Prix proposés »** (admin) :
   - filtres À traiter / Validés / Refusés ;
   - pour chaque proposition : qui l'a faite, quand, le devis d'origine (avec lien), le prix, et jusqu'à 3 lignes proches du catalogue avec leur prix actuel (même fournisseur avec la même référence, ou une désignation proche) ;
   - actions : « Valider » (champs modifiables avant), « Refuser » (motif obligatoire), et le bouton de reprise.
   - Sur mobile, une carte par proposition.

## Droits et sécurité
- Fonctions en base, aucune lecture directe des tables, rien d'exécutable par le rôle anonyme :
  - `materiau_proposer` : capacité `devis.rediger` et accès au devis d'origine ;
  - `materiaux_propositions_lister` : admin ; les prix sont masqués sans `devis.couts` ;
  - `materiau_proposition_valider`, `materiau_proposition_refuser` et `materiaux_reprendre_hors_catalogue` : admin, contrôlé dans la fonction.
- Aucune écriture sur `devis` ou `devis_materiaux`. Le barème, les taux et les forfaits ne changent pas. Aucun outil Claude ajouté.
- Les refus restent consultables. Aucune suppression physique.

## Migrations (montrées avant application, uniquement des ajouts ou des restrictions)
1. Colonnes ci-dessus et index sur `(proposition_statut)`.
2. Les cinq fonctions et leurs droits.
3. Nouvelle définition de `materiaux_rechercher` (garde ajoutée) et de `materiaux_import_valider` (désactivation limitée aux lignes importées, et bilan enrichi). Chaque nouvelle définition part de la définition actuelle relue juste avant. Je vous montre la différence avant et après.
4. Retour arrière : remise des deux fonctions d'origine ; les colonnes sont conservées et marquées comme dépréciées.

## Vérifications
- Tests (Vitest, avec une règle pure partagée dans `src/lib/devis/materiaux-propositions.ts`) : proposition, validation, refus avec motif, dédoublonnage de la reprise, import qui conserve les lignes manuelles et les signale.
- Parcours admin réel sur un devis d'essai :
  - proposer, puis vérifier que le prix est introuvable dans la recherche ;
  - valider, puis vérifier que la ligne est trouvée ;
  - avec un compte sans `devis.couts`, vérifier qu'aucun prix d'achat n'apparaît.
- Captures à 390 px et 1366 px.
- Données d'essai effacées, aucun devis réel modifié, rien publié.
- Le compte rendu distinguera ce qui a été vu à l'écran de ce qui a été vérifié seulement en base ou par les tests.
