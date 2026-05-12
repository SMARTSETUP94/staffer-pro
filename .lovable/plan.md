# Sprint Simplification v0.47

Tu as retenu 5 chantiers : **#9 Auth/routing**, **#7 Poste management**, **#6 Absences/congés**, **#10 Dashboard widgets registry**, **#1 "Mon équipe type" widget→teaser**.

Je propose de les livrer dans cet ordre (du plus safe au plus structurant) en 4 sous-versions.

---

## v0.47.0 — Quick wins UI (≈ 1 itération)

### #1 — "Mon équipe type" widget devient teaser
- `src/components/dashboard/MonEquipeTypeWidget.tsx` (ou équivalent) : ne montre plus que **top 3 + 1 KPI agrégé** (nb coéquipiers fréquents).
- Bouton CTA unique "Voir mon équipe type →" → `/mon-equipe-type`.
- Suppression des filtres typologie/période et du drilldown Sheet **dans le widget** (conservés sur la page).
- Mise à jour test E2E si présent.

### #10 — Dashboard widgets registry
- Nouveau `src/components/dashboard/widgets-registry.ts` :
  ```ts
  export type WidgetRole = "admin" | "chef_global" | "chef_scoped" | "employe";
  export interface WidgetDef {
    id: string;
    component: ComponentType;
    roles: WidgetRole[];      // whitelist (cf. mem://features/dashboard-role-guard)
    layout?: { col: number; row: number };
  }
  export const dashboardWidgets: WidgetDef[] = [...];
  ```
- Refacto `src/routes/_app.dashboard.tsx` : map sur le registry au lieu des `if !isAdmin return null` éparpillés.
- Suppression des gardes inline dans chaque widget (ChiffreAffaires, MonEquipeType, etc.).
- Test : `widgets-registry.test.ts` (admin → tout, chef → pas commerce, employe → perso uniquement).

---

## v0.47.1 — Auth/routing unifié (#9)

### Nouveau module `src/lib/post-login-routing.ts` (déjà partiellement testé)
- Centralise **toute** la logique de redirection post-login :
  ```ts
  export interface RoutingCtx {
    user: User | null;
    rolesLoaded: boolean;
    isAdmin: boolean;
    isAdminOrChef: boolean;
    effIsMobile: boolean;
    effIsAdminOrChef: boolean;
    isPreviewing: boolean;
  }
  export function resolvePostLoginTarget(ctx: RoutingCtx): string | null;
  ```
- Règles (synthèse mem://features/route-ma-semaine + v0.46.2) :
  - pas de user → `/login`
  - admin réel + mobile + pas preview → `/dashboard`
  - mobile + chef → `/mobile/chef/dashboard`
  - mobile + employé → `/mobile/aujourdhui`
  - desktop + admin/chef → `/dashboard`
  - desktop + employé → `/ma-semaine`

### Refacto consommateurs
- `src/routes/index.tsx` : remplace le bloc `useEffect` par `resolvePostLoginTarget(ctx)` + `navigate({ to: target })`.
- `src/routes/_app.tsx` : idem (mobile redirect).
- `src/components/auth/RoleGuard.tsx` : utilise une variante `enforcePostLoginGuard()` exportée du même module pour le cas "admin réel sur /mobile/chef".
- Tests `src/lib/__tests__/post-login-routing.test.ts` : ajouter scénarios manquants (chef desktop, employé mobile).

---

## v0.47.2 — Poste management unifié (#7)

### Constat
- 3 surfaces : `parametres/postes` (catalogue), `admin/employes-poste-principal` (saisie en lot), `parametres/metiers` (référentiel métier).

### Refonte
- Nouvelle page **`/parametres/metiers-postes`** avec 3 onglets :
  1. **Métiers** (8 métiers, lecture seule + couleur)
  2. **Postes catalogue** (CRUD ex-`/parametres/postes`)
  3. **Affectation employés** (ex-`/admin/employes-poste-principal`, autosave + import Excel conservés)
- Anciennes routes → redirect 301 vers le bon onglet (`?tab=postes` etc.) pour ne pas casser les liens.
- Sidebar : 1 entrée "Métiers & postes" au lieu de 2.

---

## v0.47.3 — Unification Absences / Congés (#6)

### Audit préalable (à faire avant migration)
- Inventaire des 2 modèles (`absences` vs ce qui ressemble à des "congés" — probablement même table déjà, à confirmer via `code--view src/hooks/use-planning-data.ts` + `src/routes/_app.absences.tsx` + `src/routes/mobile.absences.tsx`).
- Si une seule table existe déjà : la simplification se réduit à **fusionner les UI** (1 module unique avec filtre type) → faible risque.
- Si deux tables → migration `congés → absences` avec mapping type, garde-fou anti-doublon, conservation historique.

### Livrables (cas table unique, hypothèse probable)
- 1 hook unifié `useAbsences()` (suppression d'éventuels `useConges()` doublons).
- Module mobile + desktop sur le même composant `AbsenceForm` avec props `variant: "mobile" | "desktop"`.
- Anti-doublon UI live (déjà en place v0.39.1) factorisé dans le composant.

---

## Détails techniques transverses

- **Aucune migration DB** sur v0.47.0/1/2. v0.47.3 dépend de l'audit.
- **Tests** : chaque sous-version livre ses tests vitest + au moins 1 spec E2E mise à jour.
- **Rollback safe** : chaque sous-version est indépendante, peut être publiée seule.
- **Memory** : nouvelles entrées
  - `mem://features/dashboard-widgets-registry` (v0.47.0)
  - `mem://features/post-login-routing-module` (v0.47.1)
  - `mem://features/metiers-postes-unifie` (v0.47.2)
  - mise à jour `mem://features/auth-flow-roles` pour pointer vers le nouveau module

---

## Ordre d'exécution proposé

```text
v0.47.0  ──►  v0.47.1  ──►  v0.47.2  ──►  v0.47.3
 (UI)        (routing)      (postes)     (absences)
 1 PR         1 PR           1 PR          1 PR
```

Je commence par v0.47.0 dès validation. Tu veux que je livre les 4 d'affilée, ou seulement v0.47.0 puis pause pour validation ?
