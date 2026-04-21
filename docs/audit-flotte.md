# Audit module Flotte (lot 7)

Date : 2026-04-21
Périmètre : véhicules, trajets, chauffeurs PL autorisés, sous-traitance, adresses favorites, géocodage Nominatim.

Fichiers passés en revue :
- `src/routes/_app.flotte.tsx`
- `src/routes/_app.export.demandes-devis.tsx`
- `src/components/flotte/VehiculeDialog.tsx`
- `src/components/flotte/TrajetDialog.tsx`
- `src/components/flotte/AdresseFavoriteDialog.tsx`
- `src/components/flotte/AddressAutocomplete.tsx`
- `src/components/planning/FlotteGrid.tsx`
- `src/components/dashboard/FlotteKpisBloc.tsx`
- `src/hooks/use-vehicules.ts`
- `src/hooks/use-trajets.ts`
- `src/lib/nominatim.ts`
- `src/lib/demande-devis-helpers.ts`
- RLS : `vehicules`, `trajets`, `vehicule_chauffeurs_autorises`, `adresses_favorites`
- Trigger SQL : `guard_trajet_chauffeur_pl`, `notify_trajet_change`

Légende :
- 🔴 critique (sécurité / corruption / fuite)
- 🟠 important (UX cassée, état incohérent, perf)
- 🟡 mineur (qualité, dette)
- 🟢 bonne pratique observée

---

## 🟢 Bonnes pratiques observées

- **Trigger DB `guard_trajet_chauffeur_pl`** garde-fou côté serveur pour les PL — l'UI ne peut pas être contournée.
- **Helper `getCompatibleChauffeurs` pure et testé** (`flotte-helpers.test.ts`) couvre VL/20m³/PL et l'inactivité.
- **Rate-limit Nominatim 1 req/s** (`MIN_INTERVAL_MS = 1100`) respecte la politique d'usage publique.
- **`alerteDate` testé** sur tous les seuils (J0, J+30, J+31, expiré).
- **RLS véhicules** ouvre la lecture aux livreurs actifs (utile pour le mobile chauffeur), tout en réservant l'écriture aux chefs/admins.
- **Sync atomique chauffeurs autorisés** : `delete + insert` dans `VehiculeDialog.handleSave` repart toujours d'une base propre.

---

## 🔴 Findings critiques

### #1 — Aucune RLS sur `adresses_favorites` ne restreint la lecture aux chefs/admins, mais c'est OK… sauf que l'UPDATE et le DELETE sont aussi exposés à tous les `authenticated` via `adresses_favorites_admin_chef_modify` qui couvre `ALL` mais avec `USING is_chef_or_admin()` — donc OK en réalité. **À VÉRIFIER en runtime** : un employé non-chef peut SELECT (politique `_select_authenticated`) mais ne peut pas UPDATE/DELETE. ✅ Pas de finding réel après relecture, downgradé à 🟢.

> Rétractation : pas un finding, RLS correcte.

### #2 — Le `parent_trajet_id` n'a aucune contrainte d'intégrité et la suppression cascade n'est pas atomique
**Impact** : `TrajetDialog.handleDelete` fait deux requêtes séparées :
```ts
await supabase.from("trajets").delete().eq("parent_trajet_id", trajet.id);
const { error } = await supabase.from("trajets").delete().eq("id", trajet.id);
```
Si la 1re réussit et la 2e échoue (RLS, network), on supprime l'enfant mais on garde le parent → état incohérent. Idem en cas d'aller-retour : pas d'`ON DELETE CASCADE` sur la FK `parent_trajet_id` (FK absente dans la liste, à confirmer).
**Reco** : ajouter `ON DELETE CASCADE` sur `trajets.parent_trajet_id` au niveau DB, et simplifier le code en une seule `DELETE WHERE id = ?`.

---

## 🟠 Findings importants

