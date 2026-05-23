# Audit — Dualité `assignations` ↔ `staffing_plan_assignment`

**Date** : 22 mai 2026
**Auteur** : Lovable / co-conception Gabin Chaussegros
**Statut** : livrable de cadrage, AUCUNE modification de code/DB associée. Décisions à valider avant tout sprint touchant ces tables.
**Cible** : refonte UX v0.49+ (fiche objet, inbox, etc.) — ces écrans s'appuient sur la cohérence plan ↔ planning.

---

## 1. Inventaire des flux qui touchent les deux tables

### 1.1 Tables concernées (rappel schéma)

| Table | Rôle métier | Lignes prod |
|---|---|---|
| `staffing_plan` | Plan de fabrication par affaire (draft / published / archived) | 10 |
| `staffing_plan_step` | Une ligne par (objet × métier) ou (métier seul) dans un plan | 383 |
| `staffing_plan_assignment` | Une ligne par (step × employé × date) — **source de vérité du plan** | 120 |
| `assignations` | Créneau planning principal (employé × date × affaire) — **utilisé partout** (Gantt, validation heures, exports SILAE, paie) | 32 |
| `assignation_objets` | Lien M-N assignation↔objet — **table existante mais VIDE en prod** | 0 |
| `heures_saisies` | Heures réelles. Possède DÉJÀ `fabrication_objet_id` direct + `metier_id` direct | 11 |

### 1.2 Server functions qui écrivent

| Fichier | Cible | Opération |
|---|---|---|
| `src/server/staffing-publish.functions.ts` | `staffing_plan_assignment` (lecture) → `assignations` (DELETE+INSERT) | **Propagation** plan→planning à `publishStaffingPlan` (l.107-138). Snapshot avant. Restore reconstruit `staffing_plan_assignment` uniquement (l.346-361). |
| `src/server/staffing-personnes.functions.ts` | `staffing_plan_assignment` | INSERT (`assignPersonneToStep` l.172), DELETE (`unassignPersonneFromStep` l.194), UPDATE (`updateAssignmentPresence` l.212), SELECT (`getPlanAssignments` l.243). |
| `src/server/staffing-equipe.functions.ts` | `staffing_plan_assignment` | INSERT bulk (`assignTeamToMetier` l.117) avec garde-fou cumul > 100%. |
| `src/server/staffing-autostaff.functions.ts` | `staffing_plan_assignment` | INSERT massif par l'algo greedy. |
| `src/server/staffing-autostaff-plan.functions.ts` | `staffing_plan_assignment` | Variante orchestration multi-step. |
| `src/server/staffing-plan-delete.functions.ts` | `assignations` (UPDATE staffing_plan_id=null) puis DELETE plan → CASCADE FK supprime `staffing_plan_assignment`. **Le détachement préserve les créneaux planning** (l.45-49). |
| `src/server/staffing-express-cancel.functions.ts` | Idem — détache `assignations.staffing_plan_id` puis CASCADE delete plan (l.44-47). |

### 1.3 Server functions / hooks qui écrivent dans `assignations` (planning principal hors plan)

| Fichier | Opération |
|---|---|
| `src/components/planning/PlanningGrid.tsx` l.400 | INSERT direct (drag-drop cellule) |
| `src/components/planning/AssignationDialog.tsx` l.421/500 | UPDATE / DELETE (édition cellule) |
| `src/components/planning/BulkAssignDialog.tsx` l.117 | INSERT bulk |
| `src/components/planning/BulkStafferDialog.tsx` l.257 | INSERT bulk (« Staffer rapide ») |
| `src/components/planning/ParChantierAssignDialog.tsx` l.167 | INSERT par chantier |
| `src/hooks/use-bulk-assign-objet.ts` l.65 | INSERT + rollback DELETE on error |
| `src/components/planning/CellEditDialog.tsx` | UPDATE groupé |

Ces écrits NE touchent PAS `staffing_plan_assignment`. Ils créent des assignations « hors plan » (`staffing_plan_id = NULL`).

### 1.4 Triggers actuels (par table)

| Table | Triggers |
|---|---|
| `assignations` | `trg_aeh_assignations` (historique équipe v0.45), `trg_assignations_heures_bounds`, `trg_check_affaire_open_assignation`, `trg_guard_confirmation`, `trg_notify_assignation_change`, `trg_notify_confirmation`, `trg_set_confirmation`, `trg_unique_chef_jour`, `trg_assignations_updated_at` → **9 triggers, surface importante** |
| `staffing_plan_assignment` | **AUCUN trigger** |
| `staffing_plan_step` | `trg_staffing_plan_step_updated` (updated_at) |
| `heures_saisies` | 11 triggers (validation, audit, notif…) |

---

## 2. Source de vérité par use case

