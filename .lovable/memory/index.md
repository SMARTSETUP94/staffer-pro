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
Imports : devis_imports a UNIQUE INDEX sur fichier_hash + RPC import_devis_atomique_v3 fait UPSERT (mode='updated' si hash existant). v0.30.6 : ZÉRO garde-fou SQL bloquant. RPC `preflight_import_devis` (lecture) + modale client `DevisReimportConfirmDialog` (3 alertes SOFT). Voir mem://features/devis-import-upsert-mode.
Suppression cascade devis : RPC `delete_devis_atomique` + modale `DevisDeleteCascadeDialog` branchées sur /devis/historique (v0.31.0) ET /affaires/$id/devis (v0.31.1). Heures validées → archive (devis.archive + objets archive), sinon delete complet. Audit `devis_deletion_log`.
fabrication_objets.reference : UNIQUE PAR AFFAIRE (affaire_id, reference) depuis v0.31.2 — JAMAIS UNIQUE globale (cassait imports cross-affaires).
Excel : UNIQUEMENT xlsx-js-style (pas xlsx plain, dedup v0.30.1). Modules d'export lazy-loadés au clic. Voir mem://constraints/xlsx-package-policy.
Validation imports : `import-validation.ts` centralise toutes les vérifs (PARSE_FAILED, INVALID_NUMBER, INVALID_DATE, TOTAL_MISMATCH, MISSING_HEADER…). v0.32.1 ajoute `validateRowSumMatch` (qte×PU vs total ligne) et `validateMetierTotalsConsistency` (heures source vs heures consolidées par métier, lignes citées). v0.32.2 ajoute `validateObjetsHeuresConsistency` (heures parsées vs UI par objet × métier, détecte ajout/suppression/désélection/édition).

## Roadmap
1. ✅ v0.27.0 → v0.29.2 (voir historique précédent)
2. ✅ v0.29.3 — fusion Audit Auth + Incident Auth (4 onglets, /incident-auth redirige) + Export Excel Planning sur CDI/Intérim/Budget (981 tests verts, +7)
3. ✅ v0.30.0 — Sprint dette J1 : audit helpers RLS + catégorisation 48 SECURITY DEFINER + UNIQUE indexes + sync mem (992 tests, +11)
4. ✅ v0.30.1 — Sprint dette J2 : dedup xlsx (-1 package) + lazy-load Planning Excel (998 tests, +6)
5. ✅ v0.30.2 — Hotfix onboarding boucle infinie (AppGuard idempotent, ignore TOKEN_REFRESHED même user) (1004 tests, +6)
6. ✅ v0.30.3 — UX import devis Progbat : Client/Lieu éditables sur affaire existante + UPDATE affaire après RPC (1004 tests)
7. ✅ v0.30.4 — Mode upsert import devis (option C) : ré-import même hash → UPDATE devis + cascade replace postes/objets, garde-fous heures/affaire/terminé (1014 tests, +7)
8. ✅ v0.30.5 — Assouplissement upsert : garde-fous "heures réelles" et "devis terminé" levés. Heures préservées + warning client. 1 seul garde-fou restant : changement d'affaire (1017 tests, +3)
9. ✅ v0.30.6 — SOFT total : 0 garde-fou SQL bloquant. RPC `preflight_import_devis` + modale client (autre affaire / heures / devis terminé). Devis suit nouvelle affaire si user confirme (1022 tests, +5)
10. ✅ v0.31.0 — Suppression cascade devis sur /devis/historique : bouton Trash + modale décompte + RPC atomique (delete OU archive si heures validées). Audit log `devis_deletion_log`.
11. ✅ v0.31.1 — Bouton Trash cascade ajouté sur l'onglet Devis affaire (/affaires/$id/devis). Réutilise RPC + modale v0.31.0. (1025 tests, +3)
12. ✅ v0.31.2 — HOTFIX import : contrainte UNIQUE(reference) sur fabrication_objets remplacée par UNIQUE(affaire_id, reference). Débloque imports Progbat cross-affaires.
13. ✅ v0.32.1 — Validation imports : sommes lignes (qte×PU vs total) + cohérence totaux métier (heures source vs consolidées, lignes citées).
14. ✅ v0.32.2 — Validation imports : cohérence heures parsées vs UI par objet × métier (`validateObjetsHeuresConsistency`).
15. ✅ HOTFIX auth invitation — Résolu par CONFIG Supabase : `mailer_otp_exp` passé de 86400s (24h) à 604800s (7j). Aucun code modifié. Invités bloqués avant fix (Raoul, Claude, Vera, etc. >24h sans clic) à réinviter manuellement depuis Supabase Dashboard > Auth > Users.
16. 🚧 v0.32.3 — EN COURS : auto-saisie heures employé sur chantiers non staffés. Cadrage figé : déclencheur = saisie mobile employé / UI = bouton "+ Autre chantier" sur `/mobile/heures` / data = `heures_saisies.assignation_id IS NULL` / validation = 4ᵉ onglet "Hors planning" sur `/validation-heures`. RLS `heures_saisies_self_insert` déjà OK, pas de migration requise.
17. ⏳ v0.33 — À LANCER APRÈS v0.32.3 + hotfixes : Vue Tableur Feuille de Route dans Planning (équivalent vue tableur opportunités v0.28.0, mais pour les feuilles de route — édition inline, tri, filtres).

## Memories
- [Planning 3 vues](mem://features/planning-views) — CDI / Intérim / Synthèse chantier
- [Refonte /devis/import](mem://features/devis-import-validation) — LIVRÉE
- [Mode upsert import devis](mem://features/devis-import-upsert-mode) — v0.30.4 → v0.30.6
- [Filtre typologie propagation](mem://features/typologie-propagation)
- [Assignation ↔ Objets fab](mem://features/assignation-objets) — v0.25
- [Planning par objet](mem://features/planning-par-objet) — v0.26
- [Tests E2E objets + récap](mem://features/tests-e2e-objet-planning)
- [Édition groupée cellule](mem://features/cell-edit-dialog) — v0.27
- [Helpers RLS protégés](mem://constraints/rls-helpers-execute-grant) — audit v0.30.0 ✅ pas de régression
- [SECURITY DEFINER non-RLS catégorisés](mem://constraints/security-definer-non-rls) — v0.30.0
- [UNIQUE indexes imports](mem://features/data-integrity-unique-indexes) — v0.30.0
- [Politique xlsx](mem://constraints/xlsx-package-policy) — v0.30.1
- [Dashboard role guard](mem://features/dashboard-role-guard) — v0.27.4
- [Route /ma-semaine](mem://features/route-ma-semaine) — v0.27.5
- [Vue Tableur opportunités](mem://features/opportunites-tableur) — v0.28.0
- [Suppression opportunité](mem://features/opportunite-delete) — v0.28.1
- [Bulk staffing sur objet](mem://features/bulk-staffing-objet) — v0.29.0
- [Typologie future signature](mem://features/typologie-future-signature) — v0.29.2
- [Compteurs typologie actifs](mem://features/typologie-active-counts) — v0.29.2
- [Fusion Audit + Incident Auth](mem://features/audit-auth-fusion) — v0.29.3
- [Suppression cascade devis](mem://features/devis-delete-cascade) — v0.31.0+v0.31.1
- [Auth flow différencié rôle](mem://features/auth-flow-roles) — magic link + set-password
