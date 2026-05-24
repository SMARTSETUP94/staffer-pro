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
- 8.2c ✅ (24 mai 2026) 5 corrections polish : heures dé-dupliquées, algo écart corrigé, 5 champs DB, matrice permissions, bouton Fiche visible.
- 8.3b ✅ (24 mai 2026) Mutations équipe : AddPersonneDialog + RemovePersonneDialog + auto-remplir/retirer. HOTFIX draft/published mutables (no_plan bloqué). 2 dettes tracées.
- 8.4 DB ✅ (24 mai 2026) Journal & Photos : `objet_journal_events` + `objet_commentaires` + `fabrication_objets_photos` enrichie + 6 triggers auto-log + backfill.
- 8.4 UI ⏳ (~8h) — SF signed URLs/upload/aggregation + UI `ObjetJournalPhotos` (timeline + commentaires + upload WebP + galerie par étape).
- 8.5 ⏳ (~4h) — Liens croisés natifs (Gantt/Planning/Devis/Kanban → fiche objet). Choix drawer vs nav à trancher.
- 8.6 ⏳ (~8h) — Polish + responsive 380px + E2E 8.3b (13 scénarios) + E2E 8.4 + 3 dettes (rename SF, Sheet AddPersonne, édition commentaire).


## Lot 8.2c — Polish fiche (24 mai 2026)

### Décisions livrées

1. **Heures dé-dupliquées** : suppression du bloc "Heures prévues (devis) — par métier" dans `ObjetIdentiteForm` (read + edit). Source unique = `ObjetHeuresTable` (Prévu / Planifié / Réel / Écart). Les champs `heures_prevues_*` restent dans `ObjetIdentiteValues` (utilisés ailleurs : import devis, recap, staffing) mais ne sont PLUS éditables depuis la fiche — `updateObjetIdentite` whiteliste sans eux, défense en profondeur côté serveur via `getEditableFields`.

2. **Algo écart corrigé** (`src/lib/objet-heures-helpers.ts` → `computeEcart(prevu, reel)`) :
   - prevu=0/reel=0 → muted '—'
   - prevu=0/reel>0 → warning '+Xh non prévues'
   - prevu>0/reel=0 → muted 'Non démarré'
   - prevu>0/reel>0 → pct; |pct|≤5 success, -25<pct<-5 info, pct≤-25 warning, 5<pct≤15 warning, pct>15 destructive
   - **Palier -25% conservé** : un objet à 1h/8h n'est pas "sous-budget" mais "pas commencé sérieusement" → ambre.
   - Tests : `src/lib/__tests__/objet-heures-helpers-ecart.test.ts` (10 cas).

3. **5 nouveaux champs DB** sur `fabrication_objets` :
   - `largeur_mm`, `longueur_mm`, `hauteur_mm` (integer, CHECK > 0 si renseigné)
   - `materiaux` (text, textarea 2 lignes)
   - `finition_detail` (text, input, précise l'enum `type_finition`)
   - Index GIN trigram (`pg_trgm`) sur `materiaux` et `finition_detail` (anticipé pour recherche fuzzy sprint analytique).
   - **Pas de migration parser Progbat** : NULL par défaut, alimentés manuellement.

4. **Matrice permissions étendue** (`src/lib/objet-fiche-permissions.ts`) :
   - `largeur/longueur/hauteur_mm` + `materiaux` → admin, chef_chantier, bureau_etude
   - `finition_detail` → admin, chef_chantier, bureau_etude, **atelier_chef**
   - Commercial = lecture seule sur les 5 nouveaux champs (cohérent avec sa posture sur la fab).

5. **Bouton "Fiche" plus visible** sur `/affaires/$id/fabrication` :
   - Desktop : nouvelle colonne dédiée "Détail" (à droite de Avanc.) avec `<Button variant="outline" size="sm">Fiche</Button>` + icône `ExternalLink`. Visible uniquement si `showFicheLink` (flag + cap).
   - Mobile (`ObjetCardMobile`) : bouton outline full-width "Voir la fiche" en bas de card.
   - `data-testid="objet-fiche-link"` conservé.

### Hors-scope explicite (à trancher Lot 8.3+)

- **Bascule Total/Unitaire** sur `ObjetHeuresTable` : non testée pour qté > 1, comportement actuel = division simple.
- **Logistique dans `ObjetHeuresTable`** : la ligne s'affiche avec `planifié = —` (le staffing ne couvre pas ce métier). À documenter par tooltip "Logistique gérée hors planning fabrication" — décision reportée au moment où le besoin sera trianglé en prod.

### Convention de rôle confirmée

Le rôle DB est **`atelier_chef`** (et NON `chef_atelier`). Toutes les nouvelles entrées de matrice utilisent cette graphie.
