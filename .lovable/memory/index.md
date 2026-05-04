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
Import Progbat : TOUJOURS via RPC transactionnel `import_progbat_atomique` (jamais INSERT direct côté client, sinon orphelins `devis_id NULL` → duplicate key au ré-import). `delete_devis_atomique` appelle `cleanup_fabrication_orphelins` en fin. Voir mem://features/devis-import-orphelins-hotfix.
Excel : UNIQUEMENT xlsx-js-style (pas xlsx plain, dedup v0.30.1). Modules d'export lazy-loadés au clic. Voir mem://constraints/xlsx-package-policy.
Validation imports : `import-validation.ts` centralise toutes les vérifs (PARSE_FAILED, INVALID_NUMBER, INVALID_DATE, TOTAL_MISMATCH, MISSING_HEADER…). v0.32.1 ajoute `validateRowSumMatch` et `validateMetierTotalsConsistency`. v0.32.2 ajoute `validateObjetsHeuresConsistency`.
Auto-staffing v0.35 + v0.40 : tier-priority CDI/CDD AVANT intérim (bonus contrat CDI 1.0 / CDD 0.9 / Intérim 0.3). Intérim = variable d'ajustement, jamais défaut. Voir mem://features/auto-staffing-tier-priority.
Volume staffé v0.39.0c : KPI "Heures staffées" = Σ(pers × demi_jours × H_HALF[4h]). Garde-fou auto : badge ±X.X% (ambre ≥5%, rouge ≥15%) + alerte `VOLUME_ECART_DEVIS` (soft ≥5%, hard ≥15%) dans AlerteBandeau. Popover formule + breakdown métier sur StatCard.

## Roadmap

### Livré v0.27 → v0.30 (socle planning + RLS + cascade devis)
1. ✅ **v0.27.0 → v0.29.2** — Refonte planning 3 vues, dashboard role guard, route /ma-semaine, vue tableur opportunités, suppression opportunité, bulk staffing objet, typologie future signature, compteurs typologie actifs (voir historique précédent)
2. ✅ **v0.29.3** — Fusion Audit Auth + Incident Auth (4 onglets) + Export Excel Planning CDI/Intérim/Budget (981 tests)
3. ✅ **v0.30.0** — Sprint dette J1 : audit helpers RLS + 48 SECURITY DEFINER catégorisés + UNIQUE indexes (992 tests)
4. ✅ **v0.30.1** — Sprint dette J2 : dedup xlsx (-1 package) + lazy-load Planning Excel (998 tests)
5. ✅ **v0.30.2** — Hotfix onboarding boucle infinie (AppGuard idempotent, ignore TOKEN_REFRESHED) (1004 tests)
6. ✅ **v0.30.3** — UX import devis Progbat : Client/Lieu éditables sur affaire existante + UPDATE affaire après RPC
7. ✅ **v0.30.4** — Mode upsert import devis (option C) : ré-import même hash → UPDATE devis + cascade replace (1014 tests)
8. ✅ **v0.30.5** — Assouplissement upsert : garde-fous heures réelles et devis terminé levés (1017 tests)
9. ✅ **v0.30.6** — SOFT total : 0 garde-fou SQL bloquant. RPC `preflight_import_devis` + modale client (1022 tests)

### Livré v0.31 → v0.32 (cascade delete + validation imports)
10. ✅ **v0.31.0** — Suppression cascade devis sur /devis/historique : bouton Trash + modale décompte + RPC atomique (delete OU archive si heures validées). Audit log `devis_deletion_log`.
11. ✅ **v0.31.1** — Bouton Trash cascade ajouté sur l'onglet Devis affaire (/affaires/$id/devis) (1025 tests)
12. ✅ **v0.31.2** — HOTFIX import : UNIQUE(reference) → UNIQUE(affaire_id, reference) sur fabrication_objets. Débloque imports Progbat cross-affaires.
13. ✅ **v0.31.4 → v0.31.4d** — Refonte parser Progbat 3 niveaux + modale UI hiérarchique + section quantité multiplicateur + édition manuelle (rename/delete)
14. ✅ **v0.31.5 HOTFIX + SPRINT CLÔTURE** (2 mai 2026) — Bug parser 2141 + #112 Lieu/Client + #113 patterns Logistique + #105 Excel "Par chantier" + v0.32.4 polish auto-saisie hors-planning. 1234 tests.
15. ✅ **v0.32.1** — Validation imports : sommes lignes (qte×PU vs total) + cohérence totaux métier
16. ✅ **v0.32.2** — Validation imports : cohérence heures parsées vs UI par objet × métier
17. ✅ **v0.32.3** — Auto-saisie heures hors planning : migration `metier_id` + RPC + helpers + dialog + bouton "+ Autre chantier" + badge (1081 tests)
18. ✅ **v0.32.4** — Polish auto-saisie hors-planning + DATE_FUTURE
19. ✅ **HOTFIX auth invitation** — CONFIG Supabase : `mailer_otp_exp` 24h → 7j

