---
name: Bloc 10 — Fiche opportunité (10.1 → 10.5)
description: Récap global du Bloc 10 (fondations DB + inbox + fiche UI + listing refactor + tests). Phase 'opportunite' sur affaires, RPC sign_opportunite atomique 9XXX→5XXX, 5 caps, 196 opps legacy archivées.
type: feature
---

# Bloc 10 — Fiche opportunité (LIVRÉ 28 mai 2026)

## Périmètre couvert (10.1 → 10.5)

| Sous-lot | Livré | Détail |
|---|---|---|
| 10.1 Fondations DB | ✅ | Tables `opportunite_actions` + `opportunite_jalons`, RPC `sign_opportunite`, 4 caps, seed 784 jalons |
| 10.2 Inbox + cleanup #1 | ✅ | `archived_at` + archivage 196 opps legacy + source `opp_action` cap-gated dans `get_inbox_items` |
| 10.3 Fiche UI | ✅ | Route `/opportunites/$affaireId` + 3 composants + 4 server fns + nav Kanban/Tableur |
| 10.4 Listing refactor | ✅ | RPC `list_opportunites_active()` (48ms), badges urgence, filtres URL |
| 10.5 Tests + cleanup | ✅ | E2E scenario complet + 12 assertions Vitest + memory + dette résolue |

Temps réel : ~16h (vs 38h estimés).

## Architecture

### Pas de table dédiée — phase sur `affaires`
Une opportunité est une `affaire` avec `phase='opportunite'`. La signature mute la même ligne (`phase='signe'`, `numero` 9XXX→5XXX) via `sign_opportunite` (advisory lock, atomique). Avantages : pas de migration de données à la signature, historique commercial conservé.

### Tables ajoutées (10.1)
- `opportunite_actions` : timeline d'actions commerciales (10 types via enum `opp_action_type`), `prochaine_action_due_le` optionnel.
- `opportunite_jalons` : 4 étapes (`qualification`, `devis_envoye`, `negociation`, `signature`) avec `date_prevue` / `date_atteinte`.
- Seed : 196 opps × 4 jalons = 784 lignes.

### RPC atomiques
- `sign_opportunite(_affaire_id)` : advisory lock + génération 5XXX + update phase + log journal.
- `list_opportunites_active(_limit, _offset)` : LATERAL joins prochaine action / dernier jalon / compteur actions. 3 index (`idx_opportunite_actions_affaire_due`, `idx_opportunite_actions_affaire_created`, `idx_opportunite_jalons_affaire_atteinte`). EXPLAIN ANALYZE ~48ms.
- `archive_affaire(_affaire_id)` : cap-gated archivage soft.

### Server fns (`src/server/opportunite-fiche.functions.ts`)
1. `getOpportuniteFiche` — agrège affaire + jalons + actions + équipe + devis + commentaires
2. `updateOpportuniteFields` — patch partiel champs commerciaux (brief)
3. `addOpportuniteAction` — INSERT timeline
4. `updateJalonStatus` — MAJ jalon (date_prevue / date_atteinte)

Tous protégés par `requireSupabaseAuth` + RLS scope (admin = tout, CA = ses opps via `charge_affaires_id`).

## 5 caps ajoutées
- `section.opportunites` (existante, élargie)
- `action.edit_opportunite` — admin + CA own
- `action.sign_opportunite` — admin only (déclenche RPC mutante)
- `action.delete_opportunite` — admin only (archive soft)
- `inbox.opp_action` — admin + chefs (visibilité actions dues 7j)

## Décisions UX
- **Sections inlinées** dans la route fiche (TimelineSection / EquipeSection / DevisSection / JournalSection) plutôt que sous-routes : refresh atomique via `useQuery.refetch()` après mutation.
- **3 composants extraits** : `OpportuniteFicheHeader` (numero + actions header), `OpportuniteJalonsBar` (4 chips horizontaux), `OpportuniteNextActionCard` (carte CTA "Prochaine action").
- **Badges urgence** sur Kanban + Tableur + Dashboard `PipelineCommercialBloc` : rouge si overdue, orange si <3j, gris sinon (helper `src/lib/opportunite-action-urgency.ts`).
- **Filtres URL-persistés** sur listing : `actionsDues` (≤7j), `noCa` (admin-only via cap).

## Cleanup Risque #1 (196 opps legacy)
Toutes les 196 opps existantes avaient `statut_opportunite='termine'` (seed manuel historique). 191/196 avaient `charge_affaires_id=NULL`. Archivage en 2 passes :
1. 191 opps `archived_at = now()` (sans CA + termine)
2. 5 opps de test de Gabin (`afcb9389-edb4-…`)

Vérification : `SELECT COUNT(*) FROM affaires WHERE phase='opportunite' AND archived_at IS NULL` → 0 résiduel.

## Tests
- **pgTAP** : `supabase/tests/get_inbox_items_opp_action.spec.sql` (3 assertions cap ON/OFF/scope).
- **Vitest** : `src/server/__tests__/opportunite-fiche.test.ts` — 12 assertions (4 SF × 3 cas input : valide / uuid invalide / valeur hors enum).
- **E2E** :
  - `e2e/bloc-10/fiche-opportunite.admin.spec.ts` — smoke ouverture fiche (10.3)
  - `e2e/bloc-10/scenario-complet.admin.spec.ts` — parcours bout-en-bout (10.5)

## Performance
| RPC | Latence |
|---|---|
| `list_opportunites_active(50, 0)` | ~48ms |
| `get_inbox_items(100)` | <100ms |
| `sign_opportunite()` | <50ms (advisory lock) |

## Dettes
### Résolues
- ✅ `inbox-opp-action-create-table` — Pas de table `opportunites` à créer, source câblée sur `affaires + opportunite_actions` via cap `inbox.opp_action` en 10.2.

### Reportées (Bloc 11+)
- ⏳ `inbox-echantillons-create-table` — Table `echantillons` à créer en Bloc 10.6.
- ⏳ `inbox-plan-lacune-algo-sql` — RPC `detect_plan_lacunes` à écrire (hors scope Bloc 10).

## Liens
- [mem://features/bloc-10-fiche-opportunite-analyse](mem://features/bloc-10-fiche-opportunite-analyse) — note pré-implémentation
- [mem://features/bloc-10-1-fondations-db](mem://features/bloc-10-1-fondations-db)
- [mem://features/bloc-10-2-inbox-extension](mem://features/bloc-10-2-inbox-extension)
- [mem://features/bloc-10-3-fiche-ui](mem://features/bloc-10-3-fiche-ui)
- [mem://features/bloc-10-4-listing-refactor](mem://features/bloc-10-4-listing-refactor)

## Reste à faire (Bloc 10 suite — sous-lots 10.6 → 10.10)
- 10.6 Visites + 10.7 Échantillons (artefacts → `affaire_documents.categorie`)
- 10.8 Enrichissement signature (notification `atelier_chef` + log journal)
- 10.9 Mobile fiche opp (carte CA simplifiée)
- 10.10 Full E2E multi-rôles (admin + CA own + CA other + chef)
