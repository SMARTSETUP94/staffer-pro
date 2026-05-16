# Roadmap consolidée — Setup Paris Staffing

Dernière mise à jour : 16 mai 2026 (v0.48 livré).

## Livré

### v0.27 → v0.30 — Socle planning + RLS + cascade devis
1. **v0.27.0 → v0.29.2** — Refonte planning 3 vues, dashboard role guard, route /ma-semaine, vue tableur opportunités, suppression opportunité, bulk staffing objet, typologie future signature, compteurs typologie actifs.
2. **v0.29.3** — Fusion Audit Auth + Incident Auth (4 onglets) + Export Excel Planning CDI/Intérim/Budget (981 tests).
3. **v0.30.0** — Sprint dette J1 : audit helpers RLS + 48 SECURITY DEFINER catégorisés + UNIQUE indexes (992 tests).
4. **v0.30.1** — Sprint dette J2 : dedup xlsx (-1 package) + lazy-load Planning Excel (998 tests).
5. **v0.30.2** — Hotfix onboarding boucle infinie (AppGuard idempotent, ignore TOKEN_REFRESHED) (1004 tests).
6. **v0.30.3** — UX import devis Progbat : Client/Lieu éditables sur affaire existante + UPDATE affaire après RPC.
7. **v0.30.4** — Mode upsert import devis (option C) : ré-import même hash → UPDATE devis + cascade replace (1014 tests).
8. **v0.30.5** — Assouplissement upsert : garde-fous heures réelles et devis terminé levés (1017 tests).
9. **v0.30.6** — SOFT total : 0 garde-fou SQL bloquant. RPC `preflight_import_devis` + modale client (1022 tests).

### v0.31 → v0.32 — Cascade delete + validation imports
10. **v0.31.0** — Suppression cascade devis sur /devis/historique : bouton Trash + modale décompte + RPC atomique. Audit log `devis_deletion_log`.
11. **v0.31.1** — Bouton Trash cascade ajouté sur l'onglet Devis affaire (/affaires/$id/devis) (1025 tests).
12. **v0.31.2** — HOTFIX import : UNIQUE(reference) → UNIQUE(affaire_id, reference) sur fabrication_objets.
13. **v0.31.4 → v0.31.4d** — Refonte parser Progbat 3 niveaux + modale UI hiérarchique + section quantité multiplicateur + édition manuelle.
14. **v0.31.5 HOTFIX + SPRINT CLÔTURE** (2 mai 2026) — Bug parser 2141 + #112 Lieu/Client + #113 patterns Logistique + #105 Excel "Par chantier" + v0.32.4 polish auto-saisie hors-planning. 1234 tests.
15. **v0.32.1** — Validation imports : sommes lignes (qte×PU vs total) + cohérence totaux métier.
16. **v0.32.2** — Validation imports : cohérence heures parsées vs UI par objet × métier.
17. **v0.32.3** — Auto-saisie heures hors planning : migration `metier_id` + RPC + helpers + dialog + bouton "+ Autre chantier" + badge (1081 tests).
18. **v0.32.4** — Polish auto-saisie hors-planning + DATE_FUTURE.
19. **HOTFIX auth invitation** — CONFIG : `mailer_otp_exp` 24h → 7j.

### v0.33 — Vue Tableur Feuille de Route
20. **v0.33** — Vue Tableur Feuille de Route Planning.

