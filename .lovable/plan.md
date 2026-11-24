# Finitions des devis — accord sur la migration avant développement

## Périmètre et précautions

Priorité 1 : les devis. Relances commerciales et listes de chantier IA restent hors de ce lot.

- Aucune modification de devis, barème, catalogue ou coordonnées réels par l’agent.
- Aucune publication.
- La migration ci-dessous est une **proposition non appliquée**. Son application attend votre accord explicite ; aucune approbation antérieure ne vaut pour cette proposition.
- Les essais d’écriture seront limités à des données fictives isolées, puis nettoyés. Les lectures de 9485 et 9524-R1 ne modifieront rien.

## Constats vérifiés en lecture seule

- **362 articles actifs sans prix** (prix d’achat absent ou égal à zéro).
- Logo, téléphone, IBAN/BIC et CGV ont déjà leurs champs dans les paramètres société. Logo et IBAN/BIC sont renseignés ; **téléphone et CGV sont vides**. Aucun nouveau champ société n’est nécessaire, aucune valeur ne sera inventée.
- Le PDF lit bien le logo et ces coordonnées depuis les paramètres société. La page CGV existe déjà, mais utilise un texte unique non versionné, sans choix par devis.
- `a_valider` est actuellement renommé « Brouillon » à l’écran, alors que `devis_soumettre` passe réellement à `a_valider`. Votre nouvelle demande remplace ce regroupement : les sept statuts auront chacun leur libellé.
- Un forfait sans prix bloque actuellement la finalisation. Il deviendra un **avertissement confirmable**, conformément à votre liste ; les autres garde-fous de statut et droits resteront inchangés.

## 1. Avant de valider

Un même résultat de contrôle alimente l’éditeur, la fenêtre de finalisation et l’aperçu MCP. Il est recalculé en base avant la transition.

**Bloquants :** Total HT ≤ 0 €, client facturé absent, validité strictement antérieure à aujourd’hui. Une validité égale à aujourd’hui reste admise. Aucun contrôle n’altère un montant.

**Avertissements :** objet/option à zéro (prix récursif, pas seulement le prix propre), matière à zéro ou article sans prix, ligne sans descriptif client, option sans objet descendant ni prix, e-mail/adresse client incomplets, contact non choisi, signataire incomplet. Les lignes supprimées sont exclues. Une option avec des enfants chiffrés ne reçoit pas l’alerte « option à zéro ».

Chaque point ouvre la ligne, la matière ou le panneau Client & interlocuteurs concerné, sans quitter le devis. Les contrôles ne divulguent aucun coût ni aucune marge.

````text
Avant de valider                 0 bloquant · 5 avertissements

Avertissement  Photobooth : 0 € HT                     Voir
Avertissement  Client : e-mail manquant                Compléter
Avertissement  Aucun contact choisi                   Choisir

[ ] Je confirme la finalisation malgré ces avertissements
                                      Annuler   Finaliser le devis
````

Sans avertissement : finalisation directe après contrôle. Avec avertissements : confirmation explicite obligatoire. Le journal conserve auteur, date, source, anomalies et « je confirme ». Une modification du devis après lecture impose de relire la liste. Les anciens appels de transition ne peuvent pas contourner ces contrôles.

MCP : soumission uniquement vers **À valider**, jamais vers Finalisé. Confirmation des avertissements uniquement en conversation après accord humain, liée au même aperçu/arguments et conservée dans la note et le journal ; pas d’acceptation autonome.

## 2. CGV datées dans le PDF

- Section admin dans **Paramètres › Devis** : texte simple avec titres, gras, italique et listes, aperçu, date d’effet, historique avec auteur.
- Enregistrement = nouvelle version ; aucune version n’est écrasée, une même date d’effet ne peut pas être réutilisée. Date passée : confirmation admin explicite.
- Le PDF choisit la dernière version dont la date d’effet est ≤ **date du devis**, et non la date de génération du PDF.
- Case par devis **Joindre les CGV**, cochée par défaut ; modifiable en brouillon, figée ensuite ; une nouvelle révision reprend ce choix.
- Aucune version applicable, texte vide ou case décochée : **aucune page CGV**. Pas de texte juridique inventé, ni reprise automatique d’un texte sans date.
- Page finale « Conditions générales de vente », dans les deux niveaux, sans perturber les totaux, options, signatures ou pieds de page. Les PDF déjà stockés restent intacts.

## 3. Statuts sans doublon

Source commune pour filtres, badges et libellés MCP :

