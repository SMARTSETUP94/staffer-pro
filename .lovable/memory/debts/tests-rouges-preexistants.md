---
name: 9 tests rouges pré-existants (avant Sprint A)
description: 9 tests Vitest cassés dans 3 fichiers (dashboard layout/personnaliser + affaire-typologie). Tracés en dette pour mini-sprint post-Sprint B.
type: constraint
---
# Dette — 9 tests rouges pré-existants (vue confirmée 24/05/2026)

## Fichiers concernés
1. `src/lib/__tests__/affaire-typologie.test.ts` — 1 test
   - **Symptôme :** attend `var(--typologie-…)` (tokens CSS), reçoit `#E2E8F0` (hex hardcodé)
   - **Commit fautif :** `fb5bb932 "Changes"` (avant Sprint A) — refacto typologie qui a oublié de mettre à jour le test
2. `src/lib/__tests__/dashboard-layout.test.ts` — 4 tests
   - **Symptôme :** attend exactement 25 widgets, en trouve 26
   - **Commit fautif :** `605b8758/989d6e68/96f9b9e1` (avant Sprint A) — ajout 26ᵉ widget sans update test
3. `src/lib/__tests__/dashboard-personnaliser.test.ts` — 4 tests
   - **Symptôme :** même cause (25 vs 26) — assertion `expect(total).toBe(25)` à la ligne 96
   - **Commit fautif :** `60a41e27/e0bee2f5/b477e736` (avant Sprint A)

## Statut
✅ **Non-imputable à Sprint A** : Sprint A n'a touché ni les couleurs typologie, ni le catalogue dashboard widgets. Les commits fautifs sont antérieurs (`fb5bb932`, `605b8758`, `60a41e27`).

## Action proposée
Mini-sprint dette ~1-2h après Sprint B :
- Soit aligner les tests sur la réalité actuelle (26 widgets, hex hardcodés)
- Soit refactor les tokens typologie en `var(--typologie-*)` + remettre catalogue à 25 widgets

## Vérification
```bash
bunx vitest run src/lib/__tests__/affaire-typologie.test.ts src/lib/__tests__/dashboard-layout.test.ts src/lib/__tests__/dashboard-personnaliser.test.ts
# → 9 failed / 9 total (rouges depuis avant Sprint A)
```
