---
name: LOT B — Tableau d'atelier
description: Route /atelier (5 colonnes par étape), règle de complétude SQL etape_prete, RPC valider_etape/invalider_etape, statut en_attente_validation, suppression de /charge-atelier
type: feature
---
v0.53 (2 août 2026).

**Source unique de complétude = SQL.** `public.etape_prete(uuid) → {prete, manques[]}`
et `public.etapes_pretes_batch(uuid[])`. JAMAIS dupliquer cette règle en TypeScript.
Prérequis : be = aucun ; usinage + respo_fab = plan publié (`plan_url` ou PDF dans
`affaire_documents` via `objet_id`/`fabrication_objet_id`) ; finition = `type_finition`
+ `finition_detail` sauf `est_brut` ; manutention = 3 dimensions. `non_applicable` ⇒
toujours prête.

**Validation.** Enum `fabrication_etape_statut` gagne `en_attente_validation` ;
`termine` = après validation. RPC `valider_etape(_etape_id, _commentaire)` /
`invalider_etape(_etape_id, _motif)` : respo_fab de l'objet ou admin, auto-validation
interdite sauf étape `respo_fab`. Ces RPC **ne vérifient pas** `etape_prete` et ne
lèvent jamais d'exception : elles renvoient `{ ok, error }`.

**Cohérence heures.** Trigger `trg_sync_etape_from_heures_metier` sur
`objet_heures_metier` : heures > 0 sur métier `suivi_projet` (BE) ou `numerique`
⇒ l'étape `be`/`usinage` est créée si absente et sort de `non_applicable`.
Bloc EXCEPTION avaleur : ne bloque jamais la saisie.

**UI.** `/atelier` (cap `section.planning_fab`, sidebar groupe Pilotage, visible en
mode simplifié managers). Helpers purs `src/lib/atelier-board.ts` (colonne courante,
tampons BE/NUM/FAB/FIN/MAN, tri par `date_montage` puis sans date). Mapping métier →
étape côté TS : `suivi_projet`=BE, `numerique`+`impression_uv`=usinage,
`construction`+`metallerie`=respo_fab, `peinture`+`tapisserie`=finition,
`logistique`+`machiniste`=manutention.

**Supprimé.** `/charge-atelier` → stub redirect vers `/charge`. Test
`sidebar-cap-coherence` refuse désormais tout item pointant vers un stub redirect.
