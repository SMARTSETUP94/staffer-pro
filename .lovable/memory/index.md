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
36. ✅ **v0.39.0a-hotfix-import** (4 mai 2026) — RPC transactionnel `import_progbat_atomique` + `cleanup_fabrication_orphelins` + cleanup 13 orphelins prod.
37. ✅ **v0.39.1 Sprint 1 STABILITÉ** (4 mai 2026) — Audit RLS heures_saisies + matrice `docs/rls-policies.md` + 2 E2E + audit mutations client + auth-context shallow setSession. **API Claude v0.41 REPORTÉE backlog.**

### Livré v0.39.2a/b1 (Sprint 2 polish — phasage sûr)
38. ✅ **v0.39.2a** (4 mai 2026) — `CellEditPopover` + `DurationStepper` ; Vue 1 isolée, Vue 2 cascade aval (`cascade-aval.ts`, 6 tests). Algo `greedy-allocate.ts` + 5 tests. E2E `import-progbat-conflicts.chef.spec.ts` (4 specs).
39. ✅ **v0.39.2b1** (4 mai 2026) — Greedy UI branché dans `EquipeAffaireSection` (compteur live, badge rotation, bouton re-tri, badges P1/P2/Pn). Doc RLS enrichie + `CONTRIBUTING.md`. Smoke E2E cascade + greedy. 0 console.log/TODO.

### Livré v0.40 (Refonte Manut split — algo + UI)
40. ✅ **v0.40.0a** (5 mai 2026) — Algo absorption Manut Bois/Peint/Tap au prorata (35% début + 15% transfert + 50% FIN globale) + flag DB `is_manut_absorbed` + 7 tests Vitest. 1358/1358 verts.
41. ✅ **v0.40.0b** (5 mai 2026) — UI Gantt nettoyée (suppression barres Manut intermédiaires par objet) + section globale "Manutention FIN (50%) + ressources partagées" + pré-param 6 lignes avec tooltips "Bois 105h dont 19h ex-Manut absorbée" + note bas de page + E2E `manut-refonte-v040.chef.spec.ts`. `ManutStatCard` dédié + `manut-summary.ts` (14 tests). 1372/1372 verts.

### Livré v0.40.0e + hotfixes UX (5 mai 2026)
42. ✅ **v0.40.0e** — Consolidation "Suivi marge par métier" en treetable (1 ligne par métier + drilldown par devis). Lib `affaire-marge-consolidation.ts` + 7 tests.
43. ✅ **Hotfix prefill numéro affaire** — Race condition fetch top-200 vs prefill : merge dédupliqué via Set. 3 tests.
44. ✅ **Hotfix noms objets Plan staffing** — `<ObjetRefLabel />` partout (Gantt + Wizard) → masque préfixe `D-{numero}-`. 7 tests.

### Livré v0.39.2b2 (Sprint 2b2 Gantt + Personnes — TERMINÉ)
45. ✅ **v0.39.2b2.1 Tour 1** (5 mai 2026) — Extraction `gantt/GanttHeaderRow.tsx` + `gantt/StatCard.tsx`. `GanttInteractif` 1029L → 857L.
46. ✅ **v0.39.2b2.1 Tour 2** (5 mai 2026) — Extraction `gantt/DayGrid.tsx`. `GanttInteractif` 857L → 735L. **1397/1397 verts.**
47. ✅ **v0.39.2b2.1 Tour 3** (5 mai 2026) — Extraction `gantt/ObjetRowInteractif.tsx`. `GanttInteractif` 759L → **603L**. **1401/1401 verts.** Sprint 2b2.1 clôturé.
48. ✅ **v0.39.2b2.2** (5 mai 2026) — Refonte `StaffingPersonnesSection.tsx` 1214L → **322L** + dossier `staffing/personnes/` (shared, AutoStaffButton, PersonneSuggestionCard, AssignedChip, ListView, CalendarView). Test Vitest PersonneSuggestionCard. **1404/1404 verts.** Sprint 2b2 entièrement clôturé.

### Sprint 3 features métier (en cours)
49. ✅ **v0.41.0a** (5 mai 2026) — Hotfix BUG #33 heures invisibles côté employé : `use-mes-heures` deps `useMemo` rows complétées (affairesById/metiersById) + refetch sur `visibilitychange`+`focus`. Test non-régression invariants. **1407/1407 verts.** Voir mem://features/sprint-3-features-v041.

### Livré v0.43.x (Hub Chef Mobile — Sprint 1)
50. ✅ **v0.43.0/1** (10 mai 2026) — Sprint 1 Hub Chef Mobile : 5 onglets (Dashboard/Planning/Équipe/À valider/Moi), badges multi-rôles, scope dur StafferMobileForm via `mes_affaires_chef`, 7 specs E2E. Option D : scope app-side, RLS strict différé en v0.45. Voir mem://features/sprint-1-hub-chef-mobile.