### v0.35 — Auto-staffing Fabrication 5XXX (sprint complet)
21. **v0.35.0 → v0.35.6** — DB + algo backward planning + multi-chantiers + UI Gantt + Charge atelier + StaffingPersonnesSection tier-based + Wizard intégré + Anti-duplication + Publication+versioning+restore + Audit sécu + 10 specs E2E + docs.
22. **v0.35.7** — Polish itératif : batch edit-store autosave 2min, BE/Num par objet, Num mono-CNC HARD, ResolveCncConflictDialog, page /parametres/competences-equipe, suppression HARD plan admin.
23. **v0.35.8** — Jours ouvrés FR + absences validées dans algo.
24. **v0.35.9** — Ctrl+S kbd, ring Gantt edits locaux, Précédent wizard, compteur pers·j, confirmation rapide.
25. **v0.35.10** — Undo Ctrl+Z 50 niveaux + drag-to-shift snap jour + bulk pers Bois/Peint.
26. **v0.35.11** — Express Mode (createPlanExpress + split-button + bandeau sticky 1-2 clics).
27. **v0.35.12** — Refonte StaffingPersonnesSection (tabs métier + Liste/Calendrier + hide full + badges absences).
28. **v0.35.13** — Stabilité Gantt (silent reload + scroll restore + mini-dates contextuelles + reorder Heatmap).
29. **v0.35.14** — Compétences 4 niveaux (P/S/D/X enum + tier-ranking refondu Tier1/2/3/4). **PUBLISHABLE.**

### v0.38 — Demi-journée
30. **v0.38.0-alpha** — Migration `span_demi_jours` + `start_half_day` + algo FLOOR strict.
31. **v0.38.1a** — Algo binôme MIN flex + VolumeCard + snapshot/restore demi-journée.
32. **v0.38.1b** — Gantt grille AM|PM (`220px repeat(days*2)`).
33. **v0.38.1.1** — Sync StaffingPersonnesSection demi-journée.
34. **v0.38.2** — UX polish Gantt (overflow label `•••` + ChargeMetierSection drilldown + chevron persist).

### v0.39 — Vue 3 + hotfixes KPI + Sprint 1 stabilité
35. **v0.39.0a/b/c/d** (4 mai 2026) — Vue 3 + KPI "Heures staffées" auditable + garde-fou volume + alerte `VOLUME_ECART_DEVIS` + teinte 9XXX Par chantier.
36. **v0.39.0a-hotfix-import** (4 mai 2026) — RPC transactionnel `import_progbat_atomique` + `cleanup_fabrication_orphelins` + cleanup 13 orphelins prod.
37. **v0.39.1 Sprint 1 STABILITÉ** (4 mai 2026) — Audit RLS heures_saisies + matrice `docs/rls-policies.md` + 2 E2E + audit mutations client + auth-context shallow setSession.

### v0.39.2 — Sprint 2 polish Gantt + Personnes
38. **v0.39.2a** (4 mai 2026) — `CellEditPopover` + `DurationStepper` ; Vue 1 isolée, Vue 2 cascade aval. Algo `greedy-allocate.ts` + 5 tests. E2E `import-progbat-conflicts.chef.spec.ts`.
39. **v0.39.2b1** (4 mai 2026) — Greedy UI branché dans `EquipeAffaireSection`. Doc RLS enrichie + `CONTRIBUTING.md`.
40. **v0.39.2b2** (5 mai 2026) — Extraction composants Gantt (GanttHeaderRow, StatCard, DayGrid, ObjetRowInteractif). Refonte `StaffingPersonnesSection` 1214L → 322L. **1404/1404 verts.**

### v0.40 — Refonte Manut + Suivi marge
41. **v0.40.0a/b** (5 mai 2026) — Algo absorption Manut Bois/Peint/Tap au prorata + UI Gantt nettoyée + pré-param 6 lignes + E2E `manut-refonte-v040.chef.spec.ts` + `ManutStatCard`. **1372/1372 verts.**
42. **v0.40.0e** (5 mai 2026) — Consolidation "Suivi marge par métier" en treetable (1 ligne par métier + drilldown par devis). Lib `affaire-marge-consolidation.ts` + 7 tests.
43. **Hotfixes v0.40** — Prefill numéro affaire (race condition fix) + noms objets Plan staffing (`<ObjetRefLabel />`).

### v0.41.0a — Hotfix heures invisibles employé
44. **v0.41.0a** (5 mai 2026) — BUG #33 heures invisibles côté employé : `use-mes-heures` deps `useMemo` rows complétées + refetch sur `visibilitychange`+`focus`. **1407/1407 verts.**

