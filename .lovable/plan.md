# Plan livraison — Module Staffer-Mobile + Workflow contrat intérim

Brief XL (12-16h, 2 tours). Avant d'exécuter Tour 1, je propose les décisions par défaut sur **4 points d'archi** qui ont un impact transverse, pour qu'on les fige une fois.

---

## Décisions par défaut (à confirmer ou amender)

### D1. Nom de la table employé
Le brief dit `employees` ; le projet utilise `employes` (FR, déjà en prod avec `type_contrat`, `metier_principal_id`, etc., et toutes les RLS y sont rattachées). **Default : on ajoute les 4 champs sur `employes`** — pas de renommage, pas de nouvelle table.

### D2. Coexistence `type_contrat` ↔ `statut_contrat`
`employes.type_contrat` existe déjà (`CDI` / `CDD` / `Interim` / `Independant`) et est utilisé partout (auto-staffing tier-priority, planning, exports SILAE). Le brief demande un nouvel enum `statut_contrat` plus fin (`CDI` / `CDDU intermittent` / `CDD chantier` / `Intérim` / `Apprenti`).
**Default :**
- On garde `type_contrat` intact (ne casse rien)
- On AJOUTE `statut_contrat` (nouvel enum) comme **champ de précision RH** indépendant
- Détection intermittent pour workflow contrat = `statut_contrat IN ('CDDU intermittent','CDD chantier','Intérim')`
- Backfill : pour les employés existants `type_contrat='Interim'` → `statut_contrat='Intérim'` ; `type_contrat='CDI'` → `'CDI'` ; `type_contrat='CDD'` → `'CDD chantier'` ; `Independant` → laissé NULL pour saisie manuelle.

### D3. Mobile « Heures/jour 8 » vs modèle demi-journée existant
Le système actuel travaille en **demi-journées 4h** (`assignations.demi_journee` MATIN / APRES_MIDI, `heures` default 4). Le mobile simplifié demande « heures/jour default 8, max 12 ».
**Default :**
- Le mobile expose 3 options visuelles : ½ journée matin (4h) / ½ journée après-midi (4h) / **journée complète (8h)** — la valeur par défaut est journée complète.
- Côté DB : on crée **N assignations** (1 par demi-journée couverte) sur la plage `date_debut → date_fin`, en sautant les jours non ouvrés (réutilise le helper existant `staffing/date-utils.ts`).
- Pas de support 12h sur mobile en Tour 1 (dépasse le modèle 4h ; à voir avec phase 2 horaires précis prévue v0.40). L'input « heures » devient un Select { 4 / 8 } pour Tour 1. Si tu veux absolument 12h saisis, je le note pour v0.40.

### D4. Convention de routes
Pas de dossier `/rh/` aujourd'hui ; convention TanStack `_app.<segment>.tsx`.
**Default :**
- `/staffer-mobile` → `src/routes/_app.staffer-mobile.tsx` (RoleGuard admin/chef)
- `/rh/contrats` → `src/routes/_app.rh.contrats.tsx` (RoleGuard admin)
- Tour 2 : `/mobile/contrats` → `src/routes/mobile.contrats.tsx` (employé mobile only) + entrée bottom-nav

---

## Tour 1 (~6-8h) — ce que je livre