### Livré v0.44 (Documents/Photos + Refonte Atelier)
51. ✅ **v0.44.0** (10 mai 2026) — Bucket privé `affaires-photos` + table `affaire_documents` (soft delete) + RLS scopée chef (Option D) + galerie desktop `/affaires/$id/documents` + galerie mobile chef `/mobile/chef/affaires/$id` avec caméra native + compression JPEG q=80 max 2560px + lightbox édition caption/date + 3 E2E. Voir mem://features/affaire-documents.
51.1. ✅ **v0.44.1** (10 mai 2026) — Refonte UX Hub Chef Mobile : (a) ValiderHeures déplacé de "À valider" vers /equipe sous-tab Valider (fix doublon), (b) "À valider" renommé "Atelier" (icône Hammer), (c) 3 sous-tabs Atelier : Objets fab + Kanban chantier (Bois/Peinture/Manut/Validé) + Photos par objet, (d) migration `affaire_documents.objet_id` FK nullable ON DELETE SET NULL (1:N affaire→photo, photos restent attachées au chantier si objet supprimé). Hook `useChantierKanban` + `useObjetPhotos`. Bottom nav badge ne compte que les objets.
51.2. ✅ **v0.44.2** (10 mai 2026) — Polish post-v0.44.1 : (1) redirect `/mobile/chef/a-valider` → `/mobile/chef/atelier` via `beforeLoad` TanStack (préserve les bookmarks), (2) dashboard mobile chef 5 KPI cards : Heures à valider → /equipe, Objets à valider → /atelier, nouvelle card "Photos récentes (7j)" → /atelier, Équipe (7j), Mes affaires actives, (3) Kanban Vue chantier : badges compteur par colonne, empty states icône `Inbox`, tri "en retard d'abord puis échéance puis ref" via `fabrication_etapes.date_fin` (min des étapes non terminées), filtres chantier persistés en `localStorage` (`v0.44.2:kanban-filter-affaires`), animations 200ms ease-out, badge "Retard" rouge sur cards en dépassement, (4) E2E `e2e/mobile-chef/sprint-v0442-polish.chef.spec.ts` (6 specs : redirect + KPI dashboard + sous-tab Valider equipe + Kanban 4 colonnes + Photos par objet + bottom nav badge). Drag-drop bonus reporté.


### Audit technique v0.43-v0.44 (10 mai 2026)
51.3. ✅ **Audit `docs/audit-v0.43-v0.44.md`** — 7 angles (sécu/perf/qualité/DB/UX-A11Y/métier/doc). Verdict global 🟡 À surveiller. Top 5 actions ~11h. Sprints v0.45/v0.46/v0.47 **SUSPENDUS** en attente arbitrage Gabin sur sprint correctif v0.44.3.

### En cours v0.45 (RLS hardening chef — DB livrée, UI en attente)
51.4. 🟡 **v0.45 partiel** (10 mai 2026) — DB : enum `chef_metier_scoped` + helpers `is_chef_global()`/`is_chef_metier_scoped()` + RLS durcie sur `heures_saisies`/`fabrication_objets`/`assignations`/`assignation_objets` + auth-context `isChefMetierScoped`/`isChefGlobal`/`isChefAny` + hook `useChefScope` + libellés invitation/dashboard. **Reste UI** : `ScopedAccessBanner` + filtrage `/affaires`/`/validation-heures`/`/audit-heures` + tests pgTAP + E2E isolement.

### Audit v0.43-v0.44 — CLÔTURÉ ✅
52. ✅ **v0.44.3** (10 mai 2026, ~7h) — Top 3 audit : (a) `ScopedAccessBanner` chef_metier_scoped sur 3 pages + E2E stub ; (b) 3 triggers business (`validate_heures_saisies_bounds`/`validate_contrat_intermittent`/`validate_assignation_heures`) avec codes `HEURES_INVALIDES`/`DATES_CONTRAT_INVALIDES`/`TAUX_INVALIDE` ; (c) Soft-delete audit trail (`deleted_by` + RPC + vue 30j) ; (d) Page `/admin/audit` 3 onglets + CSV ; (e) pgTAP 8/8 verts. Voir `docs/sprint-v0443-checklist.md`.
53. ✅ **v0.44.4** (10 mai 2026, ~4h) — Top 5 audit : (a) Batch signed URLs via `createSignedUrls` (20→1 RT) ; (b) `DocumentThumbnail` lazy IntersectionObserver ; (c) `formatBusinessError` mapper + 6/6 tests ; (d) 3 ADRs (RLS scoped, objet_id, TipTap) ; (e) Seed E2E `chef_metier_scoped`. Voir `docs/sprint-v0444-checklist.md`.
54. ✅ **v0.44.5** (10 mai 2026, ~1h) — Bloc 🟠 : (a) RLS `affaire_documents_select` masque soft-deleted ; (b) Trigger `enforce_signed_at_server_side` force `signed_at=now()` côté serveur ; (c) `formatBusinessError` câblé dans `ValiderHeuresList`/`SaisirPourEmployeDialog`/`BulkSaisieDialog` → toasts FR au lieu de RLS bruts.
55. ✅ **v0.44.6** (10 mai 2026, ~1h) — Bloc 🟡 clôture : (a) ADR-004 convention `DROP POLICY IF EXISTS` ; (b) `docs/db-schema.md` index humain 60+ tables par domaine ; (c) Audit TTL signed URLs (5/6 OK, dette `contrats-intermittents` 1 an → refactor signed-on-demand reporté v0.46+) ; (d) États vides Atelier/Hub vérifiés (faux positifs audit). Voir `docs/sprint-v0446-checklist.md`. **Audit clôturé, reprise roadmap normale.**
56. ✅ **v0.44.7** (10 mai 2026, ~30min) — Filtrage UI pour `chef_metier_scoped` aligné sur portée RLS : toggle "Mes chantiers uniquement" (auto-on pour scoped) sur `/affaires` et `/validation-heures` via `useMesAffairesChefIds`. Compteur affiché. `/audit-heures` reste admin-only (RoleGuard redirige scoped vers /dashboard — c'est l'expression correcte du scope, doc inline ajoutée).

