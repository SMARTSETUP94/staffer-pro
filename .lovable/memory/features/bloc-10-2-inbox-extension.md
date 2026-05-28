---
name: Bloc 10.2 — Inbox extension + Cleanup Risque #1
description: Colonne archived_at sur affaires, archivage 196 opps legacy, extension RPC get_inbox_items avec source opp_action cap-gated, test pgTAP
type: feature
---

# Bloc 10.2 — Inbox extension + Cleanup Risque #1

Livré le 28 mai 2026.

## Cleanup Risque #1

Les 196 opps existantes avaient TOUTES `statut_opportunite='termine'` (dates nov 2025 → sept 2026). 191/196 avaient `charge_affaires_id=NULL`.

**Décision** : archivage massif via colonne `archived_at timestamptz NULL`.

### Migration
- `archived_at timestamptz NULL` sur `affaires`
- Index `idx_affaires_archived_at` WHERE `archived_at IS NULL`
- RPC `archive_affaire(_affaire_id uuid)` cap-gated (`action.delete_opportunite` ou admin)

### Archivage exécuté
```sql
UPDATE public.affaires 
SET archived_at = now()
WHERE phase = 'opportunite' 
  AND charge_affaires_id IS NULL 
  AND statut_opportunite = 'termine';
```
→ 191 lignes archivées.

Puis archivage des 5 opps de test du user `afcb9389-edb4-…`.

### Vérification
`SELECT COUNT(*) FROM affaires WHERE phase='opportunite' AND archived_at IS NULL` → 0 opp active sans CA.

## Inbox extension

### RPC `get_inbox_items` enrichi

Source `opp_action` ajoutée dans le CTE `divergence`. Cap-gated : variable `v_cap_opp_action` utilise `public.user_has_cap('inbox.opp_action')`.

Si cap ON : les opportunités avec `prochaine_action_due_le` dans les 7 jours remontent dans l'inbox admin/chef.

### Test pgTAP
`supabase/tests/get_inbox_items_opp_action.spec.sql` — 3 assertions :
1. Cap ON → item `opp_action` visible
2. Cap OFF → item `opp_action` absent
3. Scope own filtre correct

### EXPLAIN ANALYZE
Vérifié sur preview : `SELECT * FROM get_inbox_items(100)` < 100ms.

## Fichiers créés
- `supabase/migrations/20260528111503_c386864d-b72b-40d2-b764-c17f9600924f.sql`
- `supabase/tests/get_inbox_items_opp_action.spec.sql`
