---
name: L4d cleanup final
description: Suppression définitive 20 stubs mobile + MobileBottomNav + mobile-chef + ViewAsSwitcher + effIsMobile + checkMobileChefAccessForAdmin. Migration /parametres/utilisateurs → /admin/utilisateurs (stub redirect 301).
type: feature
---
v0.50 (27 mai 2026) — L4d clôt la refonte UX/nav L4.

Supprimé :
- 20 routes `src/routes/mobile.*.tsx` (étaient des stubs redirect L4c)
- `src/components/MobileBottomNav.tsx`
- `src/components/mobile-chef/` (ChefMobileBottomNav + ChefMobileHeader)
- `src/components/ViewAsSwitcher.tsx`
- Champ `effIsMobile` de `PreviewContext` + import `useIsMobile`
- `checkMobileChefAccessForAdmin` de `post-login-routing.ts`
- `PostLoginCtx` interface (resolvePostLoginTarget() ne prend plus d'argument)

Migré :
- `/parametres/utilisateurs` → `/admin/utilisateurs` (stub redirect 301 conservé)
- AppSidebar lien Utilisateurs, CommandPalette, IncidentsTab tous mis à jour
- CommandPalette `/mobile/heures` → `/mes-heures`, `/mobile/profil` → `/aujourdhui`
- auth.set-password.tsx → `/aujourdhui` pour tous les rôles

Conservé (à supprimer en L5) :
- `effIsAdmin / effIsChef / effIsAdminOrChef` du PreviewContext
- Types `PreviewRole = chef_mobile | employe_mobile` (mode preview admin, plus de UI déclencheur)
- `chef_metier_scoped` role
