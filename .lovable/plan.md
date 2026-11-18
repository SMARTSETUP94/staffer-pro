# Connecteur Claude (devis) — corrections à la suite du retour du 18/11 (9539-R1)

Plan seulement : aucune modification, migration ni publication avant relecture.

## Constats vérifiés dans le code
- `runDevisWrite` (src/lib/mcp/devis.ts) transforme toute exception non `ToolError` en « Écriture indisponible » et écrit dans `mcp_audit_log` avec `arguments: {}` : la cause est perdue.
- `controlerFichier` vérifie l'alphabet (`=` final seulement) mais ni la longueur modulo 4 ni le rembourrage ; `atob` peut alors lever une DOMException non typée. Hypothèse principale, non encore reproduite : l'étape 1 la confirme par un essai avec les tailles signalées (9 à 13 Ko, base64 tronqué par le client).
- Autres exceptions non typées possibles dans l'aperçu : `crypto.subtle.digest` (`sha256`, `argumentsHash`), `devis_mcp_etat` / `mcp_assert_write` qui lèvent au lieu de renvoyer `error`, `lireDocumentAffaire`, `mcp_write_preview`, insertion du journal elle-même.
- `mcp_audit_log` a déjà `arguments` et `diff` (jsonb) : on peut y mettre la cause sans nouvelle colonne.

## 1. Erreurs explicites
- `controlerFichier` : retire préfixe `data:…;base64,`, espaces et retours à la ligne ; accepte base64url (`-_`) ; ajoute le rembourrage manquant si longueur % 4 ∈ {2,3} ; refuse % 4 = 1 avec « Base64 invalide : N caractères reçus après nettoyage, longueur impossible (probablement tronqué) » ; `atob` dans un try → ToolError avec longueur. Message de taille avec octets reçus / max ; type avec signature détectée.
- `runDevisWrite` et `runWrite` : chaque appel RPC/stockage traduit en ToolError nommé (droits, quota, aperçu, journal, dépôt). Filet final : « Erreur interne pendant <étape> (<NomErreur>) » — plus jamais de message sans cause.
- Journal : `arguments` = `{ etape, erreur_type, erreur_message (≤300 car.), longueur_base64?, taille_octets? }`, jamais le contenu ni le base64.

