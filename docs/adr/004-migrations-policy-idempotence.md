# ADR-004 — Idempotence des migrations RLS

**Date** : 10 mai 2026
**Statut** : Accepté
**Contexte** : Sprint v0.44.6, clôture audit v0.43-v0.44

## Problème

Plusieurs migrations historiques utilisent `CREATE POLICY name ON table …` sans
`DROP POLICY IF EXISTS …` préalable. Conséquence :

- Re-run d'une migration (ex. environnement reset) → erreur `policy already exists`.
- Refonte d'une policy → on doit créer une nouvelle migration au lieu de modifier la précédente.
- Tests pgTAP en environnement isolé difficiles à orchestrer.

## Décision

Toute migration touchant une policy RLS DOIT suivre ce pattern :

```sql
DROP POLICY IF EXISTS <policy_name> ON public.<table>;
CREATE POLICY <policy_name>
  ON public.<table>
  FOR <SELECT|INSERT|UPDATE|DELETE>
  TO authenticated
  USING (…)
  WITH CHECK (…);
```

Même règle pour :
- `DROP TRIGGER IF EXISTS … ; CREATE TRIGGER …`
- `CREATE OR REPLACE FUNCTION …` (déjà idempotent par défaut)
- `CREATE INDEX IF NOT EXISTS …`
- `ALTER TABLE … ADD COLUMN IF NOT EXISTS …`

## Conséquences

✅ Migrations re-runnables sans erreur.
✅ Modification d'une policy = nouvelle migration courte (drop + create) au lieu d'une chaîne `DROP POLICY` séparée.
✅ Plus simple à diff lors d'une code-review.

❌ Verbosité légère (1 ligne `DROP POLICY IF EXISTS` par policy).

## Application rétroactive

**Non.** Les migrations historiques ne sont pas réécrites (immutabilité du log).
Seules les nouvelles migrations (v0.44.5+) suivent la convention.

## Référence

- Migration v0.44.5 `20260510213736_*.sql` — premier exemple appliquant la convention.
- Migration v0.44.3 `20260510204746_*.sql` — déjà partielle (DROP POLICY pour `fab_photos_select_chef_admin_or_assigned`).
