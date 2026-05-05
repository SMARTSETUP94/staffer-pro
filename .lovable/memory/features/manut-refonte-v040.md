---
name: Refonte algo Manut v0.40
description: Manut DEBUT+TRANSFERT absorbés au prorata par Bois/Peint/Tap, seul Manut FIN reste global
type: feature
---

## Spec

Dans 95 % des chantiers Setup Paris, Manut DEBUT (35 %) + TRANSFERT (15 %) sont en réalité faits par les constructeurs eux-mêmes (Bois / Peinture / Tapisserie). Seul Manut FIN (50 %) est exécuté par une vraie équipe Manut séparée.

## v0.40.0a (livré 5 mai 2026)

### Algo (`src/lib/staffing/algo.ts`)
- Nouveau flag `PlanInput.is_manut_absorbed` (défaut `true`).
- Quand `true` ET `Bois+Peint+Tap > 0` :
  - **Aucun** step Manut DEBUT ni TRANSFERT par objet.
  - `hAbsorbable = hManut * (0.35 + 0.15) = hManut * 0.50` réparti au prorata sur Bois/Peint/Tap (poids = heures de base de chaque métier sur l'objet).
  - `hMetier_eff = hMetier_base + hAbsorbable * (hMetier_base / totalAbsorber)`.
- Quand `false` (legacy v0.37) : 3 phases Manut par objet (DEBUT/TRANSFERT/FIN) — comportement inchangé.
- Cas dégénéré (objet avec Manut mais sans Bois/Peint/Tap) : **fallback automatique** sur DEBUT/TRANSFERT pour ne pas perdre les heures.
- `Manut FIN` (50 %) inchangé : agrégé chantier, 2 derniers jours ouvrés, `objet_id = null`.

### DB
- Migration : `staffing_plan.is_manut_absorbed boolean NOT NULL DEFAULT true`.
- Plans existants → `true` automatiquement (les nouveaux replans appliqueront la nouvelle règle).
- Le flag est lu côté serveur dans `src/server/staffing.functions.ts` et passé à `calculatePlan`.

### Tests
- `src/lib/staffing/__tests__/algo-v040-manut-absorption.test.ts` — 7 tests verts (par défaut, prorata, legacy, fallback dégénéré, constantes 35/15/50).
- `algo-v037.test.ts` et `algo-v037-fixtures.test.ts` ont été passés en mode `is_manut_absorbed: false` pour préserver les invariants legacy.
- 1358/1358 vitest verts.

## v0.40.0b (livré 5 mai 2026)

### UI Gantt (`src/components/staffing/GanttInteractif.tsx`)
- Section globale renommée : `"Phases globales chantier — Manutention FIN (50 %) + ressources partagées (CNC)"` (ex « Phase amont — ressource partagée »).
- Aucune intervention sur le rendu par objet : l'algo v0.40.0a n'émettant plus de steps Manut DEBUT/TRANSFERT par objet, les barres correspondantes disparaissent automatiquement.
- Manut FIN reste affichée dans la section globale (objet_id = null).

### Pré-paramétrage (`PreParametrageSection.tsx` + `staffing-pre-parametrage.functions.ts`)
- `suggestPreParametrage` retourne désormais `manut_absorbed_par_metier: { Bois, Peint, Tap }`.
- Les `totalsEffectifs` passés à `autoSuggestMetierConfig` incluent l'absorption (Bois/Peint/Tap majorés au prorata) et `Manut = total * 0.5` (FIN seul).
- Cellule "Total h" enrichie : suffixe gris `(+19 Manut)` quand absorption > 0 + tooltip natif `"Bois 105h dont 19h ex-Manut absorbée (base 86h)"` (testid `pre-param-totalh-{Metier}`).
- Footnote refondue : explicite la règle Manut DÉBUT 35 % + TRANSFERT 15 % absorbés / FIN 50 % équipe Manut.

### E2E
- `e2e/staffing/manut-refonte-v040.chef.spec.ts` (smoke 2 tests : footnote pré-param + header section globale renommée).

### Validation
- 1358/1358 vitest verts (aucune régression).
- Reste : test terrain Gabin sur HPDN 5905 + autres plans.

## v0.40.0b+1 — Récap Manut header Gantt (livré 5 mai 2026)

- `calculateStaffingPlan` retourne `manut_summary` : `{ is_absorbed, manut_total_h, fin_total_h, absorbable_total_h, absorbed_bois_h, absorbed_peint_h, absorbed_tap_h, fallback_objets }`. Calculé côté serveur depuis `objetsInput` (réplique des constantes 35/15/50).
- `GanttInteractif` : 5e StatCard "Manut FIN + absorbée" (icône Truck) avec valeur `{X h FIN}`, subline `+ absorbé : B.. · P.. · T..` visible sans clic, et popover détaillé (total devis, FIN, table absorbée, fallback objets dégénérés).
- Grid stats passé `md:grid-cols-5`. StatCard gagne un prop optionnel `subline`.

## v0.40.0c (optionnel — peu prio)

Script one-shot pour replanifier les plans publiés existants. **Pas urgent** : Gabin a recréé HPDN 5905 from scratch, la plupart des plans en prod sont des brouillons.