### v0.42 — Module Template Contrat CDDU
45. **v0.42.0** (10 mai 2026) — Module Template Contrat CDDU + paramètres entreprise + hotfixes signature.
46. **v0.42.1** (10 mai 2026) — Template v2.1 (layout H1, CGE 2 pages, placeholder `{{poste}}`) + catalogue postes (`postes_catalogue` 8 postes seed) + page `/parametres/postes` CRUD + suppression définitive admin contrats (cascade signatures).
47. **v0.42.2** (10 mai 2026) — Refacto `{{poste}}` → `employes.poste_principal` + page admin `/admin/employes-poste-principal` (saisie en lot 162 fiches, suggestions, autosave) + export/import Excel postes + validation E2E template (`TemplateTestDialog` 5 fixtures + checklist 15 sections).

### v0.43 — Hub Chef Mobile (Sprint 1)
48. **v0.43.0/1** (10 mai 2026) — 5 onglets (Dashboard/Planning/Équipe/À valider/Moi), badges multi-rôles, scope dur StafferMobileForm via `mes_affaires_chef`, 7 specs E2E.

### v0.44 — Documents/Photos + Refonte Atelier + Audit
49. **v0.44.0** (10 mai 2026) — Bucket privé `affaires-photos` + table `affaire_documents` (soft delete) + RLS scopée chef + galerie desktop/mobile + caméra native + compression JPEG + lightbox + 3 E2E.
50. **v0.44.1** (10 mai 2026) — Refonte UX Hub Chef Mobile : ValiderHeures déplacé, "À valider" → "Atelier", 3 sous-tabs Atelier (Objets fab + Kanban + Photos par objet), migration `objet_id` FK nullable.
51. **v0.44.2** (10 mai 2026) — Polish : redirect `/mobile/chef/a-valider` → `/atelier`, 5 KPI cards dashboard mobile, Kanban Vue chantier (badges, empty states, tri, filtres persistés, animations, badge "Retard"), 6 specs E2E.
52. **Audit v0.43-v0.44** (10 mai 2026) — 7 angles (sécu/perf/qualité/DB/UX-A11Y/métier/doc). Verdict 🟡. Top 5 actions ~11h.
53. **v0.44.3** (10 mai 2026, ~7h) — Top 3 audit : `ScopedAccessBanner` + 3 triggers business + soft-delete audit trail + page `/admin/audit` + pgTAP 8/8.
54. **v0.44.4** (10 mai 2026, ~4h) — Top 5 audit : Batch signed URLs + `DocumentThumbnail` lazy + `formatBusinessError` mapper + 3 ADRs + seed E2E `chef_metier_scoped`.
55. **v0.44.5** (10 mai 2026, ~1h) — Bloc 🟠 : RLS `affaire_documents_select` masque soft-deleted + trigger `enforce_signed_at_server_side` + `formatBusinessError` câblé dans 3 composants.
56. **v0.44.6** (10 mai 2026, ~1h) — Bloc 🟡 clôture : ADR-004 convention `DROP POLICY IF EXISTS` + `docs/db-schema.md` index 60+ tables + Audit TTL signed URLs + états vides vérifiés.
57. **v0.44.7** (10 mai 2026, ~30min) — Filtrage UI `chef_metier_scoped` : toggle "Mes chantiers uniquement" sur `/affaires` et `/validation-heures` via `useMesAffairesChefIds`. `/audit-heures` reste admin-only.

### v0.45 — Historique équipes par chantier
58. **v0.45.0** (11 mai 2026) — Table `affaire_equipe_historique` agrégée (1 ligne par affaire×chef×employé) alimentée par triggers temps réel sur `assignations` + `affaires`. RPC `get_mon_equipe_type` (score = nb_chantiers×2 + ln(½j+1)×3 + bonus fraîcheur, contextuel par typologie). Widget dashboard "Mon équipe type" whitelist chef/admin (top 8 sur 12 mois). Backfill initial inclus. Feature store pour future IA v0.41.
59. **v0.45.1** (11 mai 2026) — Page détaillée `/mon-equipe-type` (top 50, filtres typologie + période 3/6/12/24/60 mois, KPI agrégés, drilldown Sheet par coéquipier listant tous les chantiers partagés avec lien vers fiche affaire). Widget pointe vers cette page.

