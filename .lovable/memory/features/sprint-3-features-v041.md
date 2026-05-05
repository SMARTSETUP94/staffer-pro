---
name: Sprint 3 features v0.41
description: Sprint 3 features métier — v0.41.0a hotfix heures invisibles côté employé
type: feature
---

## v0.41.0a — Hotfix heures invisibles côté employé (BUG #33)

**Symptôme historique** : chef saisit des heures pour un employé via
`/saisie-pour-equipe` ou `SaisirPourEmployeDialog` → en DB OK + RLS OK
(audit Sprint 1 v0.39.1 a confirmé `heures_saisies_self_select` multi-acteur),
mais l'employé ne voyait pas la saisie sur `/mes-heures` / `/ma-semaine` /
`/mobile/heures` après login.

### Cause racine identifiée v0.41.0a

Pas de bug RLS, pas de filtre client erroné. Deux faiblesses cumulées dans
`src/hooks/use-mes-heures.ts` :

1. **`useMemo` rows manquait `affairesById` + `metiersById` en deps** : les
   saisies hors planning créées par un chef pour un employé qui n'a pas
   d'assignation sur l'affaire affichaient "(chargement…)" indéfiniment
   parce que la combinaison ne re-roulait pas après le lookup async.
2. **Aucun refetch sur `visibilitychange` ni `focus`** : un employé qui
   gardait l'onglet ouvert ou rebasculait dessus après login ne voyait pas
   les nouvelles saisies, le hook ne rafraîchissait que sur `weekStart` ou
   `reloadKey` manuel.

### Fix

- Ajout de `affairesById, metiersById` dans les deps du `useMemo` `rows`.
- Nouvel `useEffect` sur `employeId` qui écoute `visibilitychange` + `focus`
  et bump `reloadKey` quand `document.visibilityState === "visible"`.
- Test de non-régression : `src/hooks/__tests__/use-mes-heures-refetch.test.ts`
  (3 invariants : deps complètes + listeners présents + filtre uniquement
  sur `employe_id`, pas `created_by` / `saisi_par`).

### Garde-fous toujours en place

- RLS `heures_saisies_self_select` : `is_chef_or_admin() OR employe_id IN
  (employes WHERE profile_id=auth.uid()) OR user_has_affaire_access(affaire_id)`.
- Trigger DB `set_saisie_authorship` remplit `saisi_par` + `saisi_par_chef`.
- Aucun filtre client n'utilise `created_by` / `saisi_par_chef` côté employé.

### À faire si réapparition

1. Vérifier que `employe_id` dans le SELECT correspond bien à
   `employes.id WHERE profile_id = auth.uid()` (preview admin override OK
   via `employeIdOverride`).
2. Tester `await supabase.from('heures_saisies').select('*').eq('employe_id', X)`
   directement depuis la console employé : si rien, c'est RLS — sinon, c'est
   un cache React Query / state stale.
3. Activer realtime sur `heures_saisies` (pas activé à ce jour) si on veut
   un push instantané plutôt qu'un refresh sur focus.

## v0.41.0c — Sprint 3c.1 — E2E EMPLOYE DESKTOP + infra split (5 mai 2026)

**Goal** : passer de 0 → 6 tests employé desktop dédiés, avec storage state
isolé pour ne pas polluer les tests employé mobile.

### Infra
- `e2e/fixtures/test-accounts.ts` : ajout `employe_desktop` + `employe_mobile`
  (storageStatePath séparés `e2e/.auth/employe-desktop.json` et `…-mobile.json`),
  fallback transparent vers `E2E_EMPLOYE_*` si pas de credentials dédiés en CI.
- `playwright.config.ts` : projects `employe-desktop` et `employe-mobile`
  pointent désormais sur leurs storageState respectifs (au lieu de partager
  `employe.json`).
- `e2e/global-setup.ts` boucle déjà sur `Object.values(TEST_ACCOUNTS)` →
  les 2 nouveaux storageStates sont générés automatiquement au premier run.

