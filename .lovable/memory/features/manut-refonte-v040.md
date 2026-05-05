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

## v0.40.0b (à venir)

- UI Gantt : nettoyer les lignes Manut par objet quand `is_manut_absorbed = true`.
- Pré-paramétrage 6 lignes (avant le wizard) avec tooltips.
- Toggle "Manut absorbée" sur le plan (admin uniquement, par défaut activé).
- E2E `manut-refonte-v040.chef.spec.ts`.

## v0.40.0c (optionnel — peu prio)

Script one-shot pour replanifier les plans publiés existants. **Pas urgent** : Gabin a recréé HPDN 5905 from scratch, la plupart des plans en prod sont des brouillons.
