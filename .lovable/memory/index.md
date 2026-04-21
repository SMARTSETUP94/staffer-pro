# Memory: index.md
Updated: now

# Project Memory

## Core
App planning chantiers Setup Paris. FR language UI.
Supabase Cloud backend. TanStack Start + Tailwind v4.
3 rôles : admin (full), chef_chantier (CRUD sauf paramétrage), employe (ses heures uniquement).
8 métiers : construction, métallerie, peinture, numérique, tapisserie, machiniste, logistique, suivi_projet.
Emails via Resend gateway, from onboarding@setup.paris (DNS verified). Templates branded cream/ink/indigo.
Auth : chef_chantier/admin DOIVENT poser un password (page /auth/set-password). Employés peuvent skip et utiliser magic link uniquement. Tracker = profiles.password_set_done.
Module feedback : bouton flottant 💬 visible uniquement chef/admin (RLS), capture via html-to-image, bucket privé feedback-screenshots scopé par auth.uid(), page admin /admin/feedback.

## Roadmap
1. ✅ Étapes 1-3 (CRUD, RBAC, imports CSV employés + Excel devis basique)
2. ✅ Étape 4 — [Planning 3 vues](mem://features/planning-views)
3. ✅ Refonte [/devis/import en formulaire de validation](mem://features/devis-import-validation)
4. ✅ v0.11 — Email stack production-ready + invitations en lot
5. ✅ v0.12 — [Auth flow différencié par rôle + reset password](mem://features/auth-flow-roles)
6. ✅ v0.13 — Module signalements (feedback chef↔admin) + roadmap "À venir" enrichie ~30 features

## Memories
- [Planning 3 vues](mem://features/planning-views) — CDI / Intérim / Synthèse chantier, tabs, sélecteur semaine, sidebar heures restantes
- [Refonte /devis/import](mem://features/devis-import-validation) — formulaire 2 sections pré-rempli, dates montage/démontage, import atomique via RPC `import_devis_atomique`
- [Auth flow par rôle](mem://features/auth-flow-roles) — /auth/set-password obligatoire chef/admin, optionnel employé. /auth/forgot-password + /auth/reset-password via Resend custom.