### Tests ajoutés (`e2e/employe-desktop/flows-critiques.employe-desktop.spec.ts`)
- D1 `/mes-heures` rend la grille semaine (regression v0.41.0a).
- D2 saisie hors planning desktop (modale Autre chantier ouvre).
- D3 `/ma-semaine` affiche au moins un repère semaine.
- D4 `/mobile/profil` accessible aux employés desktop aussi.
- D5 bouton Se déconnecter visible depuis la sidebar.
- D6 anti-fuite RGPD : `/staffing/<uuid>` refusé (redirect / 4xx / message).

## v0.41.0c — Sprint 3c.2 + 3c.3 — E2E mobile + extras chef/admin (5 mai 2026)

### 3c.2 — Employé mobile (Pixel 7 viewport)
`e2e/employe-mobile/flows-critiques.employe-mobile.spec.ts` :
- M1 `/mobile/aujourdhui` rend vue du jour.
- M2 `/mobile/heures` grille de saisie.
- M3 modale `+ Autre chantier` compacte (boundingBox ≤ viewport).
- M4 anti-fuite RGPD `/staffing/<uuid>` refusé.

### 3c.3 — Chef extras
`e2e/chef/extras-validation-staffing.chef.spec.ts` :
- C1 onglet 'Hors planning' sélectionnable sur `/validation-heures`.
- C2 bouton 'Auto-staff complet' visible sur `/staffing/<id>`.

### 3c.3 — Admin extras
`e2e/admin/extras-utilisateurs-audit.admin.spec.ts` :
- A1 bouton 'Inviter un utilisateur' ouvre dialog email.
- A2 bouton 'Auto-lier employés' enabled (utilisateurs ou employés).
- A3 bouton export visible sur `/audit-heures`.

### CI
- `.github/workflows/e2e.yml` : 4 → 5 shards parallèles, timeout 20 min/shard.
- Couverture totale : 12 → 27+ tests E2E sur 4 rôles (admin / chef / employé-desktop / employé-mobile + smoke).

### Reste à faire
- Sprint 3b — Logistique avancée (autorisations véhicules + sous-traitants carnet + historique + stats).

## v0.41.0b — Sprint 3b.1 + 3b.2 — Logistique avancée (5 mai 2026)

### 3b.1 — Autorisations véhicules
- Table `employes_autorisations_vehicules` + enum `autorisation_vehicule_type`
  (PERMIS_B/C/CE/D + CACES_R489/R486/R484).
- Vue `v_employes_autorisations_actives` avec statut calculé
  (valide / expiration_proche ≤30j / expire). Backfill auto depuis
  `employes.categories_permis` (legacy conservé).
- Page admin `/parametres/autorisations-vehicules` : matrice équipe × types,
  badges statut couleur. Section sur fiche employé. Modale unifiée upsert.
- `src/lib/autorisations-vehicules.ts` + 13 tests Vitest.

### 3b.2 — Carnet sous-traitants
- Table `sous_traitants` + enum `sous_traitant_type`
  (transport / manutention / fabrication / autre). UNIQUE lower(nom),
  RLS lecture authenticated, écriture chefs/admins. Backfill auto depuis
  `trajets.prestataire`.
- Page admin `/parametres/sous-traitants` (recherche + filtre type +
  toggle actifs) avec dialog création/édition validé (nom, email RFC,
  SIRET 14 chiffres, tarifs ≥ 0).
- Autocomplete `PrestataireAutocomplete` branché dans `TrajetDialog`
  sur le carnet (type=transport, actifs). Saisie libre toujours possible.
- `src/lib/sous-traitants.ts` + 9 tests Vitest. Total 1429 tests verts.

### Reste à faire (Sprint 3b suite)
- 3b.3 — Historique trajets enrichi (filtres avancés, drilldown véhicule).
- 3b.4 — Stats flotte (KPIs sous-traitance, top transporteurs, € engagés).
