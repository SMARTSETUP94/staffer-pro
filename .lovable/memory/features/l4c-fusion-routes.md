---
name: L4c fusion routes mobile
description: Fusion des 20 routes /mobile/* legacy dans l'arborescence principale, plus de dualité mobile/desktop (v0.50)
type: feature
---

## Périmètre v0.50 (L4c)

Suppression définitive de la dualité mobile/desktop. UN SEUL composant nav
(AppSidebar drawer L4b) + UNE SEULE arborescence de routes.

## Routes fusionnées (18 redirects)

| Legacy `/mobile/*` | Cible principale |
|---|---|
| `/mobile/aujourdhui` | `/aujourdhui` |
| `/mobile/mes-missions` | `/mes-missions` (nouveau `_app.mes-missions.tsx`) |
| `/mobile/equipe-chantiers` | `/mes-chantiers` (nouveau `_app.mes-chantiers.tsx`) |
| `/mobile/mission/$id/$phase` | `/missions/$id/$phase` (nouveau `_app.missions.$affaireId.$phase.tsx`) |
| `/mobile/absences` | `/absences` |
| `/mobile/chef/a-valider` | `/aujourdhui` |
| `/mobile/chef/affaires/$id` | `/affaires/$id` |
| `/mobile/chef/atelier` | `/charge-atelier` |
| `/mobile/chef/contrats` | `/rh/contrats` |
| `/mobile/chef/dashboard` | `/aujourdhui` |
| `/mobile/chef/equipe` | `/employes` |
| `/mobile/chef/` | `/aujourdhui` |
| `/mobile/chef/moi` | `/aujourdhui` (voir dette `profil-route-manquante`) |
| `/mobile/chef/planning` | `/planning` |
| `/mobile/contrats` | `/mes-contrats` |
| `/mobile/heures` | `/mes-heures` |
| `/mobile/profil` | `/aujourdhui` (voir dette `profil-route-manquante`) |
| `/mobile/propositions` | `/mes-propositions` |
| `/mobile/swaps` | `/mes-swaps` |

## Whitelist EMPLOYE_DESKTOP_ALLOWED

Ajoutée dans `src/routes/_app.tsx` : `/mes-missions`, `/mes-chantiers`,
`/mes-contrats`, `/missions` (anti-régression : employé desktop garde l'accès
RGPD-safe à ses propres données).

## Composants legacy masqués (pas supprimés — L4d)

- `MobileBottomNav` → `return null`
- `ChefMobileBottomNav` → `return null`
- `ChefMobileHeader` → conservé mais liens `to="/mobile/chef/moi"` repointés sur `/aujourdhui`

## AppSidebar (L4b)

Liens `to="/mobile/mes-missions"` et `to="/mobile/equipe-chantiers"`
remplacés par `/mes-missions` et `/mes-chantiers` (plus de 301 indirect).

## Critère de complétion validé

```bash
grep -rn "to=['\"]/mobile/" --include="*.tsx" src/ \
  | grep -v "src/routes/mobile\." | wc -l
# = 0
```

## Tests E2E

`e2e/routes-fusion/redirects-mobile.spec.ts` — 18 redirects paramétrés + 2
tests fonctionnels (mes-missions + mes-chantiers accessibles employé desktop).
