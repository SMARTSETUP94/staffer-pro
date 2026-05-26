---
name: Lot L3 — Refonte permissions (user_has_cap)
description: Suite L2 : remplacer isAdmin/isChef par user_has_cap() + user_cap_scope. Audit terminé 26/05. 4 sous-lots définis.
type: feature
---

## Contexte

Lot L2 a seedé la matrice 59 capabilities × 11 rôles + helpers SQL `user_has_cap()` / `user_cap_scope()`.
Lot L3 consomme cette matrice dans le code front et back.

## Sous-lots

### L3.0 `/parametres/utilisateurs` — multi-select 11 rôles (~4h)
- Composant RoleMultiSelect (checkboxes groupées par catégorie : Direction/Commerce/Production/Terrain/Support)
- `updateUserRoles()` transactionnel : DELETE roles absents + INSERT ON CONFLICT DO NOTHING
- Debug panel "Caps effectives" : appel `user_has_cap()` pour chaque cap du catalogue, affichage union résolue
- Garder `requireCapability('admin.users.manage')` au lieu de `isAdmin` JS

### L3.1 `/parametres/roles-fabrication` — double-filtre (~1h)
- Eligibles = profils ayant l'étape flag ET capability `casting.edit_phase_fabrication`
- Garde-fou incohérence : toast si un profil a le flag mais pas la cap

### L3.2-L3.5 — Refacto isAdmin/isChef (~25-35h)
- Remplacer `isAdmin()` / `isChef()` / `isAdminOrChef()` par `user_has_cap('cap.key')` ou `requireCapability` middleware
- 200+ call sites à traiter par vagues (dashboard → pages → composants → hooks)
- Tests E2E permissions par rôle (L5)

## Dépendances
- Lot L2 livré (helpers SQL + catalogue front)
- Spec L1 validée Gabin (matrice modifiable admin, rôle chef_pose, ordre lots)

## Audit 26/05/26
- `/parametres/utilisateurs` : UI mono-select 3 rôles vs DB multi 11 → IN scope L3.0
- `/parametres/roles-fabrication` : Option A retenue (garder page + double-filtre) → IN scope L3.1
- Estimation revue : 15h → 30-40h total
