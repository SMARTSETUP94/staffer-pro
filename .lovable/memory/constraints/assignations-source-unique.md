---
name: assignations-source-unique
description: Toutes les écritures (INSERT/UPDATE) sur `assignations` côté client passent par `src/lib/assignation-upsert.ts` (audit `created_by` auto). Garde-fou Vitest.
type: constraint
---
**Règle** : aucune surface ne fait `.from("assignations").insert(...)` ou `.update(...)` directement côté client. Toutes les écritures passent par :

- `insertAssignation(row)` — single insert + retourne `{id}`
- `insertAssignationsBatch(rows)` — batch insert + retourne `[{id}]`
- `updateAssignation(id, patch)` — update par id
- `updateAssignationsByIds(ids, patch)` — update WHERE id IN (...)

**Pourquoi** : audit `created_by = auth.uid()` posé automatiquement sur CHAQUE création (RGPD : traçabilité « qui a staffé »). `created_by` jamais réécrit en update (immuable).

**Surfaces refactorées (31 mai 2026)** : AssignationDialog, BulkAssignDialog, BulkStafferDialog, ParChantierAssignDialog, PlanningGrid (duplication drag), CellEditDialog, use-bulk-assign-objet.

**Whitelist** (autorisées à utiliser SQL direct) :
- `src/lib/assignation-upsert.ts` (le helper lui-même)
- `src/server/staffing-publish.functions.ts` (server-fn, injecte `created_by = context.userId`)
- `src/server/staffing-plan-delete.functions.ts` + `staffing-express-cancel.functions.ts` (cleanup, pas de création)
- `src/routes/_app.devis.index.tsx` + `_app.devis.rattachement-historique.tsx` (rattachement FK `devis_id`, pas une création staffing)
- `src/components/propositions/PropositionsList.tsx` (action métier confirmer/refuser proposition)

**Garde-fou** : `src/lib/__tests__/assignation-source-unique-guard.test.ts` fail si une nouvelle surface utilise `.insert/.update` direct hors whitelist.

**Helper miroir côté heures** : `src/lib/heures-upsert.ts` (mem://constraints/heures-saisie-source-unique).
