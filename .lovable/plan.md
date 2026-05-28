# Refonte routes universelles + purge bridge auth

Validé par utilisateur : Go full refonte (L5-B → L6-A → L6-B → L6-C).
Total estimé : ~15h. Découpé en lots commitables indépendamment.

---

## L5-B — Purge bridge `auth-context` (3-4h)

### Audit (terminé)

**12 call-sites du bridge `useAuth().isXxx` :**

| Fichier | Bool consommé | Cap candidate |
|---|---|---|
| `src/routes/_app.roadmap.tsx:3380` | `isAdmin` | `admin.roadmap.manage` (à créer si absente) ou `section.admin` |
| `src/routes/_app.mon-equipe-type.tsx:104` | `isAdmin`, `isAdminOrChef` | `dashboard.team.view` |
| `src/routes/_app.heures-analyse.tsx:232` | `isAdmin` | `heures.analyse.view` |
| `src/components/auth/RoleGuard.tsx:38` | `isAdmin`, `isAdminOrChef` | **à supprimer**, remplacer par `<CapabilityGuard cap="…" />` |
| `src/components/flotte/TrajetDialog.tsx:83` | `isAdmin` | `flotte.trajet.delete` |
| `src/components/affaire-documents/AffaireDocumentsGallery.tsx:17` | `isAdmin` | `affaire.documents.delete` |
| `src/components/feedback/FeedbackButton.tsx:50` | `isAdminOrChef` | `feedback.create` (déjà large) |
| `src/components/fabrication/EtapeDialog.tsx:59` | `isAdmin` | `fabrication.etape.admin_override` |
| `src/components/staffer/StafferMobileForm.tsx:52` | `isAdmin` | `staffer.mobile.admin_override` |
| `src/components/dashboard/PipelineCommercialBloc.tsx:85` | `isAdmin` | `dashboard.commerce.view` |
| `src/hooks/use-opportunites-pipeline.ts:37` | `isAdmin` | `opportunites.read.all` |
| `src/lib/preview-context.tsx:53` | `isAdmin`, `roles` | **garder** — c'est le PreviewRoleProvider, doit lire le rôle réel pour bypass |

### Plan d'exécution L5-B

**Étape 1 — Créer les caps manquantes** (~30min)
- Vérifier table `role_capabilities` quelles caps existent déjà
- Migration SQL si besoin pour : `admin.roadmap.manage`, `heures.analyse.view`, `flotte.trajet.delete`, `affaire.documents.delete`, `fabrication.etape.admin_override`, `staffer.mobile.admin_override`, `opportunites.read.all` (réutiliser existantes quand possible)

**Étape 2 — Migrer les 11 call-sites** (`preview-context.tsx` reste) (~1h30)
- Remplacer `const { isXxx } = useAuth()` par `const canXxx = useCapability("xxx.cap")`
- Adapter le rendu conditionnel

**Étape 3 — Supprimer `RoleGuard.tsx`** (~30min)
- Remplacer ses usages par `<CapabilityGuard>` existant (ou créer si absent)
- Supprimer fichier + test

**Étape 4 — Purger les bools de `auth-context.tsx`** (~30min)
- Garder : `user`, `session`, `roles`, `loading`, `rolesLoaded`, `passwordSetDone/At`, `isInviteStatus`, `profileCompleted`, `signIn/Out/Up`, `refreshRoles`
- Supprimer : `isAdmin`, `isChef`, `isChefGlobal`, `isAdminOrChef`, `isRh`, `isCommercial`, `isBureauEtude`, `isAtelierChef`, `isAtelierMetier`, `isLogistique`, `isPoseur`
- `preview-context.tsx` lit `roles` directement (pas via bool)

**Étape 5 — Règle ESLint anti-régression** (~30min)
```js
// eslint.config.js
"no-restricted-syntax": ["error", {
  selector: "MemberExpression[object.callee.name='useAuth'][property.name=/^is(Admin|Chef|Rh|Commercial|BureauEtude|AtelierChef|AtelierMetier|Logistique|Poseur)/]",
  message: "Bridge auth supprimé — utiliser useCapability(...)"
}]
```

**Étape 6 — Tests**
- Build + typecheck verts
- Exécuter `src/lib/__tests__/auth-flows.test.ts` + `auth-redirect-helpers.test.ts`
- Adapter si nécessaire

---

## L6-A — Fusion home unifiée `/` (5-6h)

### État actuel
- `/dashboard` — admin/chef (widgets équipe)
- `/dashboard-employe` — employe (variante safe)
- `/aujourdhui` — employe (inbox + missions jour, cible login)
- `/ma-semaine` — employe desktop (planning perso, cible login)

### Cible
**Une seule route `/` (`_app.index.tsx`)** rendant un orchestrateur de widgets :

