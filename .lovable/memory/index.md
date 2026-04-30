# Project Memory

## Core
App planning chantiers Setup Paris. FR language UI.
Supabase Cloud backend. TanStack Start + Tailwind v4.
3 rôles : admin (full), chef_chantier (CRUD sauf paramétrage), employe (ses heures uniquement).
8 métiers : construction, métallerie, peinture, numérique, tapisserie, machiniste, logistique, suivi_projet.
5 typologies affaires (dérivées de numero) : non_operationnel(1XXX/3XXX), montage_demontage(4XXX), fabrication(5XXX), stockage(2XXXX), prototype(9XXX).
JAMAIS REVOKE EXECUTE sur les 7 helpers RLS SECURITY DEFINER (is_chef_or_admin, is_admin, has_role, user_has_affaire_access, is_devis_termine, can_saisie_on_affaire, user_is_mentioned_on_affaire) — voir mem://constraints/rls-helpers-execute-grant.
Dashboard widgets bornés par rôle effectif (whitelist) — admin: tout, chef: pas commerce, employe: que perso. Voir mem://features/dashboard-role-guard.
Routing post-login : admin/chef → /dashboard, employé desktop → /ma-semaine (PAS /dashboard pour anti-fuite RGPD), preview mobile → /mobile/aujourdhui. Voir mem://features/route-ma-semaine.
auth-context onAuthStateChange : reload rôles UNIQUEMENT si userId change (pas TOKEN_REFRESHED) sinon AppGuard démonte Outlet → modales fermées au changement d'onglet. Voir mem://constraints/auth-context-tab-refocus.
Compteurs typologie : utiliser countActiveAffairesByTypologie (exclut terminé/annulé/démontage passé). Voir mem://features/typologie-active-counts.
Imports : devis_imports a UNIQUE INDEX sur fichier_hash (anti-doublon). opportunites_imports non. Voir mem://features/data-integrity-unique-indexes.

## Roadmap
1. ✅ v0.27.0 → v0.29.2 (voir historique précédent)
2. ✅ v0.29.3 — fusion Audit Auth + Incident Auth (4 onglets, /incident-auth redirige) + Export Excel Planning sur CDI/Intérim/Budget (981 tests verts, +7)
3. ✅ v0.30.0 — Sprint dette J1 : audit helpers RLS confirmé OK + catégorisation 48 SECURITY DEFINER non-RLS + doc UNIQUE indexes imports + sync mem (DOC-H1, SEC-H1, DATA-M1)

## Memories
- [Planning 3 vues](mem://features/planning-views) — CDI / Intérim / Synthèse chantier
- [Refonte /devis/import](mem://features/devis-import-validation) — LIVRÉE
- [Filtre typologie propagation](mem://features/typologie-propagation)
- [Assignation ↔ Objets fab](mem://features/assignation-objets) — v0.25
- [Planning par objet](mem://features/planning-par-objet) — v0.26
- [Tests E2E objets + récap](mem://features/tests-e2e-objet-planning)
- [Édition groupée cellule](mem://features/cell-edit-dialog) — v0.27
- [Helpers RLS protégés](mem://constraints/rls-helpers-execute-grant) — audit v0.30.0 ✅ pas de régression
- [SECURITY DEFINER non-RLS catégorisés](mem://constraints/security-definer-non-rls) — v0.30.0
- [UNIQUE indexes imports](mem://features/data-integrity-unique-indexes) — v0.30.0
- [Dashboard role guard](mem://features/dashboard-role-guard) — v0.27.4
- [Route /ma-semaine](mem://features/route-ma-semaine) — v0.27.5
- [Vue Tableur opportunités](mem://features/opportunites-tableur) — v0.28.0
- [Suppression opportunité](mem://features/opportunite-delete) — v0.28.1
- [Bulk staffing sur objet](mem://features/bulk-staffing-objet) — v0.29.0
- [Typologie future signature](mem://features/typologie-future-signature) — v0.29.2
- [Compteurs typologie actifs](mem://features/typologie-active-counts) — v0.29.2
- [Fusion Audit + Incident Auth](mem://features/audit-auth-fusion) — v0.29.3
