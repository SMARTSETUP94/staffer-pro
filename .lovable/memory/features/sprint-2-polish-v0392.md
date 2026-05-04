---
name: sprint-2-polish-v0392
description: Sprint 2 v0.39.2a — popup resize cellule (Vue 1 isolée / Vue 2 cascade aval), greedy allocate utils + tests, E2E import Progbat
type: feature
---

# Sprint 2 v0.39.2a — Polish UX + algos partagés (3 actions livrées)

Phasage : 3 actions critiques livrées dans v0.39.2a. Refactors Gantt/StaffingPersonnes
+ housekeeping + doc RLS reportés sur v0.39.2b.

## Action 1 — Resize popup cellule (Vue 1 isolée / Vue 2 cascade aval)

### Composants nouveaux
- `src/components/staffing/DurationStepper.tsx` — stepper +/-1j sur durée en
  demi-journées. Écrit dans `useEditStore.setStepSpanDemi` (manual_span_demi).
- `src/components/staffing/CellEditPopover.tsx` — popover Radix groupant
  DateShifter + DurationStepper + PersStepper. Trigger asChild, fermable Escape
  ou clic extérieur. Label personnalisable.

### Helpers cascade aval
- `src/lib/staffing/cascade-aval.ts`
  - `findDownstreamSteps(steps, pivot)` : steps même objet, start_date strict > pivot
  - `computeCascadeForDurationChange(steps, pivot, oldSpanDays, newSpanDays)`
  - `computeCascadeForShift(steps, pivot, shiftDelta)`
  - 6 tests Vitest verts

### Wiring GanttInteractif (Vue 2 — Objet/Étape)
- handleSetSpanDemiCascade : durée + cascade aval (à pers constant — heures préservées)
- handleShiftCascade : décalage + cascade aval
- Bouton trigger `[testid=cell-edit-trigger]` à droite de chaque ligne étape
  remplace le couple PersStepper+DateShifter inline. Affiche `Np · Xj`.

### Sémantique respectée
- Vue 1 (ChargeMetierSection) : édition isolée — handlers existants `handleSetPers` /
  `handleShift` (pas de cascade) — peut violer LAG → alertes pré-vol existantes.
- Vue 2 (objet/étape) : cascade aval seule via handleSetSpanDemiCascade /
  handleShiftCascade. Amont collé à sa position initiale.

## Action 2 — Greedy priorité staffing nominatif

### Util pur + tests
- `src/lib/staffing/greedy-allocate.ts`
  - `Person` (+ tier optionnel 1-4)
  - `greedyAllocate(orderedPersons, days, capacity, availability)` :
    pour chaque jour J → remplit cible(J) en prenant P1..Pn dans l'ordre,
    skip si absent. Garantie : count(jour J) ≤ cible(J).
  - `sortByTier(persons)` : tri stable par tier 1<2<3<4 (undef = 4)
  - `summarizeAllocation(result, capacity)` : `{ allocated, target, pct }`
- 5 tests Vitest verts (cap respectée, rotation absences, shortfall, tri tier, summary)

### Branchement
À brancher dans v0.39.2b sur `StaffingPersonnesSection.tsx` (mode liste) et
`EquipeAffaireRapideDialog` (bulk affaire). Util pur réutilisable, signatures
stables. Aujourd'hui les 2 sites utilisent des heuristiques ad-hoc qui ne
garantissent pas la borne quotidienne — la migration est mécanique.

## Action 5 — E2E import Progbat conflits

- `e2e/devis/import-progbat-conflicts.chef.spec.ts` — 4 specs tolérantes :
  DI1 page accessible, DI2 input file présent, DI3 ImportErrorPanel monté si
  erreur, DI4 historique réimport accessible. Skip propre si seed vide.
- La logique métier (parser conflits réf dupliquée, rollback atomique RPC v3,
  cleanup orphelins, ImportProgbatConflictError) est déjà couverte par
  `parser-real-d2141.test.ts`, `parse-excel.test.ts`, `parser-helpers.test.ts`
  (v0.31.4 → v0.31.5).

## Tests
- 90 tests Vitest passent (`src/lib/staffing/__tests__`) — 11 nouveaux
  (greedy + cascade-aval).

## Reporté v0.39.2b
3) Refactor GanttInteractif.tsx 949L → 4 fichiers (HeaderRow, DayGrid, RowInteractif, GanttRoot)
4) Refactor StaffingPersonnesSection.tsx 1214L → 3+1 fichiers (PersonneCard, AssignmentRow, TierFilters, StaffingPersonnesRoot)
6) Housekeeping console.log/FIXME/TODO + eslint no-console warning
7) Doc RLS multi-acteur enrichie (matrice complète) — base déjà créée dans Sprint 1

## Garde-fou
- v0.41 API Claude reste en backlog (pas dans Sprint 2)
- Sprint 3 (E2E full role-based + logistique) bloqué tant que v0.39.2b non validé

## v0.39.2b1 (livré — phasage sûr Actions 1+4+5+6)

### Action 1 — Branchement greedy UI (modale Équipe affaire mode Rapide)
- `EquipeAffaireSection.tsx` enrichie : compteur live `X / Y pers·j alloués`
  (`data-testid="greedy-counter"`), badge `rotation greedy` si over-select
  (`greedy-rotation-badge`) avec tooltip explicatif (P1 → P2 → P3 remplaçant),
  bouton `Re-trier par tier` (`greedy-resort-tier`) appelant `sortByTier`.
- Badges sélection préfixés `P1 / P2 / Pn` pour matérialiser l'ordre de
  priorité greedy.
- Vue 3 (`StaffingPersonnesSection`) : reste lecture seule (algo serveur via
  `Re-staffer nominatif`) — pas de re-câblage UI nécessaire.
- Tests Vitest existants (90 verts) couvrent capacité, rotation, shortfall,
  sortByTier, summarizeAllocation.

### Action 4 — E2E cascade aval Vue 1/2
- `e2e/staffing/cell-edit-cascade.chef.spec.ts` (smoke build) — la logique
  `cascade-aval` est déjà couverte unitairement (5 tests).
- `e2e/staffing/greedy-priorite.chef.spec.ts` (smoke build) — algo couvert
  par `greedy-allocate.test.ts`.

### Action 5 — Housekeeping console.log / TODO / FIXME
- Grep `src/`: **0 console.log**, **0 TODO/FIXME** (faux positifs `1XXX/9XXX`
  exclus). Codebase déjà propre. Pas de plugin eslint nécessaire pour ce sprint.

### Action 6 — Doc RLS multi-acteur
- `docs/rls-policies.md` enrichi : section "Anti-patterns évités" (7 pièges
  classiques) + matrice complète acteur × action × table avec légende
  ✅ / 🔒 / ❌.
- `CONTRIBUTING.md` créé pointant vers la doc RLS comme lecture obligatoire.

## Reporté v0.39.2b2 (refactors gros volume)
- Action 2 — Refactor `GanttInteractif.tsx` (949L → 4 fichiers)
- Action 3 — Refactor `StaffingPersonnesSection.tsx` (1214L → 4 fichiers)