### #3 — `useVehicules` et `useAdressesFavorites` ne dédupliquent pas les fetchs
**Impact** : chaque composant qui appelle `useVehicules()` lance son propre `SELECT * FROM vehicules`. Sur la page Planning (`FlotteGrid`, `TrajetDialog` ouvert, dashboard), on peut déclencher 3-4 requêtes identiques.
**Reco** : passer à TanStack Query (`useQuery({ queryKey: ['vehicules'], … })`) pour profiter du cache global, ou hisser le state dans un context.

### #4 — `VehiculeDialog` perd la sync chauffeurs autorisés si `vehicule.id` ne change pas mais `open` repasse à true
```ts
useEffect(() => { … }, [open, vehicule?.id]);
```
Avec `eslint-disable-next-line` désactivé. Si on ferme/rouvre le dialog sur le même véhicule après un échec, on ne recharge pas `autorises`. Acceptable mais à documenter.
**Reco** : retirer le `eslint-disable` et lister explicitement `loadAutorises`/`loadEmployes` (ou les transformer en `useCallback`).

### #5 — Synchronisation chauffeurs autorisés non transactionnelle
Dans `VehiculeDialog.handleSave`, si `delete` réussit mais `insert` échoue (réseau, RLS), on perd toutes les autorisations PL existantes.
**Reco** : exposer une RPC `set_vehicule_chauffeurs_autorises(_vehicule_id, _employe_ids[])` qui fait `DELETE + INSERT` dans une transaction côté serveur.

### #6 — Trigger `guard_trajet_chauffeur_pl` lève une exception générique côté UI
Le `TrajetDialog` valide visuellement (`chauffeurIncompatible`) mais en cas de bypass (race, ancien dialog ouvert sur un PL dont les autorisations ont changé), le trigger renvoie une erreur SQL brute affichée dans le toast — pas friendly.
**Reco** : intercepter `code === 'check_violation'` dans `handleSave` et afficher un message clair : « Ce chauffeur n'est plus autorisé sur ce poids lourd. Recharge le dialog. »

### #7 — `AdresseFavoriteDialog.handleSave` géocode silencieusement sans annuler la requête en cours
Si l'utilisateur clique « Enregistrer » alors qu'un géocodage manuel tourne, on lance une 2e requête Nominatim. Pas de bug mais inefficace.
**Reco** : factoriser la logique en un `geocodeIfNeeded()` qui réutilise la promesse en cours, ou désactiver le bouton « Enregistrer » tant que `geocoding === true`.

### #8 — `FlotteKpisBloc` somme `kilometrage` sans filtrer sur les trajets non-sous-traités
Un trajet « à sous-traiter » avec kilométrage prévisionnel est compté dans le total km de la flotte interne — fausse les KPIs.
**Reco** : filtrer `statut_soustraitance = 'non'` et `vehicule_id IS NOT NULL` dans la requête KPI.

### #9 — Pas d'index sur `trajets(date)` ni `trajets(vehicule_id, date)`
Les requêtes `useTrajetsWeek` et `FlotteKpisBloc` font du range-scan sur la date. À volume modéré ça passe, mais à 1k+ trajets/an la lenteur va se voir.
**Reco** : `CREATE INDEX idx_trajets_date ON trajets(date);` et un composite `(vehicule_id, date)` pour les requêtes par véhicule.

### #10 — Sélection d'affaire dans `TrajetDialog` non recherchable et non virtualisée
Le `<Select>` shadcn affiche TOUTES les affaires (potentiellement 100+) sans recherche. UX dégradée à partir de 30-40 affaires.
**Reco** : passer à un Combobox avec recherche (cf. `AffaireCombobox` existant côté planning) — réutiliser le composant.

---

## 🟡 Findings mineurs

