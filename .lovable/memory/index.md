# Project Memory

## Core
App planning chantiers Setup Paris. FR language UI.
Supabase Cloud backend. TanStack Start + Tailwind v4.
11 rôles métier : admin (full), chef_chantier, employe, commercial, bureau_etude, atelier_chef, atelier_metier, logistique, poseur, chef_pose, chef_chantier (legacy). Capabilities matrice 59 caps × 11 rôles via `user_has_cap()`.
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
Création comptes v0.46 : self-signup DÉSACTIVÉ (Supabase + UI). Invitations admin → défaut `chef_chantier`. Employés via fiche `employes` + auto-link email. Onboarding redirige vers `/` (pas `/dashboard`) pour routing role-aware. Voir mem://features/role-creation-policy.
Routing post-login centralisé v0.47.1 : module unique `src/lib/post-login-routing.ts` (`resolvePostLoginTarget` + `checkMobileChefAccessForAdmin`). Voir mem://features/post-login-routing-module.
Métiers/postes v0.47.3 : 4 surfaces unifiées via bandeau `MetiersPostesTabs` (Métiers / Postes contractuels / Postes principaux / Compétences équipe), sidebar consolidée à 1 entrée. Voir mem://features/metiers-postes-hub.
Absences = 1 seule table `absences` avec colonne `type`. JAMAIS créer module congés séparé. Voir mem://constraints/absences-une-seule-table.
v0.48 : `/planning` recentré staffing (5 onglets : CDI/CDD, Intérim, Par chantier, Par objet, Par pôle). Vues Véhicules, Budget, Feuille de route extraites vers `/logistique/vehicules-planning`, `/affaires/budget-planning`, `/export/feuille-de-route`. Redirect SPA depuis anciens `?tab=`. Voir mem://features/planning-par-pole-v048.
Vocabulaire métier v0.48.x (Lot 7.1 bis) : libellés UI passent par `useVocab()` (`src/hooks/use-vocab.ts`) + flag `vocab_metier_v1` (off par défaut). Staffer→Assigner, Auto-staffing→Auto-remplir, Plan staffing→Plan de fab, Validation→Valider. Express CONSERVÉ. Routes/RPCs/queryKeys/composants TS INCHANGÉS. Cleanup deadline : 2 semaines après bascule globale. Voir mem://constraints/vocabulaire-metier-centralise.
Modèle staffing 3 niveaux (Sprint A) : `affaire_equipe(affaire_id, employe_id, phase, role_terrain)` + `fabrication_objet_equipe(objet_id, employe_id)` + `assignations.phase`. Trigger `enforce_objet_equipe_strict` avec flag bypass TEMPORAIRE Sprints A→C (voir mem://debts/bypass-objet-equipe-strict-temp). Atomes design: `PhaseBadge`, `HeuresTriplet`, `RoleSwitcher` dans `src/components/atoms/` (30 tests Vitest verts). Helper SQL `resolve_saisie_heures(employe_id, affaire_id, date, objet_id?)` cascade 3→2→1→0 (bench 3ms, SECURITY DEFINER, EXECUTE TO authenticated). RoleSwitcher monté dans header `AppLayout` (hidden si ≤ 1 rôle). 9 tests rouges pré-existants Sprint A (typologie + dashboard) tracés en dette : mem://debts/tests-rouges-preexistants.
Saisie d'heures = SOURCE UNIQUE `src/lib/heures-upsert.ts` (`upsertHeuresSaisie` / `patchHeuresSaisie` / `insertHeuresSaisie` / `insertHeuresSaisieBatch`). JAMAIS de `.from("heures_saisies").insert|update` direct hors whitelist (test guard `heures-saisie-source-unique-guard`). Voir mem://constraints/heures-saisie-source-unique.



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
35. ✅ **v0.39.0a/b/c/d** (4 mai 2026) — Vue 3 + KPI "Heures staffées" auditable + garde-fou volume + alerte `VOLUME_ECART_DEVIS`.
36. ✅ **v0.39.0a-hotfix-import** (4 mai 2026) — RPC transactionnel `import_progbat_atomique` + `cleanup_fabrication_orphelins` + cleanup 13 orphelins prod.
37. ✅ **v0.39.1 Sprint 1 STABILITÉ** (4 mai 2026) — Audit RLS heures_saisies + matrice `docs/rls-policies.md` + 2 E2E + audit mutations client + auth-context shallow setSession. **API Claude v0.41 REPORTÉE backlog.**

### Livré v0.39.2a/b1/b2 (Sprint 2 polish — phasage sûr)
38. ✅ **v0.39.2a** (4 mai 2026) — `CellEditPopover` + `DurationStepper` ; Vue 1 isolée, Vue 2 cascade aval (`cascade-aval.ts`, 6 tests). Algo `greedy-allocate.ts` + 5 tests. E2E `import-progbat-conflicts.chef.spec.ts` (4 specs).
39. ✅ **v0.39.2b1** (4 mai 2026) — Greedy UI branché dans `EquipeAffaireSection` (compteur live, badge rotation, bouton re-tri, badges P1/P2/Pn). Doc RLS enrichie + `CONTRIBUTING.md`. Smoke E2E cascade + greedy. 0 console.log/TODO.
40. ✅ **v0.39.2b2** (5 mai 2026) — Extraction `gantt/GanttHeaderRow.tsx` + `gantt/StatCard.tsx`. `GanttInteractif` 1029L → 603L. Refonte `StaffingPersonnesSection.tsx` 1214L → 322L + dossier `staffing/personnes/`. **1404/1404 verts.** Sprint 2b2 clôturé.

### Livré v0.40 (Refonte Manut split — algo + UI)
41. ✅ **v0.40.0a/b** (5 mai 2026) — Algo absorption Manut Bois/Peint/Tap au prorata (35% début + 15% transfert + 50% FIN globale) + flag DB `is_manut_absorbed` + UI Gantt nettoyée + pré-param 6 lignes + E2E `manut-refonte-v040.chef.spec.ts` + `ManutStatCard`. **1372/1372 verts.**
42. ✅ **v0.40.0e** (5 mai 2026) — Consolidation "Suivi marge par métier" en treetable (1 ligne par métier + drilldown par devis). Lib `affaire-marge-consolidation.ts` + 7 tests.
43. ✅ **Hotfixes v0.40** — Prefill numéro affaire (race condition fix) + noms objets Plan staffing (`<ObjetRefLabel />`).

### Livré v0.41.0a (Hotfix heures invisibles employé)
44. ✅ **v0.41.0a** (5 mai 2026) — BUG #33 heures invisibles côté employé : `use-mes-heures` deps `useMemo` rows complétées + refetch sur `visibilitychange`+`focus`. **1407/1407 verts.**

### Livré v0.42 (Module Template Contrat CDDU)
45. ✅ **v0.42.0** (10 mai 2026) — Module Template Contrat CDDU + paramètres entreprise + hotfixes signature.
46. ✅ **v0.42.1** (10 mai 2026) — Template v2.1 (layout H1, CGE 2 pages, placeholder `{{poste}}`) + catalogue postes (`postes_catalogue` 8 postes seed) + page `/parametres/postes` CRUD + suppression définitive admin contrats (cascade signatures).
47. ✅ **v0.42.2** (10 mai 2026) — Refacto `{{poste}}` → `employes.poste_principal` + page admin `/admin/employes-poste-principal` (saisie en lot 162 fiches, suggestions par metier_principal, autosave) + export/import Excel postes (`employes-excel.ts` + `EmployesImportPostesDialog` diff preview) + validation E2E template (`TemplateTestDialog` 5 fixtures + détection `{{...}}` non interpolés + checklist 15 sections).

### Livré v0.43.x (Hub Chef Mobile — Sprint 1)
48. ✅ **v0.43.0/1** (10 mai 2026) — Sprint 1 Hub Chef Mobile : 5 onglets (Dashboard/Planning/Équipe/À valider/Moi), badges multi-rôles, scope dur StafferMobileForm via `mes_affaires_chef`, 7 specs E2E. Option D : scope app-side, RLS strict différé en v0.45.

### Livré v0.44 (Documents/Photos + Refonte Atelier)
49. ✅ **v0.44.0** (10 mai 2026) — Bucket privé `affaires-photos` + table `affaire_documents` (soft delete) + RLS scopée chef (Option D) + galerie desktop `/affaires/$id/documents` + galerie mobile chef `/mobile/chef/affaires/$id` avec caméra native + compression JPEG q=80 max 2560px + lightbox édition caption/date + 3 E2E.
50. ✅ **v0.44.1** (10 mai 2026) — Refonte UX Hub Chef Mobile : (a) ValiderHeures déplacé de "À valider" vers /equipe sous-tab Valider, (b) "À valider" renommé "Atelier" (icône Hammer), (c) 3 sous-tabs Atelier : Objets fab + Kanban chantier (Bois/Peinture/Manut/Validé) + Photos par objet, (d) migration `affaire_documents.objet_id` FK nullable ON DELETE SET NULL.
51. ✅ **v0.44.2** (10 mai 2026) — Polish post-v0.44.1 : redirect `/mobile/chef/a-valider` → `/mobile/chef/atelier`, 5 KPI cards dashboard mobile, Kanban Vue chantier (badges compteur par colonne, empty states, tri, filtres persistés, animations, badge "Retard"), 6 specs E2E.

### Audit v0.43-v0.44 (10 mai 2026)
52. ✅ **Audit `docs/audit-v0.43-v0.44.md`** — 7 angles (sécu/perf/qualité/DB/UX-A11Y/métier/doc). Verdict global 🟡 À surveiller. Top 5 actions ~11h. Sprints v0.44.3/v0.44.4 déclenchés.
53. ✅ **v0.44.3** (10 mai 2026, ~7h) — Top 3 audit : `ScopedAccessBanner` chef_metier_scoped sur 3 pages + E2E stub ; 3 triggers business ; soft-delete audit trail (`deleted_by` + RPC + vue 30j) ; page `/admin/audit` 3 onglets + CSV ; pgTAP 8/8 verts.
54. ✅ **v0.44.4** (10 mai 2026, ~4h) — Top 5 audit : Batch signed URLs via `createSignedUrls` (20→1 RT) ; `DocumentThumbnail` lazy IntersectionObserver ; `formatBusinessError` mapper + 6/6 tests ; 3 ADRs (RLS scoped, objet_id, TipTap) ; seed E2E `chef_metier_scoped`.
55. ✅ **v0.44.5** (10 mai 2026, ~1h) — Bloc 🟠 : RLS `affaire_documents_select` masque soft-deleted ; trigger `enforce_signed_at_server_side` force `signed_at=now()` côté serveur ; `formatBusinessError` câblé dans 3 composants.
56. ✅ **v0.44.6** (10 mai 2026, ~1h) — Bloc 🟡 clôture : ADR-004 convention `DROP POLICY IF EXISTS` ; `docs/db-schema.md` index 60+ tables ; Audit TTL signed URLs ; états vides Atelier/Hub vérifiés.
57. ✅ **v0.44.7** (10 mai 2026, ~30min) — Filtrage UI `chef_metier_scoped` : toggle "Mes chantiers uniquement" (auto-on pour scoped) sur `/affaires` et `/validation-heures` via `useMesAffairesChefIds`. `/audit-heures` reste admin-only.

### Livré v0.45 (Historique équipes par chantier)
58. ✅ **v0.45.0** (11 mai 2026) — Table `affaire_equipe_historique` agrégée (1 ligne par affaire×chef×employé) alimentée par triggers temps réel sur `assignations` + `affaires`. RPC `get_mon_equipe_type` (score contextuel par typologie). Widget dashboard "Mon équipe type" whitelist chef/admin (top 8 sur 12 mois). Backfill initial inclus. Feature store pour future IA v0.41.
59. ✅ **v0.45.1** (11 mai 2026) — Page détaillée `/mon-equipe-type` (top 50, filtres typologie + période, KPI agrégés, drilldown Sheet par coéquipier). Widget pointe vers cette page.

### Livré v0.46 (Création comptes — invitations admin)
60. ✅ **v0.46** (11-13 mai 2026) — Self-signup DÉSACTIVÉ (Supabase + UI). Invitations admin → défaut `chef_chantier`. Employés via fiche `employes` + auto-link email. Onboarding redirige vers `/` (pas `/dashboard`) pour routing role-aware.

### Livré v0.47 (Routing centralisé + Métiers/Postes hub)
61. ✅ **v0.47.1** (13 mai 2026) — Routing post-login centralisé : module unique `src/lib/post-login-routing.ts` (`resolvePostLoginTarget` + `checkMobileChefAccessForAdmin`).
62. ✅ **v0.47.3** (13 mai 2026) — 4 surfaces unifiées via bandeau `MetiersPostesTabs` (Métiers / Postes contractuels / Postes principaux / Compétences équipe), sidebar consolidée à 1 entrée.

### Livré v0.34.x (Battery role-smoke E2E)
63. ✅ **v0.34.x** (13 mai 2026) — Battery role-smoke E2E livrée : 4 specs (admin 45 routes / chef 24+8 / employé desktop 7+20 / employé mobile 8+13) avec garde-fou anti-fuite RGPD. Helper `e2e/helpers/role-smoke.ts`.

### Livré v0.48 (Planning par pôle + Refonte navigation)
64. ✅ **v0.48** (14-16 mai 2026) — (a) Onglet "Par pôle" : matrice métiers × jours, badge nb personnes, hover popover vignettes, badge `PRÉV` pour 9XXX, RPC `staffing_par_pole_jours`, teinte ambrée 9XXX sur Par chantier existant. (b) Refonte navigation : 3 onglets sortis du planning vers routes natives (`/logistique/vehicules-planning`, `/affaires/budget-planning`, `/export/feuille-de-route`). Planning recentré à 5 onglets staffing. Redirects SPA depuis anciens `?tab=`. Sidebar mise à jour.

### Livré v0.52 — Refonte page d'accueil employés
64bis. ✅ **v0.52** (30 mai 2026) — Refonte `/aujourdhui` employés : `EmployeAujourdhuiView` (490 l) branché cap-driven sur `_app.index.tsx` (home `/`) si pas `dashboard.team.view`. 3 blocs : Mon planning semaine (7 jours AM/PM + Sheet « Mon équipe sur ce chantier » au clic), Mes heures (compteur 39h + saisir + historique), Mon atelier (masqué auto si 0 objet). 3 server fns `getMonPlanningSemaine` / `getMonEquipeChantier` / `getMesObjetsAtelier`. Alias route `/aujourdhui` → `/` pour bookmarks externes. Test `e2e/aujourdhui-multirole.spec.ts`. Voir mem://features/aujourdhui-employe-v052.


### Livré Bloc 8 — Fiche Objet enrichie (mai 2026)
65. ✅ **8.1** (23 mai 2026) — Fondations data : vue matérialisée `v_objet_heures_consolidees` (réel uniquement) + 4 capabilities (`objet.view/edit/team.manage/photo.upload`) + flag `fiche_objet_v1` + SF `getObjetTeam` / `assignPersonneToObjetStep`. Helpers testables (15 tests Vitest).
66. ✅ **8.2** (23 mai 2026) — Route `/affaires/$id/objets/$objetId` + page `FicheObjetPage` + `ObjetIdentiteSection` (read/edit) + `ObjetHeuresTable` (Prévu/Planifié/Réel/Écart). Lien temporaire depuis `/affaires/$id/fabrication` (desktop + mobile) gated par flag+cap.
67. ✅ **8.2c** (24 mai 2026) — 5 corrections polish : heures dé-dupliquées (retrait bloc devis de l'identité), algo écart corrigé (10 cas testés), 5 nouveaux champs DB (dimensions + matériaux + finition), matrice permissions étendue, bouton "Fiche" plus visible.
68. ✅ **8.3b** (24 mai 2026) — Mutations équipe : `AddPersonneDialog` + `RemovePersonneDialog` + SF `autoStaffObjet`/`addPersonneToObjet`/`removePersonneFromObjet`. **HOTFIX** : mutations autorisées sur `plan_status IN ('draft','published')` (bloquées seulement sur `no_plan`). Mini-warning amber sur draft. 2 dettes tracées (rename SF + specs E2E).
69. ✅ **8.4 DB** (24 mai 2026) — Journal & Photos : table `objet_journal_events` (13 types d'événements) + `objet_commentaires` (CRD, pas d'édition) + `fabrication_objets_photos` enrichie (`affaire_id`, `etape_id`, `thumb_path`, dimensions) + 6 triggers auto-log (étapes, identité, commentaires, photos, staffing, plan republication) + backfill `journal_started`. Cap `objet.photo.delete` admin uniquement.

### Livré Sprint D Casting — Refonte modèle équipes 3 niveaux (mai 2026)
70. ✅ **v0.34.x** (13 mai 2026) — Battery role-smoke E2E livrée : 4 specs (admin 45 / chef 24+8 / employé desktop 7+20 / employé mobile 8+13) anti-fuite RGPD. Helper `e2e/helpers/role-smoke.ts`.
71. ✅ **Sprint D Batch 1** (12 mai 2026) — Typologie phases (`type_affaire.typologie_phase`) + alertes équipe opt-in (`affaire_alertes_optin`) + widget capacité casting.
72. ✅ **Sprint D Batch 2** (13 mai 2026) — Phase logistique dans `affaire_equipe.phase` + casting 5 phases + FAB_SOUS_ETAPES 3 sous-blocs + FAB_METIERS 6 métiers + opt-in alertes UI.
73. ✅ **Sprint D Batch 3** (14 mai 2026) — Planning chantier macro Gantt (7 phases + jalons + sous-blocs fab 7 métiers incl. BE + Impression UV + dates fallback + badges gris).
74. ✅ **Sprint D Batch 4** (15 mai 2026) — 4 specs E2E (casting-capacite / inbox-alertes / planning-macro / staffing-rename) + récap final. 0 régression.

### Livré Batch 9.7 — Mobile Wiring & Role Sync (v0.49, mai 2026)
75. ✅ **Batch 9.7 P1** (25 mai 2026) — AppRole étendu : 6 rôles Sprint A typés front (commercial, bureau_etude, atelier_chef, atelier_metier, logistique, poseur) + helpers isXxx + labels + ROLE_PRESETS + USER_ROLE_OPTIONS.
76. ✅ **Batch 9.7 P2+P3** (25 mai 2026) — Câblage nav mobile : onglet "Équipe" employé `/mobile/equipe-chantiers` + onglet "Missions" chef `/mobile/mes-missions`.
77. ✅ **Batch 9.7 P4** (25 mai 2026) — Nettoyage 3 routes orphelines supprimées (`/mobile/mois`, `/mobile/chef/fabrication`, `/mobile/chef/staffer`). E2E ajustés. Dettes orphelines tracées.

### Livré Lot L2 — Seed matrice capabilities définitif (26 mai 2026)
78. ✅ **L2** (26 mai 2026) — Enum `chef_pose` + 59 capabilities seedées DB avec `scope` (all/team/metier/own/none). Helpers SQL `user_has_cap`/`user_cap_scope`. Catalogue front `src/lib/capabilities/catalog.ts` + integrity tests. Page `/admin/permissions` 12 colonnes. Backfill `chef_metier_scoped` → `atelier_chef`.

### Livré Bloc 10 — Fiche opportunité (28 mai 2026)
79. ✅ **10.1 Fondations DB** (28 mai 2026) — Tables `opportunite_actions` + `opportunite_jalons` (pipeline 4 étapes), enum `opp_action_type` (10 types), RPC `sign_opportunite` atomique 9XXX→5XXX avec advisory lock + 4 caps + RLS. Seed 784 jalons (196 opps × 4). Voir mem://features/bloc-10-1-fondations-db.
80. ✅ **10.2 Inbox extension + Cleanup Risque #1** (28 mai 2026) — Colonne `archived_at` + index + RPC `archive_affaire`. 196 opps legacy archivées (191 sans CA + 5 test). Extension `get_inbox_items` source `opp_action` cap-gated (`inbox.opp_action`). Test pgTAP 3 assertions.
81. ✅ **10.3 Fiche UI** (28 mai 2026) — Route `/opportunites/$affaireId`, 3 composants extraits (`OpportuniteFicheHeader`, `OpportuniteJalonsBar`, `OpportuniteNextActionCard`) + sections inlinées. 1 server fn file avec 4 fns. Nav câblée Kanban+Tableur. Tests E2E+Vitest. Voir mem://features/bloc-10-3-fiche-ui.
82. ✅ **10.4 Listing refactor + import** (28 mai 2026) — RPC `list_opportunites_active()` agrégé (prochaine action / dernier jalon / compteur actions) avec 3 index d'optimisation. Colonnes Kanban (badge urgence) + Tableur (3 colonnes). Filtres header URL-persistés (`actionsDues`, `noCa` admin-only). Dashboard `PipelineCommercialBloc` badges urgence. EXPLAIN ANALYZE ~48ms < 100ms.
82bis. ✅ **10.5 Tests + cleanup final** (28 mai 2026) — E2E `scenario-complet.admin.spec.ts` (parcours admin bout-en-bout) + 12 assertions Vitest sur 4 SF (input validation 3 cas × 4 fns) + memory récap globale `mem://features/bloc-10-fiche-opportunite`. Dette `inbox-opp-action-create-table` marquée RÉSOLUE (cap câblée en 10.2).

### Livré Lot L3b2 + L5-A + L4c — Refonte permissions & cleanup (28 mai 2026)
83. ✅ **L3b2-A** — Groupe Paramètres + Admin : sous-traitants, compétences, employés-poste-principal, contrats, postes, métiers (resserrement chef→admin only flaggé).
84. ✅ **L3b2-B** — Groupe Devis + Imports (6 fichiers) : `_app.devis.{rattachement-historique,index,import,historique}.tsx`, `_app.opportunites.import.tsx`, `_app.employes.import.tsx`. Caps : `section.devis`, `action.create_devis`, `section.admin` pour suppression.
85. ✅ **L3b2-C** — Groupe Affaires + Staffing (5 fichiers) : `_app.affaires.{index,$affaireId,$affaireId.index}.tsx`, `_app.staffing.$planId.tsx`, `_app.charge-atelier.tsx`. Suppression flags legacy `isAdmin|isChef…` au profit de `requireCapability()`.
86. ✅ **Sidebar cleanup + test cohérence** — Items stubs « Ma semaine » et « Tableau de bord » retirés de `AppSidebar.tsx`. Test garde cohérence sidebar ↔ routes (`src/lib/__tests__/sidebar-cap-coherence.test.ts`, 2 tests). 4 mismatches résolus (`/rh`, `/rh/contrats`, `/admin/permissions`, `/admin/feature-flags`).
87. ✅ **L5-A safe** — Suppression rôle `chef_metier_scoped` côté code applicatif (44 lignes orphelines `role_capabilities`, cleanup ~10 fichiers TS, suppression `use-chef-scope.ts` + `ScopedAccessBanner.tsx`, adaptation routes `validation-heures` + `affaires.index`). Flag `sidebar_capability_v1` confirmé actif globalement.
88. ✅ **L5-A-bis Phase 1** — Retrait applicatif complet `chef_metier_scoped` côté DB : DROP 14 policies + recréation sans branche `is_chef_metier_scoped()`, DROP helpers `is_chef_metier_scoped()` + `is_chef_metier_scoped_for_employe(uuid)`, simplification `is_chef_or_admin()` + `replace_user_roles()`. Phase 2 (DROP valeur enum) reportée — impact runtime nul.
89. ✅ **L4c** — Cleanup stubs routes orphelines + commentaires obsolètes (`RoleGuard.tsx`, `_app.audit-heures.tsx`, test fixtures `auth-redirect-helpers.test.ts`). 35/35 tests verts.

### Roadmap — À venir
90. ⏳ **8.4 UI** (~8h) — Server functions (signed URLs, upload, aggregation journal) + composant `ObjetJournalPhotos` (onglet Journal : timeline filtrable + commentaires + upload WebP compressé + galerie par étape + lazy IntersectionObserver).
91. ⏳ **8.5** (~4h) — Liens croisés : remplacer lien temporaire 8.2b par navigation intégrée native (Gantt → fiche objet, Planning → fiche objet, Devis ligne → fiche objet, Kanban étape → fiche objet). Choix drawer vs nav à trancher.
92. ⏳ **8.6** (~8h) — Polish + responsive 380px + E2E 8.3b (13 scénarios) + E2E 8.4 + 3 dettes (rename SF `loadActiveStepsForObjet`, Sheet vs Dialog AddPersonne, édition commentaire).

### Bloc 9 — Carte mission pose (en cours, ~30h)
93. ✅ **9.1 Fondations DB** (26 mai 2026) — Table `mission_events` + enum + RLS self (Q2) + 5 colonnes infos terrain `affaires` + enum `notification_type` += `mission_probleme` + 2 capabilities + matrice rôles. 3 SF `getMesMissions`/`getCarteMission`/`recordMissionEvent`. Fallback notif chef via table `notifications`. Voir mem://features/bloc-9-carte-mission-pose.
94. ✅ **9.2 Liste `/mobile/mes-missions`** (~3-4h) — Filtres Cette semaine / Suivante / Passées. Livrée, testée par Gabin.
95. ✅ **9.6 bis** (26 mai 2026) — Navigation mobile + équipe chantiers + masquage role_terrain (validé par Gabin). Inclut wiring nav employé/chef + routes cleanup Batch 9.7.
96. ⏳ **9.3 Carte détaillée `/mobile/mission/$id`** (~5-6h) — hero countdown + GPS + tel + sections accès/équipe/historique events.
97. ⏳ **9.4 Heures auto + photos** (~5-7h) — pré-remplissage depuis events arrivee/depart + auto-tag photos.
98. ⏳ **9.5 Signaler problème + 7 specs E2E** (~5-7h) — bouton signaler → recordMissionEvent(probleme) + notif chef + 7e spec multi-mission/jour.

### Bloc 10 — Fiche opportunité (reste ~15h, 10.1→10.5 livrés le 28 mai)
99. ⏳ **10.5 Visites chantier** (~5h) — Table `affaires_visites` + CRUD + UI + storage photos. Reporté depuis 10.3.
100. ⏳ **10.6 Échantillons matériaux** (~4h) — Table `affaires_echantillons` + CRUD + UI.
101. ⏳ **10.7 Moodboard / artefacts** (~5h) — Réutilisation `affaire_documents` catégories `moodboard|esquisse_commerciale` + galerie.
102. ⏳ **10.8 Enrichissement signature** (~3h) — Notification `atelier_chef` + log journal affaire dans RPC `sign_opportunite`.
103. ⏳ **10.9 Mobile nouvelle visite** (~4h) — Formulaire terrain + photos + compte-rendu (optionnel V2).
104. ⏳ **10.10 Tests E2E complets** (~4h) — Visite + échantillon + transfert 5XXX + vérification notif.

### Lots L3 → L5 (suite refonte permissions)
105. ⏳ **L3 restant** — L3.0 `/parametres/utilisateurs` multi-select 11 rôles + caps debug panel (~4h), L3.1 double-filtre fab `casting.edit_phase_fabrication` (~1h), L3.2-L3.5 suite refacto `isAdmin/isChef` → `user_has_cap()` call sites restants (~10-15h). ~15-20h total (L3b2 livré).
106. ⏳ **L4** — Seed data capabilities + MobileBottomNav adaptative unique (1 nav, pas 2).
107. ⏳ **L5-B** — Nettoyage bridge layer complet `isAdmin/isChef` dans `auth-context.tsx` + règle ESLint anti-régression + 11 specs E2E par rôle + seed users test.

### Backlog (non planifié)
108. ⏸️ **v0.40 Phase 2** — Horaires précis SILAE (heure_debut/fin/pauses + nuit/sup/35h auto) — SUSPENDU.
109. ⏸️ **v0.41** — Claude API auto-staffing UNIQUEMENT 5XXX (proxy + skill + tools + fallback v0.35 + cache + cap + télémétrie). Tier CDI/CDD avant intérim. Utilisera `affaire_equipe_historique` comme feature store contextuel.
110. ⏸️ **Centre Analyse Heures** — Onglet consolidé heures + 8 filtres + exports (`v0.47` BACKLOG).
111. ⏸️ **Logistique avancée** — Autorisations véhicules #56 + sous-traitants + historique + stats (`Sprint 3b` BACKLOG).
112. ⏸️ **Sprint dette résiduelle v0.36** — Page admin véhicules + audit findings (BACKLOG).

## Memories
- [Aujourd'hui employé v0.52](mem://features/aujourdhui-employe-v052) — 30 mai 2026, refonte `/aujourdhui` employés branchée sur `/` via cap-driven routing, 3 blocs + alias redirect
- [Marge chantier Option A standalone](mem://features/marge-chantier-option-a) — 30 mai 2026, /admin/marge-chantier 8 onglets, engine.ts intouchable, localStorage par admin, 2 E2E. Phases 2→4 (bridges employés/devis/heures) toujours différées.

- [Marge chantier Phase 5 LIVRÉE](mem://features/marge-chantier-phase-5-livree) — 30 mai 2026, table marge_chantier_workspace JSONB + RLS user-scoped + storage.ts async + debounce 2s + SyncBadge + migration auto localStorage → Supabase + 2 E2E sync.
- [Bloc 10 — Fiche opportunité (récap global 10.1→10.5)](mem://features/bloc-10-fiche-opportunite) — 28 mai 2026, phase 'opportunite' sur affaires, RPC sign_opportunite, 5 caps, 196 opps archivées, 12 Vitest + 2 E2E + 3 pgTAP
- [Bloc 10.4 Listing refactor opportunités](mem://features/bloc-10-4-listing-refactor) — 28 mai 2026, RPC list_opportunites_active() + badges urgence + filtres URL + EXPLAIN ~48ms
- [Bloc 10.3 Fiche opportunité UI](mem://features/bloc-10-3-fiche-ui) — route /opportunites/$affaireId, 3 composants extraits + 1 server fn (4 fns), nav câblée Kanban+Tableur
- [Bloc 10.2 Inbox extension + Cleanup Risque #1](mem://features/bloc-10-2-inbox-extension) — 28 mai 2026, colonne archived_at + archivage 196 opps legacy + get_inbox_items source opp_action cap-gated + pgTAP 3 assertions
- [Bloc 10.1 Fondations DB opportunités](mem://features/bloc-10-1-fondations-db) — 28 mai 2026, tables opportunite_actions + opportunite_jalons, RPC sign_opportunite atomique 9XXX→5XXX, 4 caps, seed 784 jalons. Risque #1 RÉSOLU : 196 opps archivées (191 sans CA + 5 test)
- [L5-B bridge auth-context purgé](mem://constraints/auth-context-no-role-bridge) — 28 mai 2026, ESLint no-restricted-syntax verrouille toute réintroduction de isAdmin/isChef/... sur useAuth()
- [L5-B clôture — 11 comptes E2E + 4 sidebar specs](mem://debts/e2e-seed-passwords-strategy) — 28 mai 2026, ajout rh/atelier_metier/logistique/poseur dans test-accounts.ts + seed.ts + 4 specs sidebar-capability + projects Playwright. Choix : seed reste TS (service role) — seed.test.sql SQL pur impossible sans bcrypt côté serveur (dette tracée).
- [L4d cleanup final](mem://features/l4d-cleanup-final) — v0.50 suppression 20 stubs mobile + nav legacy + ViewAsSwitcher + effIsMobile + migration /parametres/utilisateurs → /admin/utilisateurs
- [Centre d'analyse heures](mem://features/centre-analyse-heures) — BACKLOG : onglet consolidé heures + 8 filtres + exports
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
- [Historique équipe par chantier](mem://features/affaire-equipe-historique) — v0.45 table + RPC + widget
- [Dashboard widgets sympa](mem://features/dashboard-widgets-sympa) — v0.40.x Phases 1-3 livrées (5/6), Quiz à venir
- [Sprint 3 features v0.41](mem://features/sprint-3-features-v041) — v0.41.0a hotfix heures invisibles employé
- [Sécurité v0.21.1](mem://features/securite-v0211) — RoleGuard + RLS heures_saisies durci + UNIQUE INDEX chef_jour
- [Auth flow différencié rôle](mem://features/auth-flow-roles) — magic link + set-password
- [E2E Playwright coverage](mem://features/e2e-playwright-coverage) — v0.34
- [Sprint 1 stabilité v0.39.1](mem://features/sprint-1-stabilite-v0391) — RLS audit + 2 E2E + audit mutations + auth shallow
- [Sprint 1 Hub Chef Mobile v0.43](mem://features/sprint-1-hub-chef-mobile) — 5 onglets mobile + audit trail validations + scope app-side
- [Documents/Photos par affaire v0.44](mem://features/affaire-documents) — bucket privé + RLS scope chef + galerie desktop/mobile + caméra native
- [Audit technique v0.43-v0.44](docs/audit-v0.43-v0.44.md) — 10 mai 2026, verdict 🟡, top 5 actions ~11h, déclencheur sprints v0.44.3/v0.44.4
- [Planning par pôle consolidé v0.48](mem://features/planning-par-pole-v048) — matrice métiers × jours + popover hover + refonte nav 3 routes extraites
- [Fiche Objet — Lot 8.1](mem://features/fiche-objet) — MV v_objet_heures_consolidees (réel) + 4 caps + flag fiche_objet_v1 + getObjetTeam/assignPersonneToObjetStep
- [Dette : RLS bypass BE objet.edit](mem://constraints/rls-bypass-bureau-etude-objet-edit) — BE peut UPDATE tout via API directe ; UI cache mais ne protège pas. Trigger ou split server fn à prévoir.
- [Fiche objet — section Équipe affectée](mem://features/fiche-objet-equipe) — règles draft/published, préférence published, manual_assignment_origin='fiche_objet'
- [Dette : renommer loadPublishedStepsForObjet](mem://debts/load-active-steps-for-objet-rename) — charge draft+published depuis hotfix v8.3 ; renommer en loadActiveStepsForObjet au Lot 8.6
- [Dette : Dialog vs Sheet AddPersonne](mem://debts/equipe-add-personne-dialog-vs-sheet) — AddPersonneDialog (modal centré) à migrer en Sheet latérale au Lot 8.6
- [Dette : Specs E2E 8.3b — scénario #11 révisé + #11bis](mem://debts/e2e-specs-83b-scenario-11-revision) — 13 scénarios au lieu de 12 (no_plan + draft)
- [Bloc 9 — Carte mission pose](mem://features/bloc-9-carte-mission-pose) — 9.1 fondations DB livré (mission_events + 5 colonnes infos terrain + 3 server fns + fallback notif via notifications existante)
- [Bloc 10 — Fiche opportunité analyse](mem://features/bloc-10-fiche-opportunite-analyse) — note pré-implémentation : DB existante (phase/statut_opportunite/code_opportunite/typologie_future…) à enrichir 5 champs + 2 tables `affaires_visites/echantillons` (artefacts → réutilise `affaire_documents.categorie`), 11 lots ~38h sans mobile / 42h avec, RPC `sign_opportunite` à enrichir notif `atelier_chef`
- [Dette : AppRole TS incomplet (résolu)](mem://debts/types-app-role-incomplet) — Sprint A 6 rôles désormais typés front (v0.49 Batch 9.7)
- [Dette : Routes mobile orphelines (résolu)](mem://debts/routes-mobile-orphelines) — 3 routes supprimées v0.49 Batch 9.7 P4 (/mobile/mois, /mobile/chef/fabrication stub, /mobile/chef/staffer doublon)
- [Dette : Mobile fabrication atelier à livrer en L4](mem://debts/mobile-fabrication-a-livrer-en-L4) — remplacement propre du stub via cap `mobile.fabrication_atelier`
- [Dette : Fiche affaire mobile à enrichir en L4](mem://debts/mobile-fiche-affaire-a-enrichir-en-L4) — gallery seul en V1, sections gated par caps en L4
- [Lot L2 — Seed matrice capabilities](mem://features/lot-l2-seed-capabilities) — 59 caps DB + helpers SQL + catalogue front + integrity tests + backfill atelier_chef (26 mai 2026)
- [Batch 9.7 — Mobile wiring & role sync](mem://features/batch-97-mobile-wiring) — AppRole 11 rôles + nav employé/chef + cleanup routes orphelines (25-26 mai 2026)
- [Lot L3 — Refonte permissions](mem://features/lot-l3-refonte-permissions) — Audit terminé 26/05. L3.0 users multi-select + L3.1 fab filter + L3.2-5 refacto isAdmin/isChef → user_has_cap(). ~30-40h
- [Lot L3b2 — Migration routes capability-driven](mem://features/lot-l3b2-migration-routes) — L3b2-A/B/C + sidebar cleanup + test cohérence + L5-A safe + L5-A-bis Phase 1 + L4c. Livré 28 mai 2026.
- [L5-A safe — Suppression chef_metier_scoped code](mem://constraints/auth-context-no-role-bridge) — 44 lignes role_capabilities, cleanup ~10 fichiers TS, suppression use-chef-scope + ScopedAccessBanner. Voir aussi mem://debts/e2e-seed-passwords-strategy.
- [L5-A-bis Phase 1 — DROP DB chef_metier_scoped](mem://features/l5a-bis-phase1-db-cleanup) — DROP 14 policies + 2 helpers SQL, simplification is_chef_or_admin() + replace_user_roles(). 28 mai 2026.
- [L4c — Cleanup stubs routes orphelines](mem://features/l4c-cleanup-stubs) — Commentaires obsolètes RoleGuard + audit-heures + fixtures tests. 35/35 verts. 28 mai 2026.
- [Dette : Scope UI admin permissions](mem://debts/l2-scope-ui-admin-permissions) — Édition du champ `scope` (all/team/metier/own/none) non supportée dans `/admin/permissions` UI. Attend L3.
- [Dette : Users multi-select /parametres/utilisateurs](mem://debts/users-multi-select-parametres) — UI mono-select 3 rôles vs DB multi 11 rôles. Verrou critique résolu par L3.0.
- [L4b — Sidebar unique cap-driven](mem://features/l4b-sidebar-unique) — AppSidebar refondu 7 sections (Mon poste/Pilotage/Production/Logistique/Équipes/RH/Admin), "Aujourd'hui" toujours visible, drawer auto sur mobile via shadcn Sidebar
