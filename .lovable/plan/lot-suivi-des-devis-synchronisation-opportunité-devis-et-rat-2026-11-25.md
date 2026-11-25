# Lot « Suivi des devis » : synchronisation opportunité ↔ devis et rattrapage des signés

Mode plan : rien n'est appliqué. Le plan « Relances commerciales » reste en attente ; il est conservé à part et sera repris à la suite de ce lot.

## Constat vérifié (lecture seule, 25/11, dernière version Staffing non supprimée par affaire)

| Constat | Votre chiffre | Vérifié |
|---|---|---|
| Affaires analysées | 109 | 109 |
| Phase « signé » sans devis signé | 18 / 23 (8 brouillons, 7 finalisés, 3 transférés) | identique |
| Opportunités « Envoyé » jamais transférées | 10 / 15 (6 brouillons) | identique (6 brouillons + 4 finalisés) |
| Devis sans date d'envoi | 101 / 109 | identique |
| « Gagné » resté en phase opportunité | 1 (brouillon) | identique |
| Devis refusé sur opportunité « à faire » | 1 | identique |
| Numéro ProGBat provisoire (S…) | 1 | 1 numéro S…, plus 2 devis avec un numéro provisoire enregistré à part |
| Ancien statut = brouillon | 132 / 135 | 132 / 135 actifs (138 / 141 avec les supprimés) |

Fonctions existantes réutilisées : devis_marquer_envoye(date), devis_marquer_signe, devis_enregistrer_transfert, devis_nouvelle_version, devis_opp_avancer, app_modifier_affaire, pipeline_indicateurs.

