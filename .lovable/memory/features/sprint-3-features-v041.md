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
