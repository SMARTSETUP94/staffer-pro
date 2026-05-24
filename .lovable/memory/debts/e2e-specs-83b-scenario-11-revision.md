---
name: Specs E2E 8.3b — scénario #11 à réviser + #11bis à ajouter
description: 13 scénarios au lieu de 12 pour les specs E2E 8.3b en retard, suite au hotfix mutations sur draft
type: feature
---
Les 12 specs E2E du Lot 8.3b (toujours en retard, à livrer en parallèle du Lot 8.4) doivent intégrer la révision suivante post-hotfix :

**Scénario #11 (réécrire)** — cas `no_plan` pur :
- admin | Objet sans aucun plan (ni draft ni published) | Bandeau gris « aucun plan — créez un plan brouillon ou publié », boutons +Personne / Auto-remplir DISABLED + tooltip, étapes Kanban OK

**Scénario #11bis (NEW)** — cas `draft` :
- admin | Objet avec plan staffing en `draft` | Bandeau ambre « Plan brouillon — les assignations seront conservées même si le plan est republié (manual_assignment_origin protège contre PRESENCE_MISMATCH) », boutons ENABLED, assignation possible via AddPersonneDialog, vérif DB que `staffing_plan_assignment.manual_assignment_origin = 'fiche_objet'`

**Total** : 13 scénarios pour `e2e/capabilities/objet-equipe-mutations.*.spec.ts`.
