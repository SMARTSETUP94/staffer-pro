# Lot 3 — Transfert des devis Staffing vers ProGBat

Plan seulement : rien n'est appliqué ni publié avant ton accord écrit.

## Constat vérifié dans l'existant
- `devis.numero_progbat` existe déjà ; l'éditeur l'a en lecture, le bouton « Vers ProGBat (lot 3) » est désactivé en dur.
- « Marquer envoyé » (`devis_marquer_envoye`, dernière version en migration 0070) passe le devis en `statut_redaction='transfere'` et pose `date_envoi`. Donc aujourd'hui « transfere » veut dire « envoyé », d'où le statut de 9484-R2.
- Signature, refus et pipeline acceptent déjà `transfere` comme état figé (migration 0061). Aucun nouveau statut n'est donc nécessaire.

## Décision proposée : un statut, deux faits distincts
- `transfere` reste le statut « figé, sorti de Staffing ». Pas de nouvelle valeur d'enum, aucun devis existant cassé.
- Deux faits séparés et visibles :
  - **Transféré dans ProGBat** = `numero_progbat` + `transfere_progbat_le` / `transfere_progbat_par` renseignés.
  - **Envoyé au client** = `date_envoi` renseignée.
- Les libellés affichés viennent de ces faits (« Transféré ProGBat D-202611-0012 », « Envoyé le … », ou les deux), pas du seul statut.
- « Marquer envoyé » : accepté sur un devis validé **ou** déjà transféré. Sur un devis transféré, il ne pose que `date_envoi` et l'action d'opportunité. Les devis existants comme 9484-R2 gardent leur statut et s'affichent « Envoyé », sans numéro ProGBat.

## Passe 1 — Base de données (migration 0078)
- Nouvelles colonnes sur `devis` : `transfere_progbat_le`, `transfere_progbat_par`, `total_progbat`, `ecart_progbat_motif`. Contrainte de format `^D-\d{6}-\d{4}$` sur `numero_progbat` en `NOT VALID`, après contrôle des valeurs déjà en base.
- Index unique partiel sur `numero_progbat` non nul (un numéro officiel par devis), sauf si les imports historiques en ont des doublons. Je vérifie avant d'appliquer.
- `devis_exports` : nouvelle colonne `format` ('pdf' | 'progbat_xlsx'), défaut 'pdf', et `fiche` jsonb pour la fiche de contrôle.
- RPC `devis_progbat_donnees(devis_id)`, en lecture : construit les lignes de l'export à partir de `devis_calculer_interne`, en ne gardant que les champs client (même filtre que `devis_lire_client`). Refus si le statut n'est ni `valide` ni `transfere`.
- RPC `devis_enregistrer_transfert(devis_id, numero, total_lu, motif)`. Contrôles :
  - droit d'écriture ;
  - statut `valide` ;
  - format du numéro ;
  - total lu comparé à `net_ht` au centime : un motif est obligatoire s'il y a un écart.

  Effet : statut `transfere`, champs ProGBat remplis, devis figé par le verrou existant (`devis_assert_ecriture`), journal.
- Ajout de cette RPC aux deux listes blanches : `mcp_dispatch_write`, et le préfixe `mcp_assert_legacy_oauth_write`.
- `devis_nouvelle_version` : vérifier qu'elle repart en brouillon sans recopier les champs ProGBat ni `date_envoi`.

