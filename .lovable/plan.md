# Lot « Documents fournisseurs » : prix tirés des factures et propositions

Rien n'est appliqué avant votre relecture. Rien publié.

## Ce qui existe déjà (lu le 12/11/2026)

- Lecture IA de documents : `jalonnement.functions.ts` envoie PDF (`input_file`) et images (`input_image`) au modèle `openai/gpt-6-astra` ; `src/lib/ai/structured.server.ts` fournit l'appel en streaming avec schéma strict (`Output.object`).
- Circuit des prix proposés : colonnes `proposition_statut`, `fournisseur_libre`, `propose_par/le`, `devis_origine_id`, `devis_materiau_origine_id`, `decision_*`, `motif_refus`, `remplace_materiau_id` sur `materiaux_catalogue`, et les fonctions `materiau_proposer`, `materiaux_propositions_lister`, `materiau_proposition_proches`, `materiau_proposition_valider`, `materiau_proposition_refuser`.
- Fonctions qui lisent le catalogue actif : `materiaux_rechercher`, `materiaux_acces_rapides`, `devis_materiaux_ecarts`, `devis_materiau_maj_prix`, `devis_copier_sous_arbre`, `materiaux_fournisseurs_stats`, `materiaux_import_valider/bilan`. Chacune sera relue avant d'être redéfinie.
- Pas encore de stockage pour ces documents (les stockages privés existants servent à d'autres usages).

## Ce que verra l'utilisateur

1. **Paramètres devis > onglet « Documents fournisseurs »** (rédacteurs de devis ayant accès aux coûts, et admins) : dépôt d'un ou plusieurs PDF/JPG/PNG, liste des documents déjà déposés (fournisseur, type, numéro, date, nombre de lignes, état).
2. **Lecture** : chaque fichier est lu automatiquement (temps affiché). Doublon détecté avant lecture si même fichier, ou après lecture si même fournisseur + même numéro : message « déjà déposé le … » avec lien, aucune proposition recréée.
3. **Aperçu** : document à gauche, lignes à droite. En-tête modifiable (fournisseur rapproché ou nom libre, type, numéro, date, fin de validité, référence projet). Pour chaque ligne : référence, désignation, format, quantité, unité, prix net HT, et le rapprochement :
   - même fournisseur + même référence : ancien prix, nouveau, écart en % (ex. 147,58 → 110,68 soit −25,0 %) ;
   - sinon « nouvelle ligne » avec les lignes proches du catalogue.
   Lignes de frais (port, frais fixes, éco-participation, remises globales) dans un bloc « Écartées » : visibles, non envoyées, et réintégrables à la main si la lecture s'est trompée. Chaque ligne peut être corrigée ou retirée. Rien n'est créé avant « Envoyer en validation ».
4. **Prix proposés (admin)** : les lignes envoyées y apparaissent comme les autres propositions, avec l'origine « Document fournisseur n° … » (lien vers le fichier), l'écart avec le prix actuel. À la validation, un choix :
   - « Nouveau prix de référence » (remplacer ou ajouter, comme aujourd'hui) ;
   - « Prix ponctuel jusqu'au … » (date préremplie depuis le document) : ajouté à côté du prix de référence, sans le remplacer.
   Choix proposé par défaut : prix de référence pour une facture ou une confirmation de commande, prix ponctuel pour une proposition qui a une date de validité.
5. **Recherche dans les devis** : un prix ponctuel est affiché avec « ponctuel jusqu'au 12/12/2026 » ; une fois la date passée, il n'apparaît plus, sans tâche planifiée.

## Choix techniques

**Modèle** : `openai/gpt-6-astra`, déjà utilisé pour les jalonnements et les notes de frais. Il lit les PDF et les images, accepte un schéma JSON strict, et n'est pas soumis à conservation des données. Effort de raisonnement « low » comme les autres lectures.

**Protection contre le contenu du document** : le texte du document est une donnée. Les consignes système le disent explicitement, la sortie est un schéma strict (pas d'outil, pas d'action), elle est revalidée côté serveur par le même schéma Zod, et elle n'est jamais écrite avant l'envoi humain. Les nombres sont bornés (prix ≥ 0, quantité > 0, dates valides).

**Stockage**
- Nouveau stockage privé `documents-fournisseurs`, sans règle d'accès pour les utilisateurs. Le dépôt et la consultation passent par des fonctions serveur qui vérifient d'abord `devis.couts` (et `devis.rediger` ou admin pour déposer), puis utilisent l'accès privilégié uniquement pour écrire le fichier ou donner un lien temporaire de 5 minutes.
- **Nouvelle table `materiaux_documents`**, justifiée car un document regroupe plusieurs lignes et porte ses propres informations (aucune table existante ne joue ce rôle) : chemin du fichier, empreinte SHA-256 (unique), fournisseur ou nom libre, type (facture / proposition / confirmation), numéro, date, fin de validité, référence projet, lignes écartées (jsonb, pour contrôle), déposé par/le. Unicité partielle sur (fournisseur, numéro) quand le numéro est connu. Sécurité de ligne activée sans aucune règle d'accès : lecture seulement par fonctions qui vérifient les droits.
- **Colonnes ajoutées à `materiaux_catalogue`** (toutes facultatives) : `document_origine_id` (lien vers le document), `document_ligne` (numéro de la ligne dans le document), `type_prix` (`reference` par défaut / `ponctuel`), `valide_jusquau` (date). Règle : un prix ponctuel a obligatoirement une date ; la source d'une ligne issue d'un document est « document fournisseur ».

**Fonctions en base** (SECURITY DEFINER, `REVOKE EXECUTE FROM PUBLIC, anon`, accordées à `authenticated`)
- `materiaux_document_doublon(empreinte, fournisseur, numero)` : retourne le document existant s'il y en a un.
- `materiaux_document_rapprocher(lignes jsonb, fournisseur)` : pour chaque ligne, la ligne du catalogue (même fournisseur + même référence) avec son prix, ou jusqu'à 3 lignes proches. Prix renvoyés seulement avec `devis.couts`.
- `materiaux_document_soumettre(document jsonb, lignes jsonb)` : en une transaction, refuse un doublon, crée le document et une proposition par ligne retenue (`proposition_statut = 'propose'`, `actif = false`). Réservée à `devis.rediger` + `devis.couts`, ou admin.
- `materiaux_documents_lister` / `materiaux_document_lire` : pour l'onglet.
- `materiau_proposition_valider` : redéfini depuis sa version actuelle pour accepter `type_prix` et `valide_jusquau` ; « ponctuel » ajoute toujours sans remplacer. Toujours admin uniquement.
- `materiaux_propositions_lister` : ajoute l'origine document et l'écart.

**Prix ponctuels expirés** : filtre `type_prix = 'reference' OR valide_jusquau >= current_date` ajouté dans `materiaux_rechercher` et `materiaux_acces_rapides` (ce que les rédacteurs voient). `devis_materiaux_ecarts` et `devis_materiau_maj_prix` ne proposeront pas un prix ponctuel expiré comme « prix à jour ». Les prix déjà présents dans les devis ne changent jamais. Les imports de tarif complet laissent ces lignes en place (elles ne sont pas « importées »), comme les saisies manuelles.

**Frais** : écartés et conservés dans le document, jamais répartis dans le prix unitaire.

**Écrans** : nouvel onglet dans `_app.parametres.devis-materiaux.tsx` ; composants `DocumentsFournisseurs.tsx` (liste + dépôt) et `DocumentApercu.tsx` (aperçu) ; `PrixProposes.tsx` étendu (origine document, choix référence/ponctuel). Règles pures dans `src/lib/devis/documents-fournisseurs.ts` (frais reconnus, choix par défaut, écart en %, doublon, expiration) avec tests.

## Étapes

1. Relire les définitions actuelles des fonctions à redéfinir, écrire la migration complète (avant / après, retour arrière) dans Files. **Arrêt pour relecture.**
2. Après accord : migration, stockage privé, fonctions serveur (dépôt, lecture IA, lien temporaire), écrans.
3. Tests des règles : schéma d'extraction, frais écartés, rapprochement par référence, doublon, ponctuel expiré absent de la recherche, droits.
4. Parcours en session admin avec un PDF d'essai reproduisant la proposition Richardson n° 023-7049 (une ligne 369D7, 20 U à 110,68 €, frais fixes 1,50 et livraison 45,00 €, validité au 12/12/2026) : lecture (temps mesuré), aperçu, envoi, écart −25,0 % dans « Prix proposés », validation en ponctuel, présence dans la recherche, puis absence simulée après expiration (contrôle en base avec une date passée sur la ligne d'essai). Écrans à 390 et 1366 px.
5. Nettoyage : document, fichier et propositions d'essai effacés ; vérification que la ligne 369D7 à 147,58 € est inchangée.

## Hors lot

Arrivée par mail, nouvel outil Claude, modification des devis, des taux ou du barème.