## 2. `fichier_ref` (fichier envoyé une seule fois)
- À l'aperçu, le serveur contrôle le fichier puis le dépose dans un dossier temporaire privé `mcp-tmp/<user_id>/<sha256>.<ext>` (bucket privé existant `devis-photos` ou nouveau bucket privé, sans politique utilisateur : accès serveur seul) et renvoie `fichier_ref` = SHA-256.
- Confirmation : `fichier_ref` à la place de `fichier_base64`. L'empreinte des arguments est calculée sur une forme normalisée où le fichier est remplacé par son SHA-256 (aperçu en base64 et confirmation en `fichier_ref` donnent la même empreinte ; tout autre argument modifié la change).
- À la confirmation : relecture du temporaire, recalcul SHA-256, contrôle type/taille, copie vers le chemin définitif, retrait du temporaire.
- Purge : fichiers temporaires de plus de 10 minutes retirés à chaque aperçu/confirmation (balayage borné du dossier de l'appelant) et par une tâche planifiée existante ou nouvelle toutes les 10 minutes.
- `devis_ajouter_photos` : jusqu'à 20 images (ligne_id, source, légende chacune), un aperçu groupé, une confirmation groupée, tout ou rien ; passe par le même circuit `devis_mcp_appliquer` (un appel par image dans la même transaction de dispatch ou une variante groupée de la fonction — à arbitrer en lisant la fonction actuelle).

## 3. `documents_affaire_televerser`
- Écriture aperçu → confirmation : affaire, `fichier_base64` ou `fichier_ref`, nom lisible, catégorie parmi les catégories existantes de `affaire_documents`.
- Droits : `section.affaires` + accès en écriture à l'affaire (règle existante `user_can_write_affaire`), sous les droits de l'appelant (aucun client admin métier).
- JPG/PNG/PDF par signature, 10 Mo ; dépôt dans le stockage privé `affaires-photos` ; doublon détecté par empreinte (renvoie le document existant) ; renvoie `document_id`. Aucune suppression.
- Ajout à la liste autorisée `mcp_dispatch_write` / `mcp_dispatch_actif`, journal et idempotence comme les autres écritures.
- OneDrive : non développé. Permission minimale à proposer à Gabin : Microsoft Graph `Files.Read` déléguée (fichiers de l'utilisateur connecté) ; pour les sites SharePoint, `Sites.Selected` en application, limité au(x) site(s) choisi(s). Détail dans le compte rendu.

## 4. `devis_lire` allégé
- Paramètres `vue` (`resume` par défaut | `complet`) et `ligne_ids` (≤ 20).
- `resume` : en-tête, totaux, arbre des lignes (id, parent, type, libellé, quantité, total ligne, nb heures/matériaux/libres), sans détail ni historique long.
- `ligne_ids` : détail complet de ces lignes seulement. Coûts toujours masqués sans `devis.couts` (filtrage appliqué après la lecture actuelle, pas de nouveau lecteur de coûts).
- Description de l'outil mise à jour ; objectif mesuré sur 9539-R1 : résumé < 15 000 caractères.

## 5. `par_unite`
- Lecture de `devis_calculer_interne` et `src/lib/devis/calcul.ts` pour établir le comportement réel des heures, matériaux et lignes libres, puis description des champs `quantite` / `par_unite` dans `devis_remplir`. Calcul inchangé.

## 6. Divers
- `devis_creer_brouillon` : l'aperçu ne renvoie plus de `devis_id` (remplacé par « id attribué à la confirmation »).
- `materiaux_proposer` : à vérifier d'abord le circuit « Prix proposés » existant (`materiaux-propositions.ts`, onglet admin). Crée seulement une proposition statut `propose` (désignation, unité, prix, fournisseur, source), jamais un article validé ; validation admin inchangée. Aperçu → confirmation, liste autorisée.
- Démarrage ~20 s : mesure de l'initialisation (`/mcp` à froid vs à chaud) ; si démarrage à froid du serveur, dire s'il existe un levier simple (ex. imports lourds chargés à la demande dans les outils PDF/IA), sinon rien.
- Liste des articles du catalogue sans prix exploitable (prix nul/vide), lecture seule, livrée dans le compte rendu ; aucun prix modifié.

## Base (migration additive, montrée avant application)
- Ajout de `documents_affaire_televerser`, `materiaux_proposer`, `devis_ajouter_photos` aux listes autorisées (redéfinition explicite des fonctions lues à l'état actuel, sans réécriture dynamique).
- Éventuelle fonction SECURITY DEFINER d'insertion de proposition / document : `REVOKE EXECUTE FROM PUBLIC, anon`, garde de dispatch MCP.
- Bucket temporaire privé si nécessaire (créé par l'outil de stockage, pas par migration).

## Tests
- base64 : tronqué, mal rembourré, sans rembourrage, retours à la ligne, préfixe `data:`, base64url, longueur % 4 = 1.
- empreinte identique aperçu base64 / confirmation `fichier_ref`, différente si un argument change ; `fichier_ref` inconnu ou expiré refusé.
- journal : cause présente, aucun contenu de fichier.
- `devis_lire` résumé vs complet vs `ligne_ids`, coûts masqués.
- Essais réels sur un devis et des documents d'essai, retirés ensuite ; manifeste MCP régénéré ; rien publié.

## Ordre
1 erreurs + reproduction → 4 → 5 → 6 (aperçu brouillon) → migration (relecture) → 2 → 3 → `materiaux_proposer` → tests, manifeste, compte rendu (écran / base / tests).