### Livré v0.33 (Vue Tableur Feuille de Route)
20. ✅ **v0.33** — Vue Tableur Feuille de Route Planning

### Livré v0.35 (Auto-staffing Fabrication 5XXX — sprint complet)
21. ✅ **v0.35.0 → v0.35.6** — DB + algo backward planning + multi-chantiers + UI Gantt + Charge atelier + StaffingPersonnesSection tier-based + Wizard intégré + Anti-duplication + Publication+versioning+restore + Audit sécu + 10 specs E2E + docs
22. ✅ **v0.35.7** — Polish itératif : batch edit-store autosave 2min, BE/Num par objet, Num mono-CNC HARD, ResolveCncConflictDialog, page /parametres/competences-equipe, suppression HARD plan admin
23. ✅ **v0.35.8** — Jours ouvrés FR + absences validées dans algo
24. ✅ **v0.35.9** — Ctrl+S kbd, ring Gantt edits locaux, Précédent wizard, compteur pers·j, confirmation rapide
25. ✅ **v0.35.10** — Undo Ctrl+Z 50 niveaux + drag-to-shift snap jour + bulk pers Bois/Peint
26. ✅ **v0.35.11** — Express Mode (createPlanExpress + split-button + bandeau sticky 1-2 clics)
27. ✅ **v0.35.12** — Refonte StaffingPersonnesSection (tabs métier + Liste/Calendrier + hide full + badges absences)
28. ✅ **v0.35.13** — Stabilité Gantt (silent reload + scroll restore + mini-dates contextuelles + reorder Heatmap)
29. ✅ **v0.35.14** — Compétences 4 niveaux (P/S/D/X enum + tier-ranking refondu Tier1/2/3/4). **PUBLISHABLE.**

### Livré v0.38 (Demi-journée)
30. ✅ **v0.38.0-alpha** — Migration `span_demi_jours` + `start_half_day` + algo FLOOR strict
31. ✅ **v0.38.1a** — Algo binôme MIN flex + VolumeCard + snapshot/restore demi-journée
32. ✅ **v0.38.1b** — Gantt grille AM|PM (`220px repeat(days*2)`)
33. ✅ **v0.38.1.1** — Sync StaffingPersonnesSection demi-journée
34. ✅ **v0.38.2** — UX polish Gantt (overflow label `•••` + ChargeMetierSection drilldown + chevron persist)