## 1. Une seule logique opportunité ↔ devis
- « Envoyé » est posé seulement par le transfert ProGBat ou par « Marquer envoyé ». Les deux ajoutent une action « devis envoyé » datée à l'historique de l'opportunité.
- « Gagné » : une fenêtre demande quelle version a été retenue et la date de signature. La version passe en « Signé » (gel des heures BE actuel conservé tel quel), la phase passe en signé (code affaire choisi comme aujourd'hui), et les autres versions ouvertes passent en « Remplacé » (à arbitrer, Q1).
- « Perdu » ↔ « Refusé » : pas de changement.
- Tout passage manuel incohérent est refusé avec un message qui dit quoi faire. Exemple : « Envoyé avec un devis brouillon : finalisez puis marquez-le envoyé ».
- Claude peut lire mais ne peut jamais poser « Gagné » ou « Perdu » (règle existante conservée).
- Fichiers : src/lib/opportunites.ts (kanban et glisser), src/components/opportunites/DevisPipeline.tsx, SignerOpportuniteDialog, nouveau module pur src/lib/devis/synchro-opportunite.ts (règles de cohérence, testées).
- Base : app_modifier_affaire (refus des statuts incohérents), nouvelle fonction devis_signer_version(_devis_id, _date, _remplacer_autres) qui appelle devis_marquer_signe sans le modifier.

## 2. Geste « Marquer envoyé le… »
- Proposé sur un devis Finalisé ou Transféré. Champs : date (aujourd'hui par défaut, jamais dans le futur), canal (mail, en main propre, ProGBat, autre), note facultative.
- Il pose date_envoi, ajoute l'action et passe l'opportunité en « Envoyé ».
- Pour un brouillon ou un devis « À valider », le geste passe d'abord par « Avant de valider », sans changement des contrôles ni de leur journal.
- Fichiers : DevisActionsListe.tsx, DevisEditeur.tsx, DevisPdfEnvoi.tsx, nouveau dialogue MarquerEnvoyeDialog.tsx.
- Base : devis_marquer_envoye prend en plus le canal et la note (nouvelle signature, l'ancienne est gardée pour compatibilité), et écrit dans opportunite_actions.

## 3. Écran « Suivi à régulariser » (/commercial/suivi-a-regulariser)
- Cinq familles d'écarts : signé sans devis signé ; « Envoyé » sans date d'envoi ; « Gagné » resté en phase opportunité ; devis refusé sur une opportunité ouverte ; numéro ProGBat provisoire depuis plus de 7 jours (saisie D-AAAAMM-NNNN, format contrôlé).
- Chaque ligne affiche affaire, client, montant HT, écart et un bouton d'action. Ce bouton réutilise les gestes 1 et 2, ou permet de repasser l'opportunité à « À faire » / « À l'étude ».
- Accès admin, et commercial sur ses affaires. Compteur dans le menu Commercial. Cartes à 390 px.
- Base : un lecteur suivi_ecarts_lire() en SECURITY INVOKER, filtré par les droits existants (pas de coûts), et devis_progbat_numero_definitif(_devis_id, _numero).

## 4. Tableau de suivi commercial (/commercial/suivi)
- Colonnes À finaliser, À envoyer, Envoyés (jours depuis l'envoi), Validité ≤ 7 j, Signés. Par défaut « Mes affaires », « Toutes » pour l'admin.
- Il lit pipeline_indicateurs et les lecteurs existants. Pas de nouveau calcul de montant, et ni coûts ni marges.
- Classement par module pur src/lib/devis/suivi-commercial.ts (testé).

## 5. Ancienne colonne devis.statut
- Encore lue ou écrite : imports ProGBat (preflight_import_devis, import), devis_finaliser, devis_soumettre, la page /devis (historique), les vues v_devis_consommation et v_affaire_consommation, ainsi que plusieurs lecteurs planning et MCP qui seront inventoriés ligne par ligne dans le compte rendu.
- Proposition : ne rien supprimer dans ce lot. On ajoute un commentaire « DEPRECATED pour les devis Staffing, le statut à suivre est statut_redaction », et l'inventaire complet sera joint au compte rendu.

## MCP
- devis_lire et lecture du pipeline : ajout du statut synchronisé et des écarts (lecture).
- Nouvel outil en lecture « suivi_a_regulariser ».
- Pas d'outil d'écriture dans ce lot (Q4). Le manifeste sera régénéré.

## Migration proposée (montrée complète avant application)
- Contenu : nouvelle signature de devis_marquer_envoye (canal, note, action) ; devis_signer_version ; garde de cohérence dans app_modifier_affaire ; suivi_ecarts_lire ; devis_progbat_numero_definitif ; un type d'action « devis_envoye » si absent de l'énumération ; commentaire de dépréciation sur devis.statut.
- Pour chaque fonction modifiée, le compte rendu reprendra la définition actuelle (pg_get_functiondef) avec un diff ligne à ligne fait juste avant l'application, et le texte d'un fichier de retour arrière.
- REVOKE EXECUTE FROM PUBLIC, anon sur chaque nouvelle fonction et GRANT au rôle authenticated. Aucune table nouvelle, donc pas de nouvelle RLS.
- Aucune ligne réelle n'est réécrite : aucun rattrapage automatique.

## Recette (après accord)
- Essais sur données fictives isolées, puis nettoyées.
- Tests purs : cohérence des statuts, date d'envoi jamais dans le futur, format ProGBat, classement du suivi.
- Captures à 1366 et 390 px.
- Liste des écarts recalculée en lecture seule sur la base réelle (18 + 10 + 1 + 1 + ProGBat).
- Rien publié.

## Questions pour Gabin
1. À la signature, faut-il passer les autres versions ouvertes en « Remplacé » ? Proposition : oui, mais avec une case décochable dans la fenêtre.
2. « Envoyé » sans date d'envoi, sur un devis brouillon : peut-on autoriser « Finaliser puis marquer envoyé » depuis l'écran de régularisation (avec les contrôles), ou faut-il seulement repasser l'opportunité en arrière ?
3. Date de signature passée lors du rattrapage : la permettre à tous les commerciaux, ou la réserver à l'admin comme les dates passées du barème ?
4. Claude doit-il pouvoir « Marquer envoyé » avec une confirmation humaine dans la conversation, ou rester en lecture seule dans ce lot ? Proposition : lecture seule.
5. Le compteur du menu doit-il compter les écarts de l'utilisateur seulement, ou tous les écarts pour l'admin ?
