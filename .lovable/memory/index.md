# Memory: index.md
Updated: now

# Project Memory

## Core
App planning chantiers Setup Paris. FR language UI.
Supabase Cloud backend. TanStack Start + Tailwind v4.
3 rôles : admin (full), chef_chantier (CRUD sauf paramétrage), employe (ses heures uniquement).
8 métiers : construction, métallerie, peinture, numérique, tapisserie, machiniste, logistique, suivi_projet.

## Roadmap
1. ✅ Étapes 1-3 (CRUD, RBAC, imports CSV employés + Excel devis basique)
2. ✅ Étape 4 — [Planning 3 vues](mem://features/planning-views)
3. ✅ Refonte [/devis/import en formulaire de validation](mem://features/devis-import-validation)
4. ✅ v0.18.1 — [Flotte + livreur + lieux + export sous-traitance](mem://features/v0.18.1-flotte-livreur-export)

## Memories
- [Planning 3 vues](mem://features/planning-views) — CDI / Intérim / Synthèse chantier, tabs, sélecteur semaine, sidebar heures restantes
- [Refonte /devis/import](mem://features/devis-import-validation) — formulaire 2 sections pré-rempli, dates montage/démontage, import atomique via RPC `import_devis_atomique`
- [v0.18.1 Flotte + livreur + export sous-traitance](mem://features/v0.18.1-flotte-livreur-export) — Autorisation PL actionnable, lieux ATELIER/STOCKAGE, suggestions trajets auto, export CSV+XLSX trajets sous-traités, polish Kanban
