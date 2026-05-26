---
name: Users multi-select /parametres/utilisateurs
description: Page /parametres/utilisateurs en UI mono-select 3 rôles alors que user_roles est multi + 11 rôles existent. Verrou critique résolu par L3.0.
type: debt
---

## Contexte

Audit 26/05/26 révèle un écart béant :
- `user_roles` est conçue pour le multi (1..N rôles par user)
- UI `/parametres/utilisateurs` n'affiche que 3 options (admin / chef_chantier / employe)
- `updateUserRole()` fait DELETE ALL + INSERT 1 (perd les rôles multiples)
- 6 rôles Sprint A invisibles dans le dropdown (commercial, BE, atelier_chef, atelier_metier, logistique, poseur) + chef_pose

## Impact
- Gabin ne peut pas assigner les nouveaux rôles via UI
- Double-travail : admin doit aller en DB ou passer par `/admin/permissions`
- Risque incohérence : utilisateur avec rôle DB non affiché dans UI

## Résolution
Lot L3.0 : composant multi-select + transaction atomique + debug caps.

## Non-régression
- Ne PAS toucher à `/parametres/roles-fabrication` (décision Option A : garde-fou double-filtre uniquement)
