---
name: L2 scope UI à brancher dans /admin/permissions
description: La colonne scope (all/team/metier/own/none) est seedée en DB mais la page admin ne propose qu'un toggle granted, pas de dropdown scope. À ajouter en L3 ou polish.
type: feature
---
La migration L2 a ajouté `role_capabilities.scope text NOT NULL DEFAULT 'all'`
avec CHECK (all|team|metier|own|none) et les fonctions `user_has_cap` /
`user_cap_scope`. La page `/admin/permissions` affiche encore uniquement la
case à cocher `granted` ; le scope est invisible et non-éditable.

**À faire en L3 (ou polish)** :
- Ajouter un Select compact (all/team/métier/own) à côté du Checkbox dans
  `RoleCapsCategoryRows`.
- Étendre la mutation upsert pour passer `scope`.
- Mettre à jour `useCapability` / `requireCapability` pour exposer le scope
  via `useCapabilityScope(key)` quand L3 commencera à consommer les scopes.

Pas bloquant pour L2 : tous les rôles seedés ont des scopes pertinents en
DB, juste invisibles dans l'UI admin.
