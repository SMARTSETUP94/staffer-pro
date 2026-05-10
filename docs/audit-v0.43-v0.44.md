# Audit technique v0.43.0 → v0.44.2

**Date** : 10 mai 2026
**Périmètre** : Sprint 1 hub chef mobile (v0.43.0), Sprint 2 docs/photos (v0.43.x), v0.44.0 Atelier, v0.44.1 refonte UX, v0.44.2 polish, refonte contrat v2.1 (v0.42.1/2)
**Auditeur** : Lovable (agent)
**Demandeur** : Gabin
**Statut suspension** : Sprints v0.45 RLS / v0.46 SILAE Phase 2 / v0.47 Centre Analyse Heures **en pause** jusqu'à arbitrage post-audit.

---

## Verdict global : 🟡 **À surveiller**

Le socle est sain et fonctionnel en prod. Aucune faille critique bloquante détectée. Cinq points de dette technique à traiter avant de relancer la roadmap : finalisation v0.45 (déjà entamée), tests E2E manquants sur la galerie photos, audit trail incomplet sur upload/delete documents, dead code v0.44.1 à purger, ADR manquants sur 3 décisions structurantes.

---

## 1. Sécurité — 🟡 À surveiller

| Item | Verdict | Note |
|---|---|---|
| RLS `heures_validations` (audit chef) | 🟢 OK | Insert restreint à `is_chef_or_admin()` + `valide_par_chef_id = auth.uid()`. SELECT cloisonné self/chef/admin. Pas d'UPDATE/DELETE (table append-only). |
| RLS `affaire_documents` | 🟢 OK | INSERT vérifie `uploaded_by = auth.uid()` + access affaire. SELECT large mais borné par `user_has_affaire_access`. DELETE admin only. **Mineur** : pas de soft-delete vérifié dans SELECT (col `deleted_at` non filtrée par RLS — filtrage applicatif uniquement). |
| RLS `fabrication_objets_photos` | 🟡 Mineur | INSERT borné chef/admin OK, mais SELECT large : tout user avec accès affaire voit toutes les photos. Acceptable mais à documenter. |
| RLS `contrat_templates` / `contrats_signatures` | 🟢 OK | Templates : SELECT actifs publics + admin + employé concerné. Signatures : insert self only, no update/delete (immuable). Bon pattern. |
| RLS `contrats_intermittents` | 🟢 OK | Cohérent avec v0.45 en cours (extension `is_chef_metier_scoped`). |
| Helpers SECURITY DEFINER (7 helpers `is_chef_*`, `user_has_affaire_access`, `current_user_is_chef_on_affaire`, `is_devis_termine`, `can_saisie_on_affaire`, `user_is_mentioned_on_affaire`) | 🟢 OK | Tous `SET search_path = public`, pas de REVOKE EXECUTE (mémoire). Fonctions stables. |
| Nouveaux RPC (delete_devis_atomique, import_devis_atomique_v3, preflight_import_devis) | 🟢 OK | SECURITY DEFINER avec `is_chef_or_admin()` en garde. Idempotents (UPSERT par hash). |
| Buckets Storage (`affaires-photos`, `fabrication-photos`, `contrats-intermittents`, `affaire-attachments`) | 🟢 OK | Tous `public=false`. Accès via signed URLs uniquement. **À vérifier** : durée d'expiration des signed URLs (recommandé ≤ 1h pour photos, ≤ 5min pour contrats). |
| Validation entrées (XSS, injection) | 🟡 Mineur | Champs text libres `affaire_documents.description`, `affaire_commentaires.body` rendus via React (échappement auto OK). **Pas de DOMPurify** car pas d'HTML rendu. ✅ Pas d'injection SQL : tout passe par supabase-js (paramétré). |
| Secrets (RESEND_API_KEY, SUPABASE_SERVICE_ROLE_KEY) | 🟢 OK | Stockés en secrets edge functions, jamais en code client. |
| CSRF | 🟢 OK | N/A — auth via JWT Bearer, pas de cookie session. |
| Signature contrats v2.1 | 🟡 Mineur | `pdf_hash_sha256` calculé côté serveur (bon). **À vérifier** : `signed_at` côté serveur (now()) vs client (manipulable). |

**Action recommandée** : audit signed URL TTL + filtrage `deleted_at IS NULL` dans une RLS policy plutôt qu'applicatif.

---

## 2. Performance — 🟡 À surveiller

