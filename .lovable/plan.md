# Lot 4 — Outils Claude (MCP) pour les devis Staffing

Rien n'est appliqué ni publié tant que ce plan n'est pas approuvé. Découpage proposé en 4 passes, avec arrêt et compte rendu après chacune.

## Constats vérifiés avant le plan
- Le serveur MCP existe (`src/lib/mcp/`, 25 outils, écritures via `write-policy.ts` / `write-preview.ts` / `write-schemas.ts`).
- Droit d'exécution anonyme encore ouvert sur 5 fonctions : `mcp_dispatch_write`, `mcp_execute_write_locked`, `mcp_write_preview`, `mcp_assert_write`, `mcp_safe_diff`. Les autres `mcp_*` et les RPC devis citées sont déjà fermées à l'anonyme.
- Dernière migration : 0070.

## Passe 0 — Sécurité préalable (migration 0071)
- `REVOKE EXECUTE ... FROM anon, public` sur les 5 fonctions ci-dessus ; `GRANT EXECUTE TO authenticated` (+ le rôle de dispatch NOLOGIN existant pour celles qu'il appelle).
- `mcp_safe_diff` (non SECURITY DEFINER) : fermée aussi par principe.
- Test : appel avec rôle `anon` → `permission denied` sur chacune ; tests `write.test.ts` existants toujours verts.

## Passe 1 — Base de données (migration 0072)
1. Colonnes `devis` : `cree_par_mcp bool default false`, `cle_externe text`, `modifie_par_humain_le timestamptz`, `note_mcp text`. Index unique partiel `(affaire_id, cle_externe) where cle_externe is not null`. Ajout uniquement, aucune donnée modifiée.
2. Table `devis_mcp_journal` (id, devis_id, affaire_id, outil, mode, arguments jsonb sans texte libre sensible, apercu jsonb, resultat jsonb, auteur uuid, client_oauth, cree_le). GRANT select authenticated + service_role ; RLS lecture = `devis_peut_lire(devis_id)` ; écriture uniquement par le dispatch.
3. Verrou humain : trigger AFTER INSERT/UPDATE/DELETE sur `devis` et ses lignes (`devis_lignes`, `devis_heures`, `devis_materiaux`, `devis_lignes_libres`, `devis_photos`) : si le contexte de dispatch MCP (`mcp_write_dispatch_context` de la transaction) est absent, poser `modifie_par_humain_le = now()` sur le devis. Garde de profondeur pour éviter la récursion avec le trigger existant `app.devis_rpc`.
4. Nouvelle RPC interne `devis_soumettre(devis_id, note)` : uniquement brouillon → `a_valider`, réutilise `devis_statut_changer` (mêmes contrôles : forfait sans prix, etc.), stocke la note dans `note_mcp`.
5. RPC interne `devis_remplir_lot(devis_id, lignes jsonb)` : boucle sur ≤ 300 éléments, appelle les RPC existantes (`devis_objet_inserer`, `devis_ligne_enregistrer`, `devis_heure_enregistrer`, `devis_materiau_enregistrer`, `devis_libre_enregistrer`, `devis_option_inclure`) avec références locales (`ref` → id créé) pour rattacher enfants aux parents ; une exception annule tout. Renvoie `devis_calculer`.
6. Extension de `mcp_dispatch_write` (redéfinie à partir de sa définition actuelle relue, pas de réécriture dynamique) : liste blanche de 6 actions devis — `devis_creer_brouillon`, `devis_remplir`, `devis_modifier_entete`, `devis_ajouter_photo`, `devis_nouvelle_version`, `devis_soumettre`. Toute autre action devis → refus explicite. Pour chacune : `devis_assert_brouillon` (sauf création / nouvelle version), contrôle du mode (`autonomie` refusé si `modifie_par_humain_le` rempli, message « brouillon repris par <nom> »), journalisation dans `devis_mcp_journal`.
7. `mcp_write_preview` : aperçu avant/après pour ces actions (lignes ajoutées par type, total HT/net avant → après calculé en simulation dans une transaction annulée via savepoint, écarts entre taux saisis et taux de la grille).
8. Création brouillon : réutilise `devis_creer_depuis_pipeline` avec modèle (défaut `devis_modele_defaut_id`), pose `cree_par_mcp`, `cle_externe` ; même clé → renvoie le devis existant ; brouillon actif déjà présent sur l'affaire → refus avec son id.
9. Remise : aucun seuil (décision Gabin) ; toute remise acceptée sur un brouillon, visible dans l’aperçu et le journal.

## Passe 2 — Serveur MCP (code)
Fichiers neufs dans `src/lib/mcp/tools/` : `devis_lister.ts`, `devis_lire.ts`, `devis_referentiel.ts`, `materiaux_rechercher.ts`, `devis_charge_be.ts` (lecture, appel direct des RPC sous le client de l'appelant ; coûts déjà filtrés côté serveur par `devis.couts`), et 6 outils d'écriture branchés sur le flux aperçu → `confirmation_id` → exécution.
- `write-schemas.ts` : schémas Zod (lot ≤ 300, `mode` obligatoire, `cle_externe`).
- `write-policy.ts` / `write-preview.ts` : ajout des 6 actions.
- `devis_ajouter_photo` : fonction serveur authentifiée ; vérifie type réel (JPG/PNG/PDF par signature), 10 Mo max après décodage base64, dépôt dans le stockage privé des devis sous le client de l'appelant, puis `devis_photo_ajouter` ; légende « Source : … ». Limite : taille de requête MCP — un PDF de 10 Mo fait ~13,5 Mo en base64, à tester.
- `index.ts` : enregistrement + instructions mises à jour (outils, interdits, verrou humain, mode).
- Tests Vitest : schémas, liste blanche, refus des actions interdites.

## Passe 3 — Interface
- Badge « Rédigé par Claude » dans la liste Devis et l'onglet Devis de l'affaire, et dans l'éditeur.
- Encadré « Note de Claude » en tête de l'éditeur si `note_mcp`.
- Mention « repris par <nom> le … » quand `modifie_par_humain_le` est rempli.

## Recette (transactions annulées + manifeste)
1. 3 devis ProGBat recréés via `devis_remplir` : D-202609-2432 net 19 600,00 ; D-202610-2462 net 47 000,00 ; D-202610-2460 HT 15 988,00 option incluse — au centime.
2. Même `cle_externe` deux fois → un seul brouillon.
3. Lot avec une ligne invalide → aucune ligne écrite.
4. Modification humaine → autonomie refusée, conversation acceptée.
5. Actions interdites (valider, envoyer, signer, fabrication, supprimer, restaurer, taux, paramètres, modèles) refusées.
6. Rôle sans `devis.couts` → ni achat ni marge dans `devis_lire` / `materiaux_rechercher` / `devis_referentiel`.
7. Appel anonyme refusé.
8. Une ligne de journal par écriture.
9. Photo visible sur l'objet dans l'éditeur (aperçu navigateur).
10. Extraction du manifeste MCP réussie.

## Risques et découpage
- **Le plus risqué : redéfinir `mcp_dispatch_write` et `mcp_write_preview`** (fonctions critiques partagées avec opportunités/logistique). Je les relis telles quelles et n'ajoute que des branches ; tests de non-régression v2 obligatoires.
- **Trigger verrou humain** : risque de faux positifs (recalculs, triggers internes, versions) qui bloqueraient Claude en autonomie. À tester sur chaque RPC devis.
- **Aperçu avec totaux simulés** : exécuter le lot dans un savepoint annulé pour calculer l'« après » ; coûteux pour 300 lignes, à mesurer.
- **Photos base64** : taille de message MCP et temps d'appel ; possiblement plafonner à 5 Mo si 10 Mo échoue.
- **Seuil de remise** : paramètre inexistant à ce jour — valeur à fixer par toi.
- **Refus « un brouillon actif existe »** vs `devis_nouvelle_version` : la nouvelle version crée un brouillon, à exclure de la règle quand l'original est envoyé.
- Publication nécessaire à la fin pour que Claude voie les nouveaux outils (non faite sans ton accord).

Ordre : Passe 0 → 1 → 2 → 3 → recette, arrêt et compte rendu après chaque passe, arrêt immédiat si un test échoue.