```tsx
function HomePage() {
  return (
    <DashboardLayout>
      <Widget cap="dashboard.commerce.view"><PipelineCommercialBloc /></Widget>
      <Widget cap="dashboard.team.view"><EquipeKpiBloc /></Widget>
      <Widget cap="dashboard.inbox.view"><InboxBloc /></Widget>
      <Widget cap="dashboard.semaine.view"><MaSemaineBloc /></Widget>
      <Widget cap="dashboard.missions.view"><MissionsJourBloc /></Widget>
      {/* etc. */}
    </DashboardLayout>
  );
}
```

`<Widget cap="…">` rend null si la cap n'est pas accordée (zéro fuite RGPD car composant jamais instancié).

### Étapes
1. **Inventaire widgets existants** — lister tous les widgets utilisés par les 4 pages source, définir leur cap
2. **Migration SQL caps widgets** — créer les caps `dashboard.xxx.view`, assigner aux rôles selon matrice actuelle :
   - admin : tout
   - chef_chantier : tout sauf `dashboard.commerce.view` (déjà la règle Core)
   - rh : `dashboard.rh.view`
   - employe : `dashboard.inbox.view`, `dashboard.semaine.view`, `dashboard.missions.view` uniquement
3. **Créer `_app.index.tsx`** orchestrateur
4. **Redirects 301** : `/dashboard`, `/dashboard-employe`, `/aujourdhui`, `/ma-semaine` → `<Navigate to="/" replace />`
5. **Test E2E role-smoke** : vérifier qu'employé sur `/` ne voit aucun widget équipe (DOM inspection)

### Anti-régression RGPD
La règle actuelle "employé ne doit JAMAIS voir agrégat équipe" est garantie au niveau widget (cap), plus au niveau route. Test E2E `e2e/dashboard-rgpd.spec.ts` à créer : login employé → `/` → assert `queryByTestId('widget-equipe')` is null.

---

## L6-B — Fusion `/mes-*` via `?scope=` (4-5h)

### État actuel
6 routes : `/mes-missions`, `/mes-chantiers`, `/mes-heures`, `/mes-contrats`, `/mes-propositions`, `/mes-swaps`

### Cible
6 routes universelles avec query param `?scope=mine|team|all` :
- `/missions?scope=mine|team|all`
- `/chantiers?scope=mine|team|all`
- `/heures?scope=mine|team|all`
- `/contrats?scope=mine|team|all`
- `/propositions?scope=mine|team|all`
- `/swaps?scope=mine|team|all`

### Règles scope
- Validation zod : `scope: fallback(z.enum(["mine","team","all"]), "mine").default("mine")`
- Sélecteur scope visible uniquement si user a cap `xxx.scope.team` ou `xxx.scope.all`
- Sidebar libellés conservés ("Mes heures") mais URL = `/heures?scope=mine`
- RLS Supabase filtre déjà côté DB : si user demande `scope=team` sans droits, requête retourne 0 lignes (pas de fuite)

### Étapes
1. Pour chaque feature, créer la route universelle (copy/paste de `/mes-xxx` + ajout `validateSearch`)
2. Ajouter `<ScopeSelector>` cappé dans le header de page
3. Adapter le hook de fetch pour passer `scope` au server fn
4. Redirects 301 `/mes-xxx` → `/xxx?scope=mine`
5. MAJ sidebar (`AppSidebar.tsx`) avec nouvelles URL + linkOptions

---

## L6-C — Nettoyage routing legacy (2h)

1. Supprimer `src/lib/post-login-routing.ts` (90 lignes)
2. Tous les `navigate({to: ...})` post-login pointent sur `/`
3. Supprimer routes legacy : `_app.dashboard.tsx`, `_app.dashboard-employe.tsx`, `_app.aujourdhui.tsx`, `_app.ma-semaine.tsx`, `_app.mes-*.tsx` (6)
4. MAJ `e2e/helpers/auth.ts` et 4 specs role-smoke (URLs cibles)
5. MAJ memories :
   - `mem://features/route-ma-semaine` → DELETE
   - `mem://features/post-login-routing-module` → DELETE
   - `mem://features/dashboard-role-guard` → UPDATE (cap widget-level, pas route)
   - `mem://constraints/role-routes-bannies` → CREATE (règle Core)
6. MAJ index.md Core : remplacer ligne "Routing post-login" par "Routing post-login : toujours `/`. Widgets gated par cap dans `<DashboardLayout>`."

---

## Risques identifiés

1. **Mapping bool → cap imprécis (L5-B)** : si `isAdmin` cachait en réalité 2 intentions différentes, je peux régresser. Mitigation : revue PR par lot de 3-4 fichiers.
2. **Widget non-cappé sur `/` (L6-A)** : fuite RGPD. Mitigation : test E2E par rôle + lint custom (futur).
3. **Bookmarks utilisateurs cassés** : redirects 301 dans L6-C les rattrapent.
4. **Code-splitting du orchestrateur `/` (L6-A)** : bundle plus gros pour employés qui n'ont que 3 widgets. Mitigation : lazy() chaque widget.

---

## Prochaine étape demandée

Valider le **mapping bool → cap** dans la table ci-dessus avant migration. Si OK, je commence par L5-B étape 1 (vérification caps existantes en DB).
