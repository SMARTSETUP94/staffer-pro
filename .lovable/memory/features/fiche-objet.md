---
name: Fiche Objet — Lot 8.1 fondations data
description: Vue matérialisée v_objet_heures_consolidees (réel uniquement) + 4 caps + flag fiche_objet_v1 + server fn getObjetTeam/assignPersonneToObjetStep
type: feature
---

# Fiche Objet — Lot 8.1 (livré 23 mai 2026)

## Fondations data posées

**Vue matérialisée `v_objet_heures_consolidees`** (réel uniquement) :
- Colonnes : `objet_id`, `affaire_id`, `metier_id`, `metier_code`, `heures_reelles`, `nb_saisies`, `derniere_validation_le`
- Source : `heures_saisies` filtrées sur `statut='valide'` (enum confirmé : brouillon|soumis|valide|rejete)
- Lien direct via `heures_saisies.fabrication_objet_id` (PAS de JOIN via assignation_objets)
- Refresh quotidien 03h UTC via pg_cron job `refresh-objet-heures-consolidees` (CONCURRENTLY)
- Index unique `(objet_id, metier_id)` + index sur `affaire_id`
- **NON exposée via API** : REVOKE anon+authenticated, GRANT service_role uniquement → lecture via `supabaseAdmin` côté server fn
- Prévu (depuis `fabrication_objets`) et planifié (depuis `staffing_plan_step`) lus en LIVE — pas pré-agrégés

**Index partiel perf** : `idx_heures_saisies_objet_metier_valide` sur `(fabrication_objet_id, metier_id) WHERE statut='valide' AND fabrication_objet_id IS NOT NULL`

**Colonne FK** : `affaire_documents.fabrication_objet_id` (FK, index partiel, backfill depuis `objet_id` legacy)

## Mapping codes métier → colonnes fabrication_objets

| code DB (metiers.code) | colonne heures_prevues_* |
|---|---|
| construction | bois |
| metallerie | metal |
| peinture | peinture |
| numerique | numerique |
| tapisserie | tapisserie |
| logistique | manutention |
| suivi_projet | be |
| machiniste | *(aucune — null)* |

⚠️ NE PAS confondre avec les codes UI ('BE', 'NUM', 'BOIS', etc.) utilisés ailleurs. Source unique : `src/lib/objet-fiche-helpers.ts > METIER_CODE_TO_PREVU_COL`.

## Capabilities Fiche Objet

| cap | admin | chef_chantier | chef_metier_scoped | bureau_etude | atelier_chef | atelier_metier | poseur | employe | commercial | logistique | rh |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `objet.view` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| `objet.edit` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `objet.team.manage` | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `objet.photo.upload` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

Scoping data-layer : déjà géré par RLS existant sur `fabrication_objets` (is_chef_metier_scoped, user_has_affaire_access). Les caps sont booléennes globales.

## Server functions

`src/server/objet-fiche.functions.ts` :
- `getObjetTeam({ objetId })` → `{ objet, metiers: [{ metier_id, code, libelle, heures_prevues (live), heures_planifiees (live), heures_reelles (MV), progression_pct, personnes: [{ employe_id, nom, prenom, type_contrat, presence_pct_moyen, nb_jours, source: "staffing" }] }] }`
- `assignPersonneToObjetStep({ planId, stepId, employeId, dates[], presence_pct })` → `{ inserted, skipped_conflict, skipped_existing, details[] }`
  - Anti-doublon : skip si déjà sur le même step
  - Anti-cumul : skip si presence cumulé (tous plans) + nouveau > 100%

Helpers purs testables : `src/lib/objet-fiche-helpers.ts` (15 tests Vitest verts).

## Feature flag

`fiche_objet_v1` (désactivé au seed) — pilote les routes/UI livrées en 8.2+.

## Lots livrés / restants

- 8.1 ✅ fondations data (MV + caps + flag + server fn)
- 8.2 ✅ route + page + identité + heures table (bascule Total/Unitaire)
- 8.2b ✅ (23 mai 2026) lien temporaire `data-testid="objet-fiche-link"` depuis `/affaires/$id/fabrication` (desktop row + mobile card), gated par flag `fiche_objet_v1` + cap `objet.view`. TODO(8.5): remplacer par lien intégré natif. + Seed 3 comptes test (commercial / bureau_etude / atelier_chef) dans `e2e/seed.ts` + 3 projects Playwright + flag activé pour ces UUIDs lors du seed.
- 8.3 : étapes + équipe + AssignerPersonneSheet
- 8.4 : journal + photos auto-taggées
- 8.5 : liens croisés Gantt/Planning/Devis/Kanban (remplace le lien temporaire de 8.2b)
- 8.6 : polish + responsive 380px + tests complets