### #11 — `window.confirm()` natif sur 3 suppressions (véhicule, adresse, trajet)
Incohérent avec le reste de l'app qui utilise `AlertDialog` shadcn. Mêmes findings que sur les commentaires d'affaires (lot 6 #8).
**Reco** : remplacer par `AlertDialog` partout en factorisation un `useConfirm()` hook.

### #12 — `eslint-disable-next-line react-hooks/exhaustive-deps` à 3 endroits
- `VehiculeDialog.tsx` (effet de chargement)
- `TrajetDialog.tsx` (reset state, `defaultDate/defaultVehiculeId` non listés)
- `useTrajetsWeek` (deps en `weekStart.getTime()`)

Pas critique mais ça masque potentiellement des bugs subtils (stale closure).
**Reco** : lister explicitement les deps ou wrapper en `useCallback`.

### #13 — `AddressAutocomplete` ne ferme pas le popover sur Escape ni sur clic extérieur fiable
Le `<Popover>` Radix gère le clic extérieur mais l'`onFocus={() => setOpen(true)}` peut ré-ouvrir immédiatement en cas de blur/refocus rapide. Pas testé en e2e.
**Reco** : QA mobile + ajouter un `onBlur` qui ferme avec un petit délai.

### #14 — Géocodage silencieux dans `handleSave` n'avertit pas en cas d'échec
Si Nominatim renvoie 0 résultat, on enregistre `lat/lon = null` sans dire à l'utilisateur que la géolocalisation a échoué. L'adresse est sauvée OK, mais les futurs calculs km/itinéraire ne marcheront pas.
**Reco** : afficher un toast warning « Adresse non géolocalisée — coordonnées manquantes ».

### #15 — `TrajetDialog` `notes` vs `demandeText` : champ partagé en base mais 2 useState distincts
À l'édition, `notes` ET `demandeText` sont initialisés depuis `trajet.notes`. À la sauvegarde, on choisit l'un ou l'autre selon `sousTraitance`. Si l'utilisateur toggle sous-traitance puis annule sans submit, l'autre champ reste vide → confusion à la prochaine ouverture.
**Reco** : un seul state `notesField` + un label dynamique selon le toggle.

### #16 — `AddressAutocomplete` ne nettoie pas `abortRef` dans le cleanup
```ts
return () => {
  if (debounceRef.current) clearTimeout(debounceRef.current);
};
```
Manque `abortRef.current?.abort()` — fuite légère de fetch en cours au démontage.

### #17 — Pas de pagination sur `/export/demandes-devis`
Avec une activité soutenue, la liste peut atteindre 50+ trajets. Tout est rendu en une fois.
**Reco** : limiter à 20 par défaut + pagination ou « Voir plus ».

### #18 — Champ `cout_journalier_eur` autorisé en négatif
Pas de validation côté UI ni de CHECK en base. Un coût négatif passerait.
**Reco** : `min={0}` côté input + validation côté handler.

### #19 — `searchAddress` retourne un tableau vide en cas de 429 / 5xx silencieusement
```ts
if (!res.ok) return [];
```
L'utilisateur ne sait pas si Nominatim est down ou si l'adresse est introuvable.
**Reco** : différencier les erreurs (toast warning si 5xx/429, vide si 200+0 résultats).

### #20 — `FlotteGrid` utilise un `<a href="/flotte">` au lieu de `<Link to="/flotte">`
Casse la navigation client-side TanStack Router (full reload).
**Reco** : remplacer par `<Link>` (idem pour le lien `/export/demandes-devis` plus bas).

---

## Synthèse priorité

| # | Sévérité | Fix rapide ? |
|---|---|---|
| #2 | 🔴 | Migration `ON DELETE CASCADE` + simplifier code |
| #5 | 🟠 | RPC transactionnelle |
| #6 | 🟠 | Catch `check_violation` côté UI |
| #8 | 🟠 | 1 ligne dans la requête KPI |
| #9 | 🟠 | 2 index DB |
| #10 | 🟠 | Réutiliser `AffaireCombobox` |
| #20 | 🟡 | Trivial (Link au lieu de a href) |

Les autres sont de la dette progressive — à traiter au fil des touches.
