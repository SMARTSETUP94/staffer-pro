---
name: vocabulaire-roles-centralise
description: Source unique des libellés rôles via src/lib/labels.ts (Lot 7.1 + 7.0d extension)
type: constraint
---

Tous les libellés UI relatifs aux rôles passent par `src/lib/labels.ts`.
JAMAIS de string dur "Chef de chantier" / "Chef d'équipe" dans les composants.

Helpers exportés :
- `roleLabel(role)` — app_role → libellé UI (chef_chantier → « Chef d'équipe »)
- `previewRoleLabel(role)` — preview-role → libellé UI
- `affaireRoleLabel(role)` — rôle métier sur affaire (chef_chantier reste « Chef chantier » → rôle terrain, pas applicatif)
- `USER_ROLE_OPTIONS` — options pour les Select admin

Règle : l'enum DB `app_role` reste intouchable. Le rename n'est QUE visuel.

**Why**: éviter la confusion utilisateur entre rôle applicatif (chef d'équipe = autorisations CRUD) et rôle terrain (chef chantier = personne nominativement responsable d'un chantier). Permet aussi un rollback rapide du vocab via édition d'un seul fichier.

**How to apply**:
- Nouveau composant qui affiche un rôle → import depuis `@/lib/labels`.
- Nouveau Select de rôle admin → utiliser `USER_ROLE_OPTIONS`.
- Tests : `src/lib/__tests__/labels.test.ts` couvre les 4 helpers (10 tests).
