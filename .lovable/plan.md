# Relances commerciales — plan (rien appliqué)

Jamais d'envoi d'e-mail par l'application ni par Claude : brouillons copiables et lien Outlook uniquement.

## Écrans
- **Page « À relancer »** (menu Commercial, `/relances`) : filtre Mes affaires (défaut) / chargé d'affaires / Tous (admin). Colonnes : affaire, client, contact, montant HT retenu, statut, motif(s), dernière action, jours d'attente. Tri priorité puis montant. 390 px : cartes.
- **Préparer la relance** (panneau latéral / bas) : brouillon IA (Claude Haiku via le module existant), adapté au motif et à l'historique (n° devis, date d'envoi, objet). Aucune donnée de coût/marge transmise à l'IA ; montant HT seulement si « mentionner le montant » coché. Texte modifiable, boutons « Copier » et « Ouvrir dans Outlook » (mailto prérempli : contact du devis, objet, corps).
- **Relance faite** : canal (mail / téléphone / autre), date, note ; propose la prochaine action à J+7 (modifiable). **Reporter** (date) et **Ignorer cette semaine** (motif obligatoire), sans action fictive.
- **Accueil** : encart « N relances cette semaine ». **Cloche** : une notification le lundi 7 h (Paris), rien d'autre.
- **Paramètres › Devis** : délais 7 / 7 / 14 jours, versionnés avec date d'effet comme le barème.

## Motifs (priorité)
1. Devis envoyé sans réponse ≥ N jours et aucune action depuis l'envoi (règle actuelle du pipeline).
2. Prochaine action en retard.
3. Validité du devis expirant dans ≤ 7 jours.
4. « À l'étude » / « Presque gagné » sans action depuis ≥ 14 jours.
5. Sans prochaine action.

## Claude
Outil lecture `relances_a_faire` (même lecteur, sans coûts) ; écriture via `ajouter_action_opportunite` existant. Manifeste régénéré.

## Droits
Admin, commercial ; chef de projet sur les affaires où il tient un rôle projet. Jamais l'atelier, ni l'écran d'atelier.

## Outlook
L'accès Microsoft actuel est un accès d'application sur les boîtes partagées (lecture seule imposée). Le jeton relu ne porte aucune autorisation d'écriture de courrier : créer un brouillon dans la boîte de l'utilisateur demanderait un nouveau droit. Donc mailto uniquement, comme convenu.

## Points à confirmer
- « Chef de projet » = titulaire d'un rôle projet (responsable projet, chargé d'affaires…) sur l'affaire, quel que soit son rôle d'application ?
- Canal « autre » : nouveau type d'action `relance_autre` (mail et téléphone réutilisent les types existants).
- Mailto : les corps longs peuvent être tronqués par certains navigateurs (~2 000 caractères) ; « Copier » reste la référence.

## Détails techniques
Migration proposée : `.lovable/proposals/relances-commerciales-proposition.sql` (table de reports, 2 valeurs d'énumération, capacité, lecteur invoker, listes blanches, cron hebdomadaire). Règles de motifs en module pur testé (`src/lib/relances/motifs.ts`) miroir du lecteur SQL. Aucune donnée réelle modifiée, rien publié.
