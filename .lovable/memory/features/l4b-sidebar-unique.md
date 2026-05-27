---
name: L4b sidebar unique capability-driven
description: AppSidebar refondu en composant responsive unique, gating 100% via useCapabilitiesSet, "Aujourd'hui" toujours visible
type: feature
---
v0.48 Lot L4b (27 mai 2026). Refonte `src/components/AppSidebar.tsx` :
- UN SEUL composant pour tous viewports + tous rôles. Plus de branche `employe` vs `chef/admin`.
- Plus de flag `sidebar_capability_v1` : cap-gating toujours actif.
- 7 sections : Mon poste / Pilotage / Production / Logistique / Équipes / Module RH / Admin.
- Item "Aujourd'hui" → aucune cap requise (page d'accueil universelle).
- Section visible si ≥1 item visible.
- Pendant `capsLoading` : affichage des seuls items sans cap (Aujourd'hui) pour éviter le flash.
- Drawer mobile auto via shadcn `Sidebar collapsible="icon"` + `SidebarTrigger` dans AppLayout header.
- `MobileBottomNav` / `ChefMobileBottomNav` ne sont PAS rendus par `_app.tsx` (uniquement dans /mobile/* legacy hors scope L4b).
- Logo cliquable → `/aujourdhui`.
- Footer : email + tous les rôles concaténés (`+`) + bouton déconnexion.

Suppression définitive composants legacy + routes /mobile/* → L4c/L4d.
