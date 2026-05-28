---
name: Bloc 10.4 — Listing refactor + import
description: RPC list_opportunites_active() avec prochaine action/dernier jalon/actions_count, badges urgence Kanban+Tableur+Dashboard, filtres URL-persistés, EXPLAIN <100ms
type: feature
---

# Bloc 10.4 — Listing refactor + import

Livré le 28 mai 2026.

## RPC `list_opportunites_active(limit, offset)`

Agrège les opportunités actives (non archivées) avec 3 champs enrichis via `LEFT JOIN LATERAL` :
- `next_action_due_le` + `next_action_text` — dernière action avec `prochaine_action_due_le IS NOT NULL`
- `last_jalon_etape` — jalon avec `date_atteinte` la plus récente
- `actions_count` — nombre total d'actions

### Performance
3 index d'optimisation ajoutés :
- `idx_opportunite_actions_affaire_due` (affaire_id, prochaine_action_due_le)
- `idx_opportunite_actions_affaire_created` (affaire_id, created_at)
- `idx_opportunite_jalons_affaire_atteinte` (affaire_id, date_atteinte)

**EXPLAIN ANALYZE** : `SELECT * FROM list_opportunites_active(50, 0)` → **~48ms** sur dataset enrichi.

## Frontend

### Kanban (`OpportuniteCard.tsx`)
- Badge urgence sur chaque carte : 🔴 si overdue, 🟠 si <3j, ⚪ sinon
- Utilise `src/lib/opportunite-action-urgency.ts`

### Tableur (`OpportunitesTableurView.tsx`)
3 nouvelles colonnes read-only :
- **Prochaine action** : date + badge couleur
- **Dernier jalon** : chip étape
- **Actions** : compteur

### Header filters (`_app.opportunites.tsx`)
- Toggle **"Avec actions dues"** : filtre `next_action_due_le <= today + 7j`
- Toggle **"Sans CA assigné"** (admin only, cap-gate `opportunites.read.all`)
- Persistance URL via `useSearch()` (`?actionsDues=true&noCa=true`)

### Dashboard (`PipelineCommercialBloc.tsx`)
- Badges urgence sur les cartes du pipeline commercial
- Bordure rouge si action en retard

## Import CSV
`src/lib/opportunites-import.ts` insère par défaut `statut_opportunite='a_faire'` (lignes 99 + 107) — pas de bug d'import.

## Hors scope
- Édition inline des colonnes Tableur (reste read-only)
- Import Excel opportunités
