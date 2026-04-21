# Project Memory

## Core
App planning chantiers Setup Paris. FR language UI.
Supabase Cloud backend. TanStack Start + Tailwind v4.
3 rôles : admin (full), chef_chantier (CRUD sauf paramétrage), employe (ses heures uniquement).
8 métiers : construction, métallerie, peinture, numérique, tapisserie, machiniste, logistique, suivi_projet.
Brand Setup : indigo `#2A2A8C` (--primary), cream `#F7F4EF`, ink `#0A0A0B`. Voir `docs/DESIGN_TOKENS.md`.
Sidebar 5 sections : Pilotage / Chantiers / Équipes / Véhicules / Administration (admin only).
Vocabulaire UI : "Chantiers" (route /affaires), "Véhicules" (route /flotte). Imports unifiés sur /imports → 3 onglets.
Mobile breakpoint : <1024px (lg) → sidebar drawer Sheet ; ≥1024px → sidebar persistante.

## Roadmap
1. ✅ Étapes 1-3 (CRUD, RBAC, imports CSV employés + Excel devis basique)
2. ✅ Étape 4 — [Planning 3 vues](mem://features/planning-views)
3. ✅ Refonte [/devis/import en formulaire de validation](mem://features/devis-import-validation)
4. ✅ v0.13 — IA & UX Refactor : sidebar 5 sections, RBAC strict, Ctrl+K, design tokens
5. ✅ v0.14 — [Feedback chefs d'équipe](mem://features/feedback-module) : bouton flottant, capture, page admin, email Resend

## Memories
- [Planning 3 vues](mem://features/planning-views) — CDI / Intérim / Synthèse chantier
- [Refonte /devis/import](mem://features/devis-import-validation) — formulaire 2 sections, RPC `import_devis_atomique`
- [Module Feedback v0.14](mem://features/feedback-module) — table `feedbacks`, bucket privé, edge function `notify-feedback-email`
