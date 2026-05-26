---
name: AppRole TS désynchro DB (résolu v0.49 Batch 9.7)
description: Audit 25/05/26 — AppRole front ne typait que 5 rôles vs 11 en DB. Corrigé.
type: constraint
---

**Audit indépendant 25/05/26** : `AppRole` (src/lib/auth-context.tsx + src/lib/labels.ts + src/lib/email-templates/invitation.ts) ne couvrait que `admin | chef_chantier | chef_metier_scoped | employe | rh`. Les 6 rôles Sprint A (`commercial`, `bureau_etude`, `atelier_chef`, `atelier_metier`, `logistique`, `poseur`) existaient dans l'enum DB `app_role` mais étaient invisibles côté front → tout user porteur d'un de ces rôles tombait en branche fallback "employé".

**Résolu v0.49 Batch 9.7** :
- `AppRole` étendu aux 11 rôles dans les 3 sources (auth-context, labels, invitation)
- `ROLE_PRESETS` (dashboard/types.ts) complété avec presets minimaux par rôle
- 6 booléens ajoutés au `AuthContextValue` : `isCommercial`, `isBureauEtude`, `isAtelierChef`, `isAtelierMetier`, `isLogistique`, `isPoseur`
- `roleLabel()` + `ROLE_LABEL` (parametres.utilisateurs) + `rolesToLabel()` invitation enrichis

**Why :** garder ces 3 sources de vérité (auth-context.AppRole, labels.AppRole, invitation.InvitationRoleLabel) synchro avec l'enum DB. Si on ajoute un rôle en DB → mettre à jour les 3 + ROLE_PRESETS dans la même livraison.
