# v0.48 FINAL — Vue Par pôle simplifiée + refonte navigation (planning recentré staffing)

Plan révisé intégrant les 4 modifications demandées par Gabin. Effort total ~22h (déjà ~5h livrées sur la modif #1 vue Par pôle + teinte 9XXX, qui restent valables).

## Modif 1 — Vue "Par pôle" simplifiée (DÉJÀ LIVRÉE, conservée)

Matrice métiers × jours, badge nb personnes, hover popover vignettes, badge `PRÉV` pour 9XXX. RPC `staffing_par_pole_jours` en place. Aucun changement.

## Modif 2 — Toggle "Inclure opportunités" (DÉJÀ BRANCHÉ, conservé)

Géré par `p_inclure_opportunites` dans la RPC. OK.

## Modif 3 — Teinte ambrée 9XXX sur "Par chantier" (DÉJÀ LIVRÉE, conservée)

`bg-amber-50/40 dark:bg-amber-950/20` + `data-opportunite="true"` sur les `<td>` des lignes 9XXX. OK.

## Modif 4 — Refonte navigation : 3 onglets sortis du planning vers leur section native (NOUVEAU)

### 4.a Création de 3 nouvelles routes

```text
/logistique/vehicules-planning   ← ex onglet "Véhicules staffés" (FlotteGrid)
/affaires/budget-planning         ← ex onglet "Budget chantier" (PlanningSynthese)
/export/feuille-de-route          ← ex onglet "Feuille de route" (FeuilleRouteTableurView)
```

Fichiers TanStack à créer :
- `src/routes/_app.logistique.vehicules-planning.tsx`
- `src/routes/_app.affaires.budget-planning.tsx`
- `src/routes/_app.export.feuille-de-route.tsx`

Chaque page :
- Réutilise telle quelle le composant existant (`FlotteGrid`, `PlanningSynthese`, `FeuilleRouteTableurView`).
- Réimplémente le **bandeau filtres partagé** (sélecteur de semaine + toggle "Inclure opportunités" + multi-filter Métier/Affaire/Devis + toggle weekend) en se basant sur le hook `usePlanningData` déjà utilisé par `/planning`. Pas de Zustand : on extrait un petit composant `<PlanningFiltresBar>` factorisable, partagé entre la page `/planning` et les 3 nouvelles pages. Chaque page a son propre état local de filtres (pas de cross-page sync — c'est intentionnel, chaque vue a son contexte métier).
- Breadcrumb en haut de page :
  - `Accueil > Logistique > Véhicules planning`
  - `Accueil > Chantiers > Budget chantier`
  - `Accueil > Outils > Feuille de route`
  Composant `<PageBreadcrumb items={[…]} />` léger (Link TanStack + ChevronRight) si pas déjà existant, sinon réutilise le composant Breadcrumb shadcn.

### 4.b Sidebar — ajout des 3 entrées

Dans `src/components/AppSidebar.tsx` :
- Section **Logistique** : ajouter `{ title: "Véhicules planning", url: "/logistique/vehicules-planning", icon: CalendarRange }` entre Véhicules et Demandes transport.
- Section **Chantiers** : ajouter `{ title: "Budget chantier", url: "/affaires/budget-planning", icon: TrendingUp }` après Devis.
- Section **Outils** : ajouter `{ title: "Feuille de route", url: "/export/feuille-de-route", icon: ClipboardList }` après Export planning.

### 4.c Suppression des 3 onglets du planning

Dans `src/routes/_app.planning.tsx` :
- Retirer les `TabsTrigger` `value="budget"`, `value="flotte"`, `value="feuilleroute"` (lignes ~495-507).
- Retirer les `TabsContent` correspondants (lignes ~606, ~619, ~691).
- Retirer les imports devenus inutiles (`PlanningSynthese`, `FlotteGrid`, `FeuilleRouteTableurView`) — utilisés UNIQUEMENT dans les nouvelles pages.
- Retirer du type union `tab` les valeurs `"budget" | "flotte" | "feuilleroute"`.
- Le planning passe à **5 onglets** : `cdi | interim | parchantier | parobjet | parpole`.

### 4.d Redirects depuis anciens query params

Pas de "redirect HTTP 301" possible côté SPA TanStack (le serveur ne sait pas distinguer). On gère côté client dans le `loader` (ou `beforeLoad`) de `/planning` :

```typescript
beforeLoad: ({ search }) => {
  const tab = (search as any)?.tab;
  const map: Record<string, string> = {
    flotte: "/logistique/vehicules-planning",
    vehicules: "/logistique/vehicules-planning",
    budget: "/affaires/budget-planning",
    feuilleroute: "/export/feuille-de-route",
  };
  if (tab && map[tab]) {
    throw redirect({ to: map[tab], replace: true });
  }
},
```

Pas de changement HTTP-status (impossible en SPA), mais l'utilisateur arrive sur la bonne page au lieu d'un onglet inexistant. `replace: true` évite de polluer l'historique.

### 4.e Tests E2E

3 specs minimales dans `e2e/planning/` :
- `par-pole-matrice.chef.spec.ts` (déjà prévu modif 1)
- `nav-refonte-redirect.chef.spec.ts` — vérifie que `/planning?tab=flotte` redirige vers `/logistique/vehicules-planning`, `?tab=budget` vers `/affaires/budget-planning`, `?tab=feuilleroute` vers `/export/feuille-de-route`.
- `par-chantier-9xxx-tint.chef.spec.ts` (déjà prévu modif 3)

### 4.f Mémoire

`mem://features/planning-par-pole-v048.md` mis à jour pour acter la refonte nav (planning à 5 onglets). Ajout d'une note `Core` dans `mem://index.md` :

> v0.48 : `/planning` recentré staffing (5 onglets). Vues Véhicules, Budget, Feuille de route extraites vers `/logistique/vehicules-planning`, `/affaires/budget-planning`, `/export/feuille-de-route`. Redirect côté client depuis anciens `?tab=`.

## Composant partagé `PlanningFiltresBar`

Pour éviter 4 copies de la barre filtres, extraction dans `src/components/planning/PlanningFiltresBar.tsx` :
- Props : `weekStart`, `setWeekStart`, `showWeekend`, `setShowWeekend`, `includeOpportunites`, `setIncludeOpportunites`, listes filtre (metiers, affaires) optionnelles.
- Chaque page déclare son propre `useState` pour l'état des filtres.

## Effort & livraison

| Lot | Effort | Status |
|---|---|---|
| Modif 1 vue Par pôle | 7h | ✅ déjà livré |
| Modif 2 toggle opp | 0h | ✅ déjà branché |
| Modif 3 teinte 9XXX Par chantier | 1h | ✅ déjà livré |
| Modif 4.a 3 nouvelles routes + breadcrumbs | 4h | ⏳ |
| Modif 4.b Sidebar 3 entrées | 1h | ⏳ |
| Modif 4.c Suppression 3 onglets planning | 1h | ⏳ |
| Modif 4.d Redirects ?tab= | 1h | ⏳ |
| Modif 4.e 3 tests E2E | 2h | ⏳ |
| Modif 4.f Mémoire | 0.5h | ⏳ |
| Extraction `PlanningFiltresBar` | 2h | ⏳ |

Total restant : ~12h.

## Validation

Skip / Edit / Approve ?