| Use case | Source écrite | Synchronisé ? |
|---|---|---|
| Auto-staffing greedy | `staffing_plan_assignment` | Non — visible dans Gantt plan seulement, jusqu'à `publishStaffingPlan` |
| Assignation manuelle chef sur step (wizard) | `staffing_plan_assignment` | Idem |
| **Publication d'un plan** (`publishStaffingPlan`) | DELETE puis INSERT `assignations` `WHERE staffing_plan_id=planId` | **Oui mais one-shot** : aucun retour `assignations`→plan ensuite |
| Édition cellule planning (drag/drop, AssignationDialog) | `assignations` directement | **NON synchronisé** — divergence silencieuse possible si la cellule édite un créneau issu d'un plan publié |
| Bulk staffer rapide / par chantier | `assignations` (hors plan) | N/A |
| Suppression plan (admin) | DELETE plan → CASCADE `staffing_plan_assignment`. `assignations.staffing_plan_id` passe à NULL. **Les créneaux planning survivent.** | Volontaire — préserve la paie |
| Annulation Express (≤10min, auteur, draft) | Idem (détache puis CASCADE) | OK |
| Restore snapshot | Recrée `staffing_plan_step` + `staffing_plan_assignment` uniquement, PAS `assignations` | **Désynchronisation après restore** : le planning principal reste sur l'état pré-restore jusqu'à un nouveau publish |
| Heures saisies (employé) | `heures_saisies` avec `assignation_id` (nullable), `affaire_id`, `metier_id`, `fabrication_objet_id` directs | Pas de lien remontant vers le plan |

**Conclusion §2** : il y a en réalité **trois mondes** et non deux :
1. **Plan en cours d'élaboration** = `staffing_plan_step` + `staffing_plan_assignment` (vie isolée tant que `status='draft'`)
2. **Planning opérationnel** = `assignations` (alimenté par publish, mais aussi par toutes les actions hors-plan)
3. **Réalité** = `heures_saisies` (relié facultativement à `assignation_id`, mais avec ses propres clés métier `fabrication_objet_id` + `metier_id`)

La divergence #2 vs #1 après publication n'est PAS surveillée. C'est la dette principale.

---

## 3. Analyse du trigger `sync_assignation_objet` proposé (spec §2.4)

Le trigger proposé tente de remplir `assignation_objets` à chaque INSERT sur `assignations`, en remontant le `step_id → objet_id` via `staffing_plan_assignment`.

### Risques identifiés

