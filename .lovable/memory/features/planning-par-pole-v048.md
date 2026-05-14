---
name: Planning par pôle consolidé v0.48
description: 8e onglet /planning matrice métiers × jours — RPC staffing_par_pole_jours, popover hover vignettes, badge PRÉV pour 9XXX, teinte ambrée 9XXX sur Par chantier
type: feature
---
v0.48 RÉVISÉ (14 mai 2026) — onglet "Par pôle" entre Par objet et Budget. Scope simplifié drastiquement vs version initiale.

## Vue Par pôle (nouvelle)
Structure identique à "Par chantier" mais axe lignes inversé :
- LIGNES = métiers (ordre `metiers.ordre`).
- COLONNES = jours de la semaine (lun→ven, +sam/dim si toggle global `showWeekend`).
- CELLULE = badge rond avec nb personnes DISTINCT staffées ce métier ce jour ; vide (`·`) si 0.
- HOVER cellule = Popover liste des personnes (vignette initiales + `Prénom N.`) avec `numéro chantier` + nom en dessous. Personnes sur 9XXX → badge ambré `PRÉV` + initiales sur fond ambre.

RPC : `staffing_par_pole_jours(p_periode_debut, p_periode_fin, p_inclure_opportunites, p_filtres_metier_ids, p_filtres_statut)` SECURITY INVOKER, RLS héritée. Retourne 1 row par (metier, date) avec `nb_personnes` (DISTINCT employe_id) + `personnes` JSONB array `[{employe_id, prenom, nom, chantier_id, chantier_numero, chantier_nom, est_opportunite}]`. Métier = `COALESCE(a.metier_id, e.metier_principal_id)`. Si `p_inclure_opportunites=false` exclut `numero LIKE '9%'` AVANT agrégation.

Filtres branchés depuis l'état global du planning : `weekStart/weekEnd`, `showWeekend`, `includeOpportunites`, `filterMetierNum` (Set<number>).

PAS dans le scope v0.48 : sticky header capacités, sticky footer total/%, KPI alertes, toggle Compact/Détaillé, export Excel, drilldown Dialog (popover hover suffit). RPC `capacite_par_metier` reste en DB pour usage futur mais non branchée.

## Teinte ambrée 9XXX sur Par chantier (existant)
Dans `PlanningParChantier.tsx`, les `<td>` staffing des lignes dont `affaire.numero.startsWith('9')` reçoivent `bg-amber-50/40 dark:bg-amber-950/20` + attribut `data-opportunite="true"` pour tests E2E. Vignettes employés inchangées.

## Fichiers
- `src/hooks/use-planning-par-pole.ts` — hook RPC.
- `src/components/planning/par-pole/StaffingParPole.tsx` — matrice + popover + vignette.
- `src/routes/_app.planning.tsx` — onglet `parpole` 8e position.
- Migration : `staffing_par_pole_jours` (la précédente `staffing_par_pole_consolide` reste en DB inutilisée).