| Item | Verdict | Note |
|---|---|---|
| N+1 hub chef Dashboard | 🟢 OK | KPIs agrégés en RPC ou queries groupées (vérifié `useChefDashboardKPIs`). |
| N+1 Atelier Kanban | 🟡 Mineur | `use-chantier-kanban.ts` charge objets + étapes en 2 queries. Acceptable < 500 objets, à monitorer si > 1000. |
| N+1 Galerie photos affaire | 🟡 Mineur | `use-affaire-documents.ts` fait 1 query SELECT puis itère pour signed URLs (N appels storage). **Recommandation** : batch via `createSignedUrls(paths[])`. |
| Indexes critiques | 🟢 OK | Présents : `idx_affaire_documents_affaire_active`, `idx_affaire_documents_objet_id`, `idx_heures_validations_heure`, `idx_heures_validations_chef`, `idx_fab_obj_photos_objet`. |
| Index manquant | 🟡 Mineur | `affaire_documents.uploaded_at DESC` (tri galerie) + `fabrication_etapes.date_fin` (tri retard Kanban). À ajouter si scan seq > 100ms. |
| Bundle JS mobile | 🟡 À mesurer | Ajout dnd-kit, lightbox, camera input natif (pas de lib). **Pas de mesure réelle** : à lancer `vite build --mode production` + lighthouse mobile 4G. Estimé +15-25kB gzip vs v0.42. |
| Lazy-loading images galerie | 🟡 Mineur | `<img loading="lazy">` non vérifié dans `AffaireDocumentsGallery`. À auditer fichier par fichier. |
| Time-to-Interactive mobile | ⚪ Non mesuré | Lighthouse / WebPageTest non exécutés sur le périmètre v0.43-v0.44. À planifier. |

**Action recommandée** : batch signed URLs + lighthouse mobile run sur `/mobile/chef/dashboard` et `/mobile/chef/affaires/$id`.

---

## 3. Qualité code — 🟡 À surveiller

| Item | Verdict | Note |
|---|---|---|
| Duplication mobile chef ↔ employé | 🟢 OK | Composants partagés (`ChefMobileBottomNav` distinct de `EmployeMobileBottomNav` mais hooks `use-affaire-documents`, `use-objet-photos` factorisés). Pas de copier-collé majeur. |
| Coverage E2E nouveaux flows | 🟡 Mineur | `sprint1-7scenarios`, `sprint2-documents`, `sprint-v0442-polish` ✅. **Manquant** : test camera upload réel (mocké), test galerie objet vs galerie globale, test redirect `/a-valider` → `/atelier` à valider. |
| Dead code `/a-valider` | 🟡 Mineur | `mobile.chef.a-valider.tsx` transformé en redirect — OK. Mais composants enfants (`ValiderHeuresList` ancien path) à vérifier importés uniquement depuis nouveaux endroits. |
| TypeScript strict | 🟢 OK | `strict: true` global. Quelques `any` ponctuels dans hooks photos (cast supabase types) — acceptable. |
| Lint conformité | ⚪ Non lancé dans audit | Pas de bloquant remonté en console récente. |
| Naming cohérent | 🟢 OK | Convention `mobile.chef.*` respectée. |

**Action recommandée** : grep `import.*a-valider` pour purger imports résiduels.

---

## 4. Architecture DB — 🟢 Sain

| Item | Verdict | Note |
|---|---|---|
| Vue `v_chefs_par_affaire` | 🟢 OK | Concentre logique d'accès chef → affaire. Réutilisée dans helpers RLS. |
| Schéma `heures_validations` | 🟢 OK | Append-only, FK vers `heures_saisies(id)` ON DELETE CASCADE — cohérent (si heure supprimée, audit suit). |
| Schéma `affaire_documents` | 🟢 OK | `objet_id` nullable + FK ON DELETE SET NULL : permet de garder doc même si objet supprimé. Cohérent. |
| Schéma `contrat_templates` ↔ `contrats_intermittents` | 🟢 OK | FK `template_version_id` ON DELETE RESTRICT (immuabilité audit). |
| Migrations idempotentes | 🟡 Mineur | Majorité utilise `CREATE ... IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`. Vérifié sur 5 migrations récentes : OK. **Mais** : certaines policies en `CREATE POLICY` sans `DROP IF EXISTS` au préalable — re-run échouera. |
| Orphelins potentiels | 🟢 OK | FK contraintes posées partout. |
| Triggers audit | 🟢 OK | Pas de chevauchement détecté. `update_updated_at_column` factorisé. |

**Action recommandée** : convention `DROP POLICY IF EXISTS ... ; CREATE POLICY ...` dans toute migration policy.

---

## 5. UX et A11Y — 🟡 À surveiller

| Item | Verdict | Note |
|---|---|---|
| États vides | 🟡 Mineur | Atelier Kanban : `Inbox` empty state ✅. Galerie photos : à vérifier (icône + CTA "Prendre une photo"). Hub chef Dashboard sans affaire : à vérifier. |
| États erreur | 🟡 Mineur | Toasts Sonner branchés sur la plupart des mutations. **Risque** : erreurs Postgres brutes (`new row violates RLS`) parfois remontées telles quelles dans hooks récents. À wrapper. |
| Responsive Kanban | 🟢 OK | Scroll horizontal natif via `overflow-x-auto` + colonnes `min-w-[280px]`. |
| ARIA boutons | 🟡 Mineur | `aria-label` présent sur icon-buttons via shadcn. **À vérifier** : boutons custom mobile (camera, lightbox close) — souvent oubliés. |
| Focus management modales | 🟡 Mineur | shadcn Dialog gère focus trap ✅. Modale signature contrat custom : à vérifier focus initial sur canvas + escape. |
| Touch targets ≥ 44px | 🟢 OK | Convention mobile respectée. |