### A. Migration `employes` + RLS rémunération
- Ajout colonnes : `taux_horaire_brut numeric NULL`, `taux_horaire_charge numeric NULL`, `forfait boolean NOT NULL DEFAULT false`, `statut_contrat statut_contrat_type NULL` (nouvel enum)
- Backfill `statut_contrat` (cf D2)
- Helper SQL `is_admin()` déjà présent → policies SELECT/UPDATE colonnes `taux_*` admin only via **policies au niveau colonne** (column-level GRANT + RLS dédiée). Concrètement : ajouter une policy `employes_select_remu_admin_only` n'est pas suffisant (RLS ne supporte pas encore le mask colonne en select policy unique) — j'utilise un **GRANT SELECT (col1, col2) TO admin_role** + masquage côté code via vue `employes_safe` filtrant les colonnes. À défaut (Supabase n'expose pas de role admin SQL natif côté client), je fais le filtrage **côté code** dans tous les select de fiche employé (admin only) ET je documente. → ⚠️ je peux pousser plus loin si tu veux du masquage hard SQL avec une fonction wrapper, dis-le.
- UI fiche employé : nouvelle section « Rémunération » conditionnelle `isAdmin`.

### B. RPC `upsert_intermittent` (seed-ready)
- Type signature exact comme demandé. Clé idempotence = `LOWER(TRIM(nom_complet))` matché contre `LOWER(TRIM(nom||' '||prenom))` ou `prenom||' '||nom`. Si match → UPDATE only des champs NULL. Sinon → INSERT avec `actif=false`, `type_contrat` mappé selon `statut`, `metier_principal_id` résolu via `poste` (lookup `metiers.libelle ILIKE`).
- Tu pousses ton seed SQL ensuite, la RPC sera prête.

### C. Module `/staffer-mobile`
- Form mobile-first sticky bottom button « Confirmer ».
- Recherche fuzzy personne (réutilise `MultiSelectCombo` créé hier + `string-normalize`).
- Recherche chantier (numéro + nom).
- Métier auto-rempli depuis `employe.metier_principal`, modifiable.
- Date range picker compact + select 4h/8h (cf D3).
- **Détection conflit dispo** : warning si la personne a déjà une assignation OU une absence validée chevauchante → modale « Continuer ? » (non bloquant, juste warn).
- Submit :
  1. Crée N assignations (1 par demi-journée jours ouvrés, hors absences validées)
  2. Si `statut_contrat IN (intermittent / CDD chantier / Intérim)` → crée 1 ligne `contrats_intermittents` (statut `'À signer (employé)'`) + 1 notification `notifications` push pour l'employé
  3. Toast succès + reset form

### D. Page admin `/rh/contrats`
- 4 onglets `Tabs` (À créer / Signés / Archivés / Tous)
- Filtres : période, employé (multi-select), chantier (multi-select)
- Stats header : nb à signer ce mois, montant facturable estimé (`SUM(taux_brut × heures)` agrégat)
- Action ligne : voir détail (modale) + bouton « Relancer signature » (Tour 2 → email Resend) + « Télécharger PDF » (Tour 2 → si v3 url existe)
- En Tour 1 : tout le squelette UI + listing fonctionnel ; les actions PDF/email seront branchées Tour 2.

### I (partiel). Tables DB
- `contrats_intermittents` (toutes colonnes du brief) + RLS (admin all + employé voit ses propres via `employes.profile_id = auth.uid()`). INSERT bloqué client-side ; uniquement via RPC SECURITY DEFINER appelée par `/staffer-mobile`.
- `contrats_signatures` créée AVEC les RLS (mais utilisée Tour 2).
- Enums : `statut_contrat_type`, `contrat_intermittent_statut`, `signataire_role`.

### Hors-scope Tour 1 (→ Tour 2)
- F. Génération PDF react-pdf (template TSX figé)
- G. Signature canvas react-signature-canvas + upload Storage + hash SHA-256
- H. Workflow 2 étapes séquentielles + 3 versions PDF
- E. Onglet mobile « Mes contrats » + bottom nav
- K. Emails Resend (3 templates) — push notifs Tour 1 OK
- L. Tests E2E Playwright

---

## Tour 2 (~5-7h) — ce que je livrerai après

E + F + G + H + K + L tels que décrits. Bucket Storage privé `contrats-intermittents` créé. Edge Function (ou server fn) `sign-contract` qui orchestre upload signature + incrust PDF + hash + transition statut + email Resend.

---

## Risques / questions ouvertes

1. **Masquage taux_horaire** — RLS column-level n'est pas natif Supabase. Filtrage côté code (admin-only select) est la voie réaliste. Confirme que ça te va, sinon on bascule sur une vue SQL wrapper (~1h de plus).
2. **« role='intermittent' »** dans le brief B — il n'y a pas de `role` sur `employes`. J'interprète comme `statut_contrat='CDDU intermittent'` + `actif=false`. OK ?
3. **12h/jour mobile** — pas supportable proprement avant phase 2 horaires précis. OK pour Select 4h/8h en Tour 1 ?
4. **Signature simple eIDAS** confirmée recevable Article 1367 — pas de Yousign Phase 1, OK noté.

Si tu valides ces 4 décisions par défaut **en réponse rapide** (« go » suffit, ou liste les amendements), j'enchaîne Tour 1 immédiatement.
