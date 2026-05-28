---
name: L5-B bridge auth-context purgé
description: Bridge useAuth() ne contient plus aucun booléen de rôle (isAdmin/isChef/...) + ESLint anti-régression actif
type: constraint
---

## État (28 mai 2026)

`src/lib/auth-context.tsx` n'expose que les 14 champs essentiels :
`user, session, roles, loading, rolesLoaded, passwordSetDone, passwordSetAt,
isInviteStatus, profileCompleted, signIn, signInWithMagicLink, signUp,
signOut, refreshRoles`.

**Aucun booléen dérivé de rôle.** Les ~12 bridges historiques (`isAdmin`,
`isChef`, `isChefAny`, `isChefGlobal`, `isAdminOrChef`, `isRh`,
`isCommercial`, `isBureauEtude`, `isAtelierChef`, `isAtelierMetier`,
`isLogistique`, `isPoseur`, `isChefMetierScoped`) ont été retirés
progressivement en L3b → L5-A. L5-B = audit final + verrouillage.

## Règle ESLint anti-régression

`eslint.config.js` utilise `no-restricted-syntax` avec deux sélecteurs AST
par nom interdit :

- `VariableDeclarator[init.callee.name='useAuth'] ObjectPattern > Property[key.name='X']`
- `MemberExpression[object.callee.name='useAuth'][property.name='X']`

Message : « L5-B: ne pas réintroduire de booléen de rôle sur useAuth().
Utiliser useCapability('xxx'). »

## Exceptions

`src/lib/auth-context.tsx`, `src/lib/preview-context.tsx`, tous les
`__tests__/`, `*.test.{ts,tsx}` et `src/routes/roadmap.tsx` (doc historique).

## Comment ajouter un nouveau rôle

Ne JAMAIS rajouter un `isXxx` sur le contexte. Workflow :

1. Ajouter le rôle dans l'enum DB `app_role` via migration.
2. Ajouter le rôle dans `src/lib/labels.ts` (USER_ROLE_LABELS).
3. Ajouter les capabilities du rôle dans `role_capabilities` (DB).
4. Consommer côté UI via `useCapability("section.xxx")` ou
   `<CapabilityGuard cap="…">`.

## Smoke audit

```bash
grep -rnE "const\s*\{[^}]*\b(isAdmin|isChef|isChefAny|isRh|isCommercial|isBureauEtude|isAtelierChef|isAtelierMetier|isLogistique|isPoseur)\b[^}]*\}\s*=\s*useAuth" --include="*.tsx" --include="*.ts" src/
grep -rnE "useAuth\(\)\.(isAdmin|isChef|isRh|isCommercial|isBureauEtude|isAtelierChef|isAtelierMetier|isLogistique|isPoseur)" --include="*.tsx" --include="*.ts" src/
```

Doit retourner 0 ligne hors exceptions (28 mai 2026 : seul un commentaire
docstring dans `use-audit-auth.ts` matche, sans impact).

## Dette reportée

- **Seed `supabase/seed.test.sql` + 11 specs E2E par rôle** : reportés, la
  couverture actuelle (role-smoke par rôle dans `e2e/admin/`, `e2e/chef/`,
  `e2e/employe-desktop/`, `e2e/employe-mobile/`, + sidebar-capability et
  capabilities/admin-caps par rôle) couvre les 7 rôles principaux. Les 4
  rôles non encore testés isolément (`rh`, `bureau_etude`, `atelier_metier`,
  `logistique`) sont couverts indirectement par la matrice sidebar.
