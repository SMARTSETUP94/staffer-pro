---
name: Vue déploiement logistique + opportunités
description: Flag deploiement_logistique_opps — menu réduit à la logistique, pipeline opportunités, chantiers, demandes clients. Prend le pas sur deploiement_charges_affaires.
type: feature
---

## Feature flag `deploiement_logistique_opps`
- Activé globalement le 15 oct. 2026 (déploiement STAFFING limité logistique + opportunités).
- `deploiement_charges_affaires` repassé à `enabled_globally = false` le même jour.
- Dans `AppSidebar.tsx` : `applyLogistiqueOppsMode()` whitelist URL = `/`, `/affaires`, `/opportunites`, `/demandes-clients`, `/flotte`, `/logistique/vehicules-planning`, `/export/demandes-devis` + section Admin conservée.
- Priorité des modes de menu : `deploiement_logistique_opps` > `deploiement_charges_affaires` > `mode_simplifie_managers`. Aucun blocage d'URL (masquage menu uniquement).
