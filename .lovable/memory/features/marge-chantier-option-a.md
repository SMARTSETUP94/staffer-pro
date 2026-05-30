---
name: Marge chantier Option A standalone
description: Outil interne d'analyse de marge par chantier hébergé dans /admin/marge-chantier, 100% localStorage, 8 onglets, zéro bridge Supabase (Phase 1)
type: feature
---
30 mai 2026 — Livraison Option A.

## Périmètre livré
- Route admin-only : `/admin/marge-chantier` (cap `section.admin`).
- Composant racine : `src/components/marge-chantier/MargeChantierApp.tsx` (8 onglets : Base RH, Référentiels, Registre devis, Devis, Heures, Synthèse chantiers, Marge par personne, Performance).
- Moteur de calcul : `src/components/marge-chantier/engine.ts` — **copié tel quel depuis le repo de Gabin, AUCUNE modification logique autorisée**.
- Persistance : `localStorage` clé `margeChantierApp_v1_<userId>` (isolation par admin).
- Imports : `file-readers.ts` (.xlsx via xlsx-js-style + .csv Windows-1252 pour Progbat).
- Sauvegarde manuelle : export/import JSON (`Download` / `Upload`).
- Toggle Real / Pondéré (mode global de calcul des marges).
- Thème sombre forcé (`bg-[#0f172a]`) sur cette page uniquement.
- Sidebar : item "Marges chantiers" (icon `TrendingUp`) section Admin.

## Tests E2E
- `e2e/admin/marge-chantier.admin.spec.ts` — admin voit les 8 onglets.
- `e2e/admin/marge-chantier.commercial.spec.ts` — commercial redirigé (anti-fuite).

## Phases suivantes (différées, voir mémoires dédiées)
- Phase 2 : bridge employés Supabase → `mem://features/marge-chantier-phase-2-bridge-employes`
- Phase 3 : bridge devis + affaires → `mem://features/marge-chantier-phase-3-bridge-devis`
- Phase 4 : bridge heures_saisies → `mem://features/marge-chantier-phase-4-bridge-heures`
- Phase 5 : persistance serveur cross-user → `mem://features/marge-chantier-phase-5-persistance-serveur`

## Contraintes critiques
- **NE JAMAIS** modifier `engine.ts` sans validation Gabin (équivalence numérique stricte requise).
- Données = localStorage uniquement → pas de partage entre admins, pas de backup serveur. Acceptable Phase 1, à lever Phase 5.
- Imports CSV Progbat encodés Windows-1252 (préserver virgules décimales FR).