| Valeur | Libellé |
|---|---|
| brouillon | Brouillon |
| a_valider | À valider |
| valide | Finalisé |
| transfere | Transféré |
| signe | Signé |
| refuse | Refusé |
| remplace | Remplacé |

La date d’envoi reste affichée séparément ; elle ne renomme plus le statut Transféré. Aucun devis ne change de statut, aucune règle de calcul pipeline n’est changée.

## 4. Articles sans prix

Nouvel onglet **Articles sans prix** dans le catalogue admin existant : famille, recherche produit/référence/fournisseur, compteur et lecture paginée.

````text
Articles sans prix   362      Famille : Toutes   Rechercher…
Produit       Référence   Fournisseur   Unité   Prix achat   Depuis
Article…      REF…        Fournisseur…  m²      [à saisir]   —

3 modifications non enregistrées                    Enregistrer
Récapitulatif : article / ancien prix / nouveau prix / date tarif
````

Tableur compact à 1 366 px, cartes et cellules éditables à 390 px. Tab/Entrée pour la saisie ; aucune écriture au changement de cellule. Enregistrement groupé atomique après récapitulatif, puis historique consultable par article.

Seuls les prix absents ou nuls des articles actifs peuvent être complétés ici. Si un autre admin a déjà ajouté le prix, le lot est refusé et doit être relu. Les prix des matières déjà copiées dans les devis restent inchangés : **aucune mise à jour automatique des devis, même brouillons**.

Lecture, historique et enregistrement réservés aux admins dans l’application ; refus aux autres rôles, à l’atelier et aux jetons OAuth MCP. Aucun nouvel outil catalogue MCP ni élargissement d’accès aux coûts.

## Migration proposée — complète, non appliquée

[Lire / télécharger le SQL proposé](sandbox:/mnt/documents/finitions-devis/migration-proposee.sql)

La proposition comporte :

1. `devis.joindre_cgv` (défaut `true`) ; table append-only `devis_cgv_versions` avec date unique et auteur ; RPC admin de création de version et RPC brouillon du choix CGV.
2. `devis_controles_journal`, lecteur de contrôles sans coûts, confirmation interne non appelable directement, protection des transitions, `devis_finaliser` et nouvelle signature `devis_soumettre`. Ancienne signature conservée mais sans acceptation implicite des avertissements.
3. `materiaux_prix_historique`, lecteur admin paginé et enregistrement groupé vérifiant prix précédent/activité/droits.
4. Définitions **complètes** des fonctions existantes concernées, reprises de leur état actuel : transition (forfaits désormais avertissements), lecteur PDF (CGV à date), nouvelle version (copie du choix CGV) et dispatch devis MCP (confirmation explicite).

Toutes les nouvelles tables ont GRANT, RLS et politiques explicites. Aucun rôle métier n’est ajouté, aucun helper RLS existant n’est privé de son droit d’exécution. Aucun seed, backfill, contenu CGV, prix ou changement de statut n’est exécuté par la migration. Les écritures présentes dans les fonctions n’ont lieu qu’à leur utilisation ultérieure par un utilisateur autorisé.

Le fichier sera revérifié contre les définitions en base juste avant application ; toute modification de cette proposition vous sera montrée avant d’être appliquée.

## Recette après accord

- Tests concrets de chaque bloquant/avertissement, prix récursifs, lignes supprimées, confirmation obligatoire, refus des contournements UI/RPC/MCP et journalisation.
- Versions CGV : sélection à date, absence de texte, case décochée, nouvelle révision, historique immuable.
- Prix : accès admin uniquement, lot atomique, conflit concurrent, historique et absence de revalorisation des devis existants.
- Parcours d’essai isolés : confirmation/soumission, CGV et lot de prix ; aucune action d’écriture sur 9485 ou 9524.
- Captures 390 / 1 366 px des contrôles, paramètres CGV et Articles sans prix dans `/mnt/documents/finitions-devis/`.
- Deux PDF de test **9524-R1**, générés localement sans enregistrer d’export ni d’historique réel, texte extrait et chaque page rendue/inspectée. Total HT attendu **6 563,05 €**, options **62 048,27 €**, inchangés. Avec les CGV actuellement vides, ces deux PDF n’auront pas de page juridique ; le rendu CGV sera testé séparément avec un texte fictif explicitement identifié comme tel.
- Les essais, captures et PDF sont à réaliser **après accord**, pas encore produits dans ce tour de proposition.