## Passe 2 — Générateur Excel (code partagé appli + Claude)
- Fichier pur `src/lib/devis/progbat-export.ts` : lignes de l'export → lignes Excel + fiche de contrôle. Testable sans base de données.
- Correspondance des lignes :
  - zone → titre N ;
  - objet → ligne N.n (u, prix unitaire = total / quantité arrondi, temps prévu = heures de l'objet) ;
  - commentaires en dessous : dimensions « L × l × H mm », descriptif client, commentaires visibles client ;
  - « Ajustement d'arrondi » (1 u) si l'arrondi crée un écart ;
  - Suivi et plans / Pose / Dépose → titre + une ligne « 1 ens » ;
  - « Options » en fin de fichier ;
  - ligne d'en-tête en tête de feuille.
- Écriture avec `xlsx-js-style` (règle du projet), chargé seulement au clic.
- Fiche de contrôle :
  - totaux HT attendus avant et après remise, nombre de lignes ;
  - options (incluse ou non) et remise (montant + mode) ;
  - dates clés, client / contact / client final ;
  - photos visibles client avec liens d'une heure.
- Fonction serveur authentifiée : génère le fichier, le range dans le stockage privé `devis-exports`, ajoute l'export à l'historique (version, auteur, format) et renvoie les liens d'une heure.
- Garde-fou de test : aucune clé interne (heures par poste, taux, coût, achat, coef, marge, note Claude, ligne interne) dans les cellules.

## Passe 3 — Interface
- Bouton « Vers ProGBat » actif sur un devis validé. Il télécharge l'Excel et ouvre une fenêtre avec la fiche de contrôle, les liens photos et le bouton « Enregistrer le transfert ».
- Fenêtre « Enregistrer le transfert » :
  - champs numéro ProGBat + total HT lu, avec libellés au-dessus ;
  - contrôle de format en direct ;
  - comparaison au centime : badge vert si égal, alerte ambre sinon, avec motif obligatoire.
- Numéro ProGBat visible dans la liste des devis, l'en-tête de l'éditeur, la vignette pipeline et le PDF Staffing (« Réf. ProGBat »).
- Historique des exports : les deux formats (PDF / Excel ProGBat) sont distingués.

## Passe 4 — Claude (MCP)
- `devis_exporter_progbat`, en lecture : renvoie l'Excel en cours ou en génère un, plus la fiche et les liens d'une heure. Refus si le devis n'est pas validé ou transféré.
- `devis_enregistrer_transfert`, en écriture :
  - aperçu (écart affiché) + confirmation ;
  - refus en mode autonomie ;
  - l'aperçu demande explicitement l'accord humain ;
  - journal dans `devis_mcp_journal`.
- Instructions serveur : Claude importe dans ProGBat via Chrome avec Gabin, supprime la ligne d'en-tête, passe les options en Option/Variante, applique la remise de la fiche, ne finalise ni n'envoie jamais le devis ProGBat, puis propose l'enregistrement du transfert.
- Extraction du manifeste, mise à jour des tests connecteur.

## Recette (en transactions annulées, sauf le fichier d'exemple)
- Les 3 devis de référence reconstruits et validés : somme des lignes de l'Excel = total HT au centime ; remise et options dans la fiche (2460 avec option incluse).
- 9484-R2 : 9 510,99 € HT, lame 18 × 319,88 + ajustement 0,02 €. Fichier d'exemple remis dans tes Fichiers ; il n'est pas ajouté à l'historique de 9484-R2 sauf si tu le veux.
- Aucune ligne interne ni coût dans le fichier ; numéro mal formé refusé ; écart signalé et motif exigé ; devis transféré non modifiable ; nouvelle version en brouillon sans numéro ProGBat.
- Claude : export refusé sur un brouillon, transfert refusé en autonomie, appel anonyme refusé.
- Compte rendu après chaque passe, arrêt immédiat si un test échoue.

## Risques et découpage proposé
1. **Statut `transfere` déjà utilisé pour « envoyé »** : la séparation par les faits évite une migration de données. En contrepartie, les anciens devis « transfere » sans numéro ProGBat s'affichent « Envoyé » seulement. À valider.
2. **Format d'import ProGBat non vérifié** : je n'ai pas accès à ProGBat. Faire un vrai import du fichier 9484-R2 avant la passe 4 permet d'ajuster les colonnes (Temps prévu en heures décimales ? unité « ens » reconnue ?).
3. **Ajustement d'arrondi visible du client** dans ProGBat : une ligne de quelques centimes peut surprendre. Alternative : ajuster le prix unitaire de la dernière unité, impossible avec une seule ligne. À confirmer.
4. **Remise et options appliquées à la main par Claude** dans ProGBat : c'est la principale source d'erreur, d'où la comparaison obligatoire du total lu.
5. **Total lu par Claude** : c'est une saisie déclarative. Le contrôle n'est fiable que si Claude lit bien le total net HT de ProGBat ; les instructions le précisent.
6. **Doublons possibles de `numero_progbat`** dans les imports historiques : à vérifier avant la contrainte unique.

Découpage conseillé : **3a** (passes 1-3 + fichier d'exemple), puis un vrai import ProGBat avec Gabin, puis **3b** (passe 4 Claude + recette finale).