### Livré v0.39 (Vue 3 + hotfixes KPI + Sprint 1 stabilité)
35. ✅ **v0.39.0a/b/c** (4 mai 2026) — Vue 3 + KPI "Heures staffées" auditable + garde-fou volume + alerte `VOLUME_ECART_DEVIS`.
36. ✅ **v0.39.0a-hotfix-import** (4 mai 2026) — RPC transactionnel `import_progbat_atomique` + `cleanup_fabrication_orphelins` + cleanup 13 orphelins prod. Voir mem://features/devis-import-orphelins-hotfix.
37. ✅ **v0.39.1 Sprint 1 STABILITÉ** (4 mai 2026) — Audit RLS heures_saisies (verdict : RLS OK, BUG #33 non causé par RLS) + matrice `docs/rls-policies.md` + 2 nouveaux tests E2E (chef→employé heures, auto-staffing v0.39 Vue 1/2/3) + audit mutations client (Top 5 RPC à migrer, voir `docs/audit-mutations-client-v0391.md`) + auth-context shallow setSession (anti re-render TOKEN_REFRESHED). Voir mem://features/sprint-1-stabilite-v0391. **API Claude v0.41 REPORTÉE backlog.**

### À venir
38. ⏳ **v0.39.2** — Migration RPC #1 bulk-assign-objet + #2 chef-saisit-pour-employe (corrige BUG #33 root cause)
39. ⏳ **v0.39.3** — Migration RPC #3 bulk-saisie + #5 bulk-staffer
40. ⏳ **v0.34.x** — Batterie E2E par rôle — INFRA POSÉE, reste seed comptes + ~48 tests
41. ⏳ **v0.36** — Sprint dette résiduelle : page admin véhicules + audit findings
42. ⏳ **v0.37** — Polish UX transversal post-feedback terrain
43. ⏳ **v0.39.x suite** — Logistique avancée : autorisations véhicules #56 + sous-traitants
44. ⏳ **v0.40** — Phase 2 horaires précis + RPC #4 feuille-route
45. ⏳ **v0.41 (BACKLOG)** — Claude API auto-staffing — REPORTÉE par Gabin (focus stabilité d'abord)

Voir roadmap consolidée détaillée : mem://roadmap/consolidee-2mai2026.

## Memories
- [Roadmap consolidée 2 mai 2026](mem://roadmap/consolidee-2mai2026) — v0.31.4 → v0.40, 11 jalons
- [Auto-staffing tier priority](mem://features/auto-staffing-tier-priority) — règle CDI/CDD avant intérim
- [Wizard plan staffing](mem://features/staffing-plan-wizard) — v0.35.4 onglet Fab + bouton Devis
- [Planning 3 vues](mem://features/planning-views) — CDI / Intérim / Synthèse chantier
- [Refonte /devis/import](mem://features/devis-import-validation) — LIVRÉE
- [Mode upsert import devis](mem://features/devis-import-upsert-mode) — v0.30.4 → v0.30.6
- [Filtre typologie propagation](mem://features/typologie-propagation)
- [Assignation ↔ Objets fab](mem://features/assignation-objets) — v0.25
- [Planning par objet](mem://features/planning-par-objet) — v0.26
- [Tests E2E objets + récap](mem://features/tests-e2e-objet-planning)
- [Édition groupée cellule](mem://features/cell-edit-dialog) — v0.27
- [Helpers RLS protégés](mem://constraints/rls-helpers-execute-grant) — audit v0.30.0
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
- [Devis import orphelins hotfix](mem://features/devis-import-orphelins-hotfix) — v0.39.0a-hotfix-import : RPC transactionnel + cleanup orphelins
- [Feuille de Route Tableur](mem://features/feuille-route-tableur) — v0.33
- [HOTFIX parser devis 2141](mem://features/devis-import-hotfix-v0315) — v0.31.5
- [Sprint clôture v0.31.5](mem://features/sprint-cloture-v0315) — #112+#113+#105+v0.32.4
- [Auto-staffing v0.35 spec figée](mem://features/auto-staffing-v035-spec) — mapping métiers
- [Page compétences équipe](mem://features/competences-equipe-page) — /parametres/competences-equipe
- [Jours ouvrés + congés algo](mem://features/staffing-jours-ouvres-conges) — v0.35.8
- [Audit UX v0.35 — 5 HIGH livrées](mem://features/audit-ux-v035-high) — v0.35.9
- [Staffing P1 Undo+Drag+Bulk](mem://features/staffing-undo-drag-bulk) — v0.35.10
- [Staffing Express Mode](mem://features/staffing-express-mode) — v0.35.11
- [Staffing personnes refonte UX](mem://features/staffing-personnes-refonte-ux) — v0.35.12
- [Auth flow différencié rôle](mem://features/auth-flow-roles) — magic link + set-password
- [E2E Playwright coverage](mem://features/e2e-playwright-coverage) — v0.34
- [Sprint 1 stabilité v0.39.1](mem://features/sprint-1-stabilite-v0391) — RLS audit + 2 E2E + audit mutations + auth shallow
