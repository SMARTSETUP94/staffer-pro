# Audit mutations client-side — Sprint 1 v0.39.1

> Action 4 du brief. Grep `supabase.from(X).insert/update/delete/upsert` dans
> `src/hooks/`, `src/lib/`, `src/components/` (les server-fns sont déjà sûrs
> par construction via `requireSupabaseAuth`).
>
> Total : **42 occurrences** réparties sur **30 fichiers**.

## 🔴 TOP 5 à migrer en RPC `SECURITY DEFINER`

Ranking par risque : multi-table → orphelin possible si erreur intermédiaire,
ou opération qui devrait s'exécuter en transaction atomique.

### 1. `src/hooks/use-bulk-assign-objet.ts` — **CRITIQUE multi-table**

```ts
// L44-65 : insert assignations PUIS insert assignation_objets, rollback manuel sur erreur
const { data: inserted } = await supabase.from("assignations").insert(rows)...
const { error: errLinks } = await supabase.from("assignation_objets").insert(links);
if (errLinks) {
  await supabase.from("assignations").delete().in("id", insertedIds); // ⚠️ best-effort
}
```

**Risque** : si le `delete` de rollback échoue (réseau, RLS), on laisse
des assignations orphelines sans lien `assignation_objets`. Le bulk peut
partiellement réussir → état incohérent.

**Plan** : RPC `bulk_assign_objet_atomic(rows jsonb, links jsonb)` en
`SECURITY DEFINER` avec une seule transaction. Cf pattern
`import_devis_atomique_v3`.

### 2. `src/components/heures/SaisirPourEmployeDialog.tsx` — **CRITIQUE BUG #33**

INSERT direct sur `heures_saisies` côté chef pour le compte d'un employé.
Si `employe_id` est mal renseigné → RLS bloque l'employé en SELECT, ou pire
la saisie est attribuée au chef.

**Plan** : RPC `chef_saisit_pour_employe(employe_id uuid, affaire_id uuid,
date date, heures numeric, ...)` qui :

1. Vérifie `is_chef_or_admin()`.
2. Vérifie `can_saisie_on_affaire(affaire_id, date)`.
3. INSERT avec `saisi_par_chef = true`, `saisi_par = auth.uid()`,
   `employe_id = $1` (jamais `auth.uid()`).
4. Insère dans `heures_saisies_historique` automatiquement.

### 3. `src/components/heures/BulkSaisieDialog.tsx` — **ÉLEVÉ multi-row**

Bulk INSERT/UPSERT sur `heures_saisies` pour plusieurs employés × jours.
Pas de transaction globale → si la 5e ligne échoue (ex: doublon, RLS), les
4 premières sont commit.

**Plan** : RPC `bulk_saisie_heures_atomic(rows jsonb)` en transaction
unique avec validation `per row` retournée en JSON.

### 4. `src/hooks/use-feuille-route-tableur.ts` — **MOYEN cross-table**

UPDATE sur `affaires.typologie_future` + (probable) UPDATE
`feuille_route_lignes` dans la même action UI. Si désynchronisés →
typologie corrigée mais lignes obsolètes.

**Plan** : audit complet du fichier (~300 LOC) puis RPC
`update_feuille_route_atomic(affaire_id, typologie, lignes jsonb)`.

### 5. `src/components/planning/ParChantierAssignDialog.tsx` + `BulkStafferDialog.tsx` — **MOYEN volume**

Inserts assignations × N employés × M jours. Même problème de partial
commit que `BulkSaisieDialog`. RLS appliquée par ligne → coût perf et
risque d'incohérence.

**Plan** : RPC `bulk_staffer_chantier_atomic(...)`.

## 🟡 OK mais à surveiller (mono-table, idempotent ou faible volume)

| Fichier                             | Op       | Table             | Note                                    |
| ----------------------------------- | -------- | ----------------- | --------------------------------------- |
| `use-notifications.ts`              | UPDATE   | notifications     | self only, idempotent                   |
| `use-mes-heures.ts` (L321,348,377)  | upsert/update/insert | heures_saisies | self, RLS stricte, OK                |
| `use-upsert-opportunite.ts`         | UPDATE   | affaires          | mono-table                              |
| `use-delete-opportunite.ts`         | DELETE   | affaires          | RLS chef/admin, OK (mais cascade côté DB à vérifier) |
| `use-dashboard-layout.ts`           | UPDATE   | profiles          | self.dashboard_layout uniquement        |
| `EtapeDialog.tsx`                   | INSERT/UPDATE | fabrication_etapes | déclenche trigger historique auto |
| `EmployesSpreadsheet.tsx`           | UPDATE   | employes          | chef/admin, OK                          |
| `FeedbackButton.tsx`                | INSERT   | feedbacks         | self, RLS stricte                       |
| `VehiculeDialog.tsx` / `TrajetDialog.tsx` / `AdresseFavoriteDialog.tsx` | * | flotte | mono-table, RLS chef/admin |
| `AjouterObjetDialog.tsx` / `EditerObjetDialog.tsx` | * | fabrication_objets | mono-table |
| `AssignationDialog.tsx` / `CellEditDialog.tsx` / `BulkAssignDialog.tsx` | * | assignations | mono-table mais voir #5 pour bulk |
| `OpportunitesTableurView.tsx`       | UPDATE bulk | affaires       | bulk archive — déjà migré mode atomique |
| `PropositionsList.tsx` / `SwapsList.tsx` / `CreateSwapDialog.tsx` | * | swap_requests | mono-table, RLS self |
| `StafferVehiculeInterneDialog.tsx`  | INSERT   | feuille_route_lignes | mono-table                          |
| `auth-actions.ts` / `admin-actions.ts` | * | profiles, user_roles | server-side — OK (pas dans le scope) |

## Plan de migration recommandé

| Sprint                | Items                          | Effort |
| --------------------- | ------------------------------ | ------ |
| v0.39.2 (urgent)      | #1 bulk-assign-objet, #2 chef-saisit | ~6h    |
| v0.39.3               | #3 bulk-saisie, #5 bulk-staffer | ~6h    |
| v0.40                 | #4 feuille-route + audit complet | ~4h    |

## Note méthodo

L'audit a été automatisé par `rg -nU` sur les patterns `.from\([^)]+\)\s*\n?\s*\.(insert|update|delete|upsert)`.
Pour ré-exécuter :

```bash
rg -nU "\.from\([^)]+\)\s*\n?\s*\.(insert|update|delete|upsert)" src/hooks src/lib src/components
```
