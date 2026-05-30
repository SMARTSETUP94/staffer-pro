---
name: Marge chantier Phase 5 persistance serveur LIVRÉE
description: Table marge_chantier_workspace JSONB + RLS user-scoped + storage async + debounce 2s + indicateur sync + migration auto localStorage → Supabase
type: feature
---
Livré 30 mai 2026 (suite Option A).

## Architecture
- Table `public.marge_chantier_workspace` : `user_id uuid PK FK auth.users`, `data jsonb`, `updated_at`, `created_at`. 1 ligne par user (last-write-wins).
- RLS 4 policies user-scoped (`user_id = auth.uid()`) + GRANT authenticated/service_role. Trigger `update_updated_at_column`.
- `storage.ts` async : Supabase = source de vérité, localStorage = cache offline. Migration auto localStorage → Supabase au 1er load si ligne serveur absente et localStorage rempli (`hasRealData`).
- `saveAppDataSync` (localStorage only) câblé sur `beforeunload`.

## UI
- `SyncBadge` dans top bar : `loading` (RotateCcw spin) / `saving` / `idle` (✓ vert) / `error` (rouge).
- Debounce save 2s (vs 400ms en Option A) pour limiter charge Supabase.
- Boutons Export/Import JSON conservés comme filet externe.

## Hors-scope (Phases ultérieures)
- Optimistic lock + notif conflit (Phase 6 si Gabin perd des modifs).
- Realtime sync multi-tabs (Phase 7).
- Multi-workspace par user (Phase 8).
- Snapshots mensuels `marge_chantier_snapshots` + pg_cron — NON livré, à rouvrir si besoin audit N vs N-1.

## Tests
- `e2e/admin/marge-chantier-sync.admin.spec.ts` (2 specs : round-trip reload + migration localStorage).

## Smoke test Gabin
1. PC bureau : ouvrir `/admin/marge-chantier`, ajouter employé, attendre badge ✓ Synchronisé.
2. Laptop : login même compte, ouvrir `/admin/marge-chantier`, employé doit apparaître.
3. Vérif DB : `SELECT user_id, jsonb_array_length(data->'rh'), updated_at FROM marge_chantier_workspace;`
