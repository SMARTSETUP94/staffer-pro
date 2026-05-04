---
name: Devis import orphelins hotfix
description: v0.39.0a-hotfix-import — RPC import_progbat_atomique transactionnel + cleanup_fabrication_orphelins, root cause des duplicate key errors
type: feature
---

# Hotfix v0.39.0a-hotfix-import (4 mai 2026)

## Bug
Import devis Progbat → `ERROR: duplicate key value violates unique constraint 'fabrication_objets_affaire_reference_key'`.

## Root cause
`src/lib/devis-progbat-import.ts` faisait des **INSERT directs côté client** (pas en transaction). Si l'UPDATE/lien devis échouait après l'INSERT, des `fabrication_objets` restaient en base avec `devis_id IS NULL` (orphelins). Au ré-import, leur `reference` collait avec la nouvelle insertion → violation UNIQUE(affaire_id, reference).

13 orphelins identifiés en prod sur 3 affaires (5949, 5951, 5953), tous avec `devis_id NULL` et même `created_at` (29 avril 2026).

## Fix livré

### Migration SQL
- **`cleanup_fabrication_orphelins(p_affaire_id)`** : RPC admin-only qui supprime les `fabrication_objets` avec `devis_id IS NULL` ET sans heures/staffing. Audit dans `devis_deletion_log`.
- **`delete_devis_atomique` patché** : appelle `cleanup_fabrication_orphelins(affaire_id)` en fin pour nettoyer toute trace résiduelle.
- **`import_progbat_atomique(p_affaire_id, p_objets jsonb, p_heures_montage, p_heures_demontage)`** : RPC transactionnel. Pré-check des conflits de référence → `RAISE EXCEPTION 'CONFLICT_REFERENCE: [...]'` (JSON) avant tout INSERT. Tout-ou-rien (ROLLBACK PL/pgSQL automatique).
- **One-shot DELETE** des 13 orphelins en prod.

### TypeScript
- `src/lib/devis-progbat-import.ts` réécrit : appelle `supabase.rpc('import_progbat_atomique', ...)`. Plus aucun INSERT direct.
- Nouvelle classe `ImportProgbatConflictError` avec `conflicts: ImportProgbatConflict[]` parsée depuis le message d'erreur SQL.

### Tests
- `src/lib/__tests__/devis-progbat-import.test.ts` mis à jour pour le flux RPC.
- Nouveau spec `src/lib/__tests__/devis-import-orphelins-v0390a-hotfix.test.ts` : import nominal, conflit de référence, cleanup orphelins.

## Garde-fous
- **JAMAIS** ré-introduire d'INSERT direct sur `fabrication_objets` côté client. Toujours passer par `import_progbat_atomique` (ou `import_devis_atomique_v3` pour devis Excel).
- `delete_devis_atomique` doit toujours appeler `cleanup_fabrication_orphelins` en fin pour éviter récidive.