### v0.46 — Création comptes (invitations admin)
60. **v0.46** (11-13 mai 2026) — Self-signup DÉSACTIVÉ (Supabase + UI). Invitations admin → défaut `chef_chantier`. Employés via fiche `employes` + auto-link email. Onboarding redirige vers `/` (pas `/dashboard`) pour routing role-aware.

### v0.47 — Routing + Métiers/Postes hub
61. **v0.47.1** (13 mai 2026) — Routing post-login centralisé : module unique `src/lib/post-login-routing.ts` (`resolvePostLoginTarget` + `checkMobileChefAccessForAdmin`).
62. **v0.47.3** (13 mai 2026) — 4 surfaces unifiées via bandeau `MetiersPostesTabs` (Métiers / Postes contractuels / Postes principaux / Compétences équipe), sidebar consolidée à 1 entrée.

### v0.34.x — Battery role-smoke E2E
63. **v0.34.x** (13 mai 2026) — Battery role-smoke E2E livrée : 4 specs (admin 45 routes / chef 24+8 / employé desktop 7+20 / employé mobile 8+13) avec garde-fou anti-fuite RGPD. Helper `e2e/helpers/role-smoke.ts`.

### v0.48 — Planning par pôle + Refonte navigation
64. **v0.48** (14-16 mai 2026) — (a) Onglet "Par pôle" : matrice métiers × jours, badge nb personnes, hover popover vignettes, badge `PRÉV` pour 9XXX, RPC `staffing_par_pole_jours`, teinte ambrée 9XXX sur Par chantier existant. (b) Refonte navigation : 3 onglets sortis du planning vers routes natives (`/logistique/vehicules-planning`, `/affaires/budget-planning`, `/export/feuille-de-route`). Planning recentré à 5 onglets staffing. Redirects SPA depuis anciens `?tab=`. Sidebar mise à jour.

---

## À venir

| # | Sprint | Description | Statut |
|---|--------|-------------|--------|
| 65 | **v0.45 RLS hardening DB (suite)** | pgTAP CI sur `mes_affaires_chef` + policies DB scopées heures/assignations/docs/photos + E2E isolement chef scopé. UI `ScopedAccessBanner` reste en attente depuis v0.44.3. | ⏳ **PROCHAIN** |
| 66 | **v0.36** — Dette résiduelle | Page admin véhicules + audit findings résiduels. | ⏳ |
| 67 | **v0.37** — Polish UX transversal | Post-feedback terrain : quick wins UX/UI. | ⏳ |
| 68 | **Sprint 3c** — E2E full role-based | Employé desktop + mobile coverage complète. | ⏳ |
| 69 | **v0.39.3** — Migration RPC | RPC #1/2/3/5 : bulk-assign-objet, chef-saisit-pour-employe, bulk-saisie, bulk-staffer. | ⏳ |
| 70 | **Sprint 3b** — Logistique avancée | Autorisations véhicules #56 + sous-traitants + historique + stats. | ⏳ |
| 71 | **v0.20.1** — Quick wins | Pré-remplissage trajet sous-traité + cache `useObjetsAffaireLight` + notification CA prêt à livrer. | ⏳ |
| 72 | **v0.21.1** — Garde RBAC UI | `/saisie-pour-equipe` + durcissement RLS + UNIQUE INDEX chef_jour + tests SQL. | ⏳ |
| 73 | **v0.40 Phase 2** — Horaires précis SILAE | Heure_debut/fin/pauses + nuit/sup/35h auto + SILAE enrichi. | ⏸️ SUSPENDU |
| 74 | **v0.41 (BACKLOG)** — Claude API auto-staffing 5XXX | Proxy + skill + tools + fallback v0.35 + cache + cap + télémétrie. Tier CDI/CDD avant intérim. Utilisera `affaire_equipe_historique` comme feature store contextuel. | ⏸️ BACKLOG |
| 75 | **v0.47 (BACKLOG)** — Centre Analyse Heures (Option B) | Onglet consolidé heures + 8 filtres + exports. | ⏸️ BACKLOG |