**Action recommandée** : pass A11Y axe-core sur `/mobile/chef/atelier` et modale signature.

---

## 6. Cohérence métier — 🟡 À surveiller

| Item | Verdict | Note |
|---|---|---|
| Audit trail validation heures | 🟢 OK | Toute action chef sur `heures_saisies.statut` insère ligne `heures_validations` (trigger ou applicatif vérifié). |
| Audit trail upload/delete documents | 🟡 Mineur | `affaire_documents.deleted_at` soft-delete présent mais **pas de table audit dédiée**. Qui a supprimé quoi ? Recommandé : trigger insert dans `audit_log` ou colonne `deleted_by`. |
| Audit trail signature contrat | 🟢 OK | `contrats_signatures` immuable + `pdf_hash_sha256` + `client_ip` + `user_agent` capturés. Bon. |
| Règles business heures | 🟡 Mineur | Validation frontend `heures_reelles ≤ 24` ✅. **Backend** : pas de CHECK constraint ni trigger côté DB. Un client malveillant peut bypass. |
| Taux horaire positif | 🟡 Mineur | Pas de CHECK > 0 sur `employes.taux_horaire_brut`. |
| Dates contrat cohérentes | 🟡 Mineur | Pas de CHECK `date_fin >= date_debut` sur `contrats_intermittents`. |
| Idempotence RPC signature | 🟢 OK | UNIQUE INDEX sur `(contrat_id, role_signature, signataire_id)` empêche doublon. |
| Idempotence upload photo | 🟢 OK | `storage_path` UNIQUE dans `affaire_documents`. |

**Action recommandée** : ajouter triggers BEFORE INSERT/UPDATE pour règles métier critiques (heures ≤ 24, dates contrat, taux > 0). Préférer triggers à CHECK pour flexibilité.

---

## 7. Documentation — 🟠 À corriger

| Item | Verdict | Note |
|---|---|---|
| `docs/sprint-v0442-checklist.md` | 🟢 OK | À jour. |
| ADR Option D RLS chef_metier_scoped | 🔴 Manquant | Décision structurante v0.45 sans ADR formel. |
| ADR extension `affaire_documents.objet_id` | 🔴 Manquant | Choix vs table dédiée `objet_documents` non tracé. |
| ADR template TipTap contrats | 🔴 Manquant | Choix lib + format storage non tracé. |
| README onboarding | 🟡 À jour partielle | Ne mentionne pas hub chef mobile ni atelier kanban. |
| `docs/db-schema.md` ou équivalent | ⚪ Inexistant | Pas de doc DB centralisée — types.ts auto-généré tient lieu de source mais peu lisible. |

**Action recommandée** : créer `docs/adr/` avec 3 ADR minimum (RLS scoped, doc objet_id, TipTap).

---

## Top 5 actions correctives prioritaires

| # | Action | Criticité | Effort | Justification |
|---|---|---|---|---|
| 1 | **Finaliser v0.45 (UI scoped + tests pgTAP/E2E)** | 🔴 Haute | 4-5h | Migration DB déjà appliquée, code partiel : laisser en l'état est un risque de désync. |
| 2 | **Triggers business critiques (heures ≤ 24, dates contrat, taux > 0)** | 🟠 Moyenne | 2h | Bypass backend possible aujourd'hui via RPC custom ou client manipulé. |
| 3 | **Audit trail upload/delete documents (`deleted_by` + trigger audit)** | 🟠 Moyenne | 1h30 | Conformité RGPD : qui a supprimé quoi sur photos chantier. |
| 4 | **Batch signed URLs galerie + index `uploaded_at DESC` + lazy-loading images** | 🟡 Basse | 2h | Perf mobile 4G — préventif avant montée en volume photos. |
| 5 | **3 ADR (RLS scoped, objet_id, TipTap) + purge dead code `/a-valider`** | 🟡 Basse | 1h30 | Dette doc qui s'accumule, freine onboarding futur dev. |

**Effort total top 5** : ~11h (1.5 jour dev).

---

## Recommandation

Avant de relancer **v0.45 / v0.46 / v0.47**, traiter actions **#1 + #2 + #3** (sprint correctif ~7h, demi-journée et demie). Actions **#4 + #5** peuvent être glissées dans le sprint v0.45 finalisation sans surcoût significatif.

Une fois ce sprint correctif livré et release v0.44.3 publiée, reprendre la roadmap v0.45 (RLS scoped UI + tests) puis v0.46 (SILAE Phase 2) puis v0.47 (Centre Analyse Heures).

— Fin du rapport —
