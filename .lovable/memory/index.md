# Project Memory

## Core
App planning chantiers Setup Paris. FR language UI.
Supabase Cloud backend. TanStack Start + Tailwind v4.
3 rôles : admin (full), chef_chantier (CRUD sauf paramétrage), employe (ses heures uniquement).
8 métiers : construction, métallerie, peinture, numérique, tapisserie, machiniste, logistique, suivi_projet.
Vocabulaire UI : "Chantiers" (route /affaires), "Véhicules" (route /flotte). RBAC sidebar basé sur effectiveRole.
Sidebar 5 sections : Pilotage / Chantiers / Équipes / Véhicules / Administration (admin only).

## Memories
- [Planning 3 vues](mem://features/planning-views) — CDI / Intérim / Synthèse chantier, tabs, sélecteur semaine, sidebar heures restantes
- [Refonte /devis/import](mem://features/devis-import-validation) — formulaire 2 sections pré-rempli, dates montage/démontage, import atomique via RPC `import_devis_atomique`