1. **Pas de risque de boucle** : il écrit dans `assignation_objets` (table sans trigger), pas dans `assignations`. OK sur ce point.
2. **Coût perf sur publishStaffingPlan** : la fonction fait un INSERT batch (jusqu'à plusieurs centaines de lignes). Le trigger AFTER INSERT FOR EACH ROW fait **un SELECT joint sur 2 tables par ligne** → O(n) requêtes pendant un INSERT prévu pour être atomique. À l'échelle d'un plan de 200 assignations × 3 jointures, on passe de ~30ms à 600ms-2s. Pas catastrophique mais notable.
3. **Faux positif** : si `staffing_plan_assignment` n'a pas encore été matché (cas d'INSERT d'assignations hors plan via PlanningGrid avec `staffing_plan_id` mis manuellement), le SELECT renvoie NULL → pas d'insert dans `assignation_objets`. Silencieux. OK.
4. **Trou métier** : pour les assignations créées hors plan (drag-drop, bulk staffer), elles n'ont pas de step source → `objet_id` reste NULL. **Le lien objet ne peut PAS être inféré côté serveur dans ces cas.** Il faudrait que l'UI demande l'objet à la saisie.
5. **`assignation_objets` étant vide aujourd'hui** : aucun risque de migration de données. Backfill faisable une fois publish.

### Recommandation

❌ **Pas de trigger**. Préférer un **UPDATE explicite dans `publishStaffingPlan`** :

```sql
-- Dans publishStaffingPlan, après l'INSERT assignations,
-- même boucle de rows + on connaît déjà step.objet_id :
INSERT INTO assignation_objets(assignation_id, objet_id, created_by)
SELECT a.id, s.objet_id, $userId
FROM assignations a
JOIN staffing_plan_assignment spa
  ON spa.employe_id = a.employe_id AND spa.date = a.date
JOIN staffing_plan_step s ON s.id = spa.step_id
WHERE a.staffing_plan_id = $planId
  AND s.objet_id IS NOT NULL;
```

**Avantages** : 1 seule requête au lieu de N triggers ; contrôle explicite ; pas de magie cachée pour le futur dev. Cohérent avec le pattern existant (publishStaffingPlan est déjà l'orchestrateur transactionnel).

---

## 4. Faisabilité de la vue matérialisée `v_objet_heures_consolidees` (spec §2.3)

### Le SQL proposé est faux

La spec part de l'hypothèse que `heures_saisies` n'a pas d'`objet_id` direct et passe par `assignation_objets`. **C'est faux** : `heures_saisies.fabrication_objet_id` existe (cf. §1.1) et est populée par la saisie chef/mobile depuis longtemps. Le sub-select `LEFT JOIN heures_saisies hs ON hs.id = (SELECT … LIMIT 1)` est en plus un anti-pattern (ne retourne qu'une ligne arbitraire).

### SQL corrigé (proposition)

```sql
CREATE MATERIALIZED VIEW public.v_objet_heures_consolidees AS
SELECT
  fo.id AS objet_id,
  fo.affaire_id,
  m.id AS metier_id,
  m.code AS metier_code,
  -- Prévu (sur fabrication_objets)
  CASE m.code
    WHEN 'BE' THEN fo.heures_prevues_be
    WHEN 'NUM' THEN fo.heures_prevues_numerique
    WHEN 'BOIS' THEN fo.heures_prevues_bois
    WHEN 'METAL' THEN fo.heures_prevues_metal
    WHEN 'PEINT' THEN fo.heures_prevues_peinture
    WHEN 'TAP' THEN fo.heures_prevues_tapisserie
    WHEN 'MANUT' THEN fo.heures_prevues_manutention
    ELSE 0
  END AS heures_prevues,
  -- Planifié (via steps × assignments, formule cohérente v0.39.0b : pers × demi × H_HALF)
  COALESCE((
    SELECT SUM(spa.presence_pct/100.0 * sps.h_par_jour)
    FROM staffing_plan_step sps
    JOIN staffing_plan_assignment spa ON spa.step_id = sps.id
    JOIN staffing_plan p ON p.id = sps.plan_id
    WHERE sps.objet_id = fo.id
      AND sps.metier_id = m.id
      AND p.status = 'published'
  ), 0) AS heures_planifiees,
  -- Réel (direct, RIEN à passer par assignation_objets)
  COALESCE((
    SELECT SUM(hs.heures_reelles)
    FROM heures_saisies hs
    WHERE hs.fabrication_objet_id = fo.id
      AND hs.metier_id = m.id
      AND hs.statut = 'valide'
  ), 0) AS heures_reelles
FROM fabrication_objets fo
CROSS JOIN metiers m
WHERE fo.archive = false;

CREATE UNIQUE INDEX ON v_objet_heures_consolidees(objet_id, metier_id);
```

### Refresh quotidien

Mécanismes envisageables :

| Option | Avantages | Inconvénients |
|---|---|---|
| **pg_cron** | Natif Supabase, déjà utilisé sur le projet, transactionnel | Pas de visibilité côté logs applicatifs |
| Server route `/api/public/cron/refresh-views` + cron externe | Logs visibles, on peut chaîner d'autres tâches | Dépendance externe (Setup Paris n'a pas de scheduler géré pour l'instant) |
| Edge function avec `Deno.cron` | Lovable Cloud-natif | On évite déjà les edge functions sur ce stack |

**Reco** : `pg_cron` à 03h00 UTC (créneau creux), `REFRESH MATERIALIZED VIEW CONCURRENTLY v_objet_heures_consolidees;`.

### Coût refresh estimé

Volumétrie cible 12-24 mois : ~500 objets × 8 métiers = 4 000 lignes. Le calcul est dominé par le SELECT planifié (jointure plan/step/assignment, ~120-2000 lignes) et réel (~100-5000 heures_saisies). **Estimé < 5 secondes**. Pas de souci. `CONCURRENTLY` permet de ne pas bloquer la lecture.

---

## 5. Recommandation d'architecture cible

### Option A — Unifier (supprimer `staffing_plan_assignment`, tout dans `assignations`)

Avantages : une seule source. Inconvénients : impossible en l'état — `assignations` est une vue planning « engagée » (notifications, audit RGPD, contrats, paie, RH), `staffing_plan_assignment` est un brouillon collaboratif éditable à 4 mains. Mélanger casserait l'UX (chaque édition de plan déclencherait des notifs employés / audits / contrats). **Rejet.**

### Option B — Garder la dualité avec sync explicite (reco)

- **`staffing_plan_assignment`** = plan en cours (draft) ou snapshot (published, lecture seule UX hors restore admin).
- **`assignations`** = créneaux engagés. Seul `publishStaffingPlan` peut les créer/maj depuis un plan. Toute édition planning hors plan reste autorisée (PlanningGrid, BulkStaffer) mais doit alors **détacher** `staffing_plan_id` = NULL pour signaler qu'on diverge.
- Ajouter une **vue `v_plan_planning_diff`** (matérialisée ou pas) qui liste les créneaux `assignations.staffing_plan_id = X` qui n'ont plus de pendant dans `staffing_plan_assignment` après une édition planning → bandeau « ⚠ Le planning a divergé du plan publié, republier ? » sur la fiche affaire.
- Ajouter un trigger `BEFORE UPDATE ON assignations` qui passe `staffing_plan_id = NULL` automatiquement si on modifie `employe_id`, `date`, `metier_id` ou `heures` (évite que l'UI oublie).

**Choix recommandé : Option B.** Conserve l'isolation brouillon ↔ engagé, expose proprement la dette quand elle apparaît, n'oblige pas de refacto massif.

---

## 6. Tests E2E impactés

Tout changement sur ces flux impactera :

- `e2e/staffing/auto-staffing-v039.chef.spec.ts` — couvre Vue 3 + edits + autosave
- `e2e/staffing/cell-edit-cascade.chef.spec.ts` — édition cellule, doit valider la divergence `staffing_plan_id → NULL` proposée
- `e2e/staffing/greedy-priorite.chef.spec.ts` — tier-ranking, devrait être insensible
- `e2e/staffing/manut-refonte-v040.chef.spec.ts` — flux manut
- `e2e/heures/chef-saisit-pour-employe.chef.spec.ts` — chemin `heures_saisies.fabrication_objet_id`
- `e2e/chef/staffing-v035.chef.spec.ts` — wizard publish
- `e2e/admin/role-smoke.admin.spec.ts` + `e2e/chef/role-smoke.chef.spec.ts` — battery RGPD, à vérifier si nouvelles routes (fiche objet) sont visibles
- `e2e/mobile-chef/sprint1-7scenarios.chef.spec.ts` — staffing mobile

**Effort estimé d'adaptation** : 4-8h selon la profondeur des changements. À chiffrer précisément quand on touche au code.

---

## 7. Décisions à valider avant Sprint 2 (fiche objet)

1. **Trigger `sync_assignation_objet` ou UPDATE explicite ?** → reco : UPDATE explicite dans `publishStaffingPlan` (§3).
2. **Vue matérialisée corrigée (§4) approuvée ?** → SQL ci-dessus, refresh pg_cron quotidien.
3. **Architecture Option B (§5) validée ?** → garder dualité + sync via publish + détecteur de divergence + trigger défensif sur UPDATE `assignations`.
4. **Backfill `assignation_objets` ?** → table actuellement vide. Faut-il la rétro-alimenter à partir des `staffing_plan_assignment` des plans publiés (~120 lignes) ou la laisser vide et ne la peupler qu'à partir de la prochaine `publishStaffingPlan` ? Reco : **backfill one-shot** dans la migration de mise en place, ça simplifie la fiche objet pour les chantiers existants.
5. **Cas hors plan** : assignations créées via PlanningGrid/BulkStaffer ne peuvent pas inférer `objet_id`. Faut-il rendre **AssignationDialog conscient de l'objet** (combobox optionnelle si l'affaire est en 5XXX) ? Reco : oui, ajouter en Sprint 2 quand la fiche objet existe.

---

## 8. Risques résiduels non couverts par cet audit

- **`statut_chef` sur `fabrication_objets`** : la spec propose un `statut_chaine` séparé. Conflit possible avec `statut_chef` actuel (a_faire/en_cours/termine). À arbitrer : remplacer, coexister ou renommer ?
- **`affaire_equipe_historique`** : alimentée par `trg_aeh_assignations` sur `assignations`. La synchro plan→planning étant éparse, l'historique reflète déjà l'état engagé, pas l'état planifié. Donc pas de risque, mais à noter pour la cohérence du widget « Mon équipe type ».
- **RLS sur la future vue matérialisée** : Postgres n'applique pas RLS sur les MV. Si on veut exposer cette vue côté client, il faut wrapper via une fonction `SECURITY DEFINER` qui filtre par affaire ou la consommer uniquement via server function.

---

## Annexe — extraits de code pertinents

### `publishStaffingPlan` (l.103-138) — propagation plan→planning

```ts
/* 6. Propagation vers Planning principal — assignations */
await supabase.from("assignations").delete().eq("staffing_plan_id", planId);

if (assignments.length > 0 && steps && steps.length > 0) {
  // ... mapping step_id → step, construction des rows assignations
  const { error: assErr } = await supabase.from("assignations").insert(rows);
}
```

### `deleteStaffingPlan` (l.44-49) — détachement préserve planning

```ts
const { error: aErr } = await supabase
  .from("assignations")
  .update({ staffing_plan_id: null })
  .eq("staffing_plan_id", data.planId);
```

### `restoreStaffingPlanFromSnapshot` (l.346-361) — restore PARTIEL

```ts
// Restore reconstruit staffing_plan_step + staffing_plan_assignment
// MAIS PAS assignations → divergence après restore tant que pas republished
await supabase.from("staffing_plan_assignment").insert(asgRows);
```

— Fin audit —