### Roadmap reprise
56. ⏳ **v0.45 RLS hardening DB** — pgTAP CI sur `mes_affaires_chef` + policies DB scopées heures/assignations/docs/photos + E2E isolement chef scopé. **PROCHAIN SPRINT**.
55. ⏸️ **v0.46 SILAE Phase 2 horaires précis** — SUSPENDU.
56. ⏸️ **v0.47 Centre Analyse Heures (Option B)** — SUSPENDU.
57. ⏳ **Sprint 3c** — E2E full role-based (employé desktop + mobile).
54. ⏳ **Sprint 3b** — Logistique avancée (autorisations véhicules + sous-traitants + historique + stats).
55. ⏳ **v0.20.1 quick wins** — Pré-remplissage trajet sous-traité + cache `useObjetsAffaireLight` + notification CA prêt à livrer.
56. ⏳ **v0.21.1** — Garde RBAC UI `/saisie-pour-equipe` + durcissement RLS + UNIQUE INDEX chef_jour + tests SQL.
57. ⏳ **v0.39.3** — Migration RPC #1/2/3/5 (bulk-assign-objet, chef-saisit-pour-employe, bulk-saisie, bulk-staffer).
58. ⏳ **v0.36** — Sprint dette résiduelle : page admin véhicules + audit findings.
59. ⏳ **v0.37** — Polish UX transversal post-feedback terrain.
60. ⏳ **v0.40 Phase 2** — Horaires précis SILAE + RPC #4 feuille-route.
61. ⏳ **v0.41 (BACKLOG)** — Claude API auto-staffing 5XXX + CNI/passeport profil + suggestion véhicule.

Voir roadmap consolidée détaillée : mem://roadmap/consolidee-2mai2026.

## Memories
- [Centre d'analyse heures](mem://features/centre-analyse-heures) — BACKLOG : onglet consolidé heures + 8 filtres + exports
- [Roadmap consolidée 2 mai 2026](mem://roadmap/consolidee-2mai2026) — v0.31.4 → v0.40, 11 jalons
- [Refonte Manut v0.40](mem://features/manut-refonte-v040) — absorption DEBUT+TRANSFERT par Bois/Peint/Tap
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
- [Historique équipe par chantier](mem://features/affaire-equipe-historique) — v0.43 table + RPC + widget
- [Dashboard widgets sympa](mem://features/dashboard-widgets-sympa) — v0.40.x Phases 1-3 livrées (5/6), Quiz à venir
- [Sprint 3 features v0.41](mem://features/sprint-3-features-v041) — v0.41.0a hotfix heures invisibles employé
- [Sécurité v0.21.1](mem://features/securite-v0211) — RoleGuard + RLS heures_saisies durci + UNIQUE INDEX chef_jour
- [Auth flow différencié rôle](mem://features/auth-flow-roles) — magic link + set-password
- [E2E Playwright coverage](mem://features/e2e-playwright-coverage) — v0.34
- [Sprint 1 stabilité v0.39.1](mem://features/sprint-1-stabilite-v0391) — RLS audit + 2 E2E + audit mutations + auth shallow
- [Sprint 1 Hub Chef Mobile v0.43](mem://features/sprint-1-hub-chef-mobile) — 5 onglets mobile + audit trail validations + scope app-side
- [Documents/Photos par affaire v0.44](mem://features/affaire-documents) — bucket privé + RLS scope chef + galerie desktop/mobile + caméra native
- [Audit technique v0.43-v0.44](docs/audit-v0.43-v0.44.md) — 10 mai 2026, verdict 🟡, top 5 actions ~11h, déclencheur sprints v0.44.3/v0.44.4
