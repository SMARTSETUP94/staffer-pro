---
name: Quick wins v0.20.1
description: 4 phases livrées — prefill TrajetDialog, indexes perf, React Query cache useObjetsAffaireLight, notif CA prête à livrer
type: feature
---

# v0.20.1 — Quick wins (livré)

## Phase 1 — Prefill bandeau « Prête à livrer »
- Bouton « Demander trajet sous-traité » de `/affaires/$id/fabrication` ouvre maintenant `TrajetDialog` (au lieu de naviguer vers `/export/demandes-devis`).
- Prefill : `adresse_depart=atelier (useLieux)`, `adresse_arrivee=affaire.lieu`, `default_date=date_montage - 1j`, `categorie=pose`, `affaire_id` pré-sélectionnée. Sous-traitance auto-activée (default `defaultVehiculeId=null`).
- Fichier : `src/routes/_app.affaires.$affaireId.fabrication.tsx`.

## Phase 2 — Indexes composites
Migration `20260505*`: 
- `idx_fab_etapes_objet_statut (objet_id, statut)`
- `idx_fab_etapes_assignee_statut (assignee_id, statut) WHERE assignee_id IS NOT NULL`
- `idx_staffing_plan_step_plan_metier (plan_id, metier_id)`

## Phase 3 — React Query partagée
- `useObjetsAffaireLight` migré : `useQuery({ queryKey: ['objets-affaire-light', affaireId], staleTime: 30_000 })`. Plusieurs consommateurs partagent la cache → fin du N+1.

## Phase 4 — Notif CA
- `notify_affaire_pret_livraison` boucle sur `[chef_projet_id, charge_affaires_id]` (déduplique). Garde-fou 24h conservé.

## Tests
- 1440/1440 Vitest verts.
- Phase 5 (suggestion type véhicule par volume) reportée — pas de champ `volume` sur `fabrication_objets`.
