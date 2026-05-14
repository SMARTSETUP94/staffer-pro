---
name: Planning par pôle consolidé v0.48
description: 8e onglet /planning matrice chantier×métier — RPC staffing_par_pole_consolide + capacite_par_metier, drilldown Dialog, export xlsx
type: feature
---
v0.48 (14 mai 2026) — onglet "Par pôle" entre Par objet et Budget.

RPC SECURITY INVOKER (RLS héritée des affaires) :
- `staffing_par_pole_consolide(debut, fin, inclure_opp, chantier_ids[], metier_ids[], statut[])` → 1 ligne par cellule (chantier × métier) avec nb_personnes (DISTINCT employe_id), total_demi_jours (COUNT) et total_heures (×4). Source = `assignations`. Métier = COALESCE(a.metier_id, e.metier_principal_id). Exclut 9XXX si inclure_opp=false.
- `capacite_par_metier()` → capacite_cdi_cdd / capacite_interim / capacite_totale par métier (employes actif=true AND non_staffing=false).

UI : `src/components/planning/par-pole/` — `StaffingParPole.tsx` (matrice + sticky header capacités + sticky footer total/% colorisé vert/ambre/rouge), `PoleDrilldownDialog.tsx` (liste personnes au clic cellule), `pole-export-excel.ts` (xlsx-js-style lazy : Feuille 1 matrice + Feuille 2 détail par personne).

Chantiers 9XXX : `opacity-60` + bordures `dashed` + badge `PRÉV`. Toggle Compact/Détaillé (compact = "Xp" seul, détaillé = "Xp" + heures). Filtres : réutilise `includeOpportunites` global du planning + `filterMetierNum` (Set<number>).

Hook : `src/hooks/use-planning-par-pole.ts` (Promise.all des 2 RPC).
