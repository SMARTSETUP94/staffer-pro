import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  CheckCircle2,
  Sparkles,
  Wrench,
  Bug,
  Rocket,
  Calendar,
  ListTodo,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_app/roadmap")({
  component: RoadmapPage,
});

type EntryType = "feature" | "fix" | "improvement" | "refactor";

interface RoadmapEntry {
  type: EntryType;
  title: string;
  description?: string;
  area?: string;
}

interface RoadmapRelease {
  date: string; // ISO YYYY-MM-DD
  version?: string;
  title: string;
  entries: RoadmapEntry[];
}

interface RoadmapPlanned {
  title: string;
  description?: string;
  priority: "haute" | "moyenne" | "basse";
}

const RELEASES: RoadmapRelease[] = [
  {
    date: "2026-04-29",
    version: "v0.26.1",
    title: "🚨 Hotfix critique — Lien d'invitation cassé pour nouveaux utilisateurs",
    entries: [
      {
        type: "fix",
        title: "🔧 inviteUser/resendInvitation : redirectTo=/auth/set-password (admin-actions.ts)",
        description:
          "BUG BLOQUANT TERRAIN : depuis v0.25.0, generateLink({type:'invite'}) ne passait PAS d'options.redirectTo, donc Supabase utilisait Site URL par défaut (/) au lieu de /auth/set-password. Le hash #access_token était consommé sur la racine par detectSessionInUrl, AppGuard prenait la main avant que l'utilisateur ait pu créer son mot de passe → boucle infinie ou /onboarding sans password réel. Fix : ajout de options.redirectTo dans inviteUser ET resendInvitation, avec siteUrl passé depuis le client (window.location.origin) + fallback prod (https://staffing.setup.paris). Helper testable resolveSetPasswordRedirect() exposé.",
      },
      {
        type: "fix",
        title: "🛡️ AppGuard : invité status=invite forcé sur /auth/set-password (filet de sécurité)",
        description:
          "Extension de la garde mustSetPassword : tout user_roles.status='invite' avec password_set_done!=true ET password_set_at IS NULL est forcé sur /auth/set-password, peu importe son rôle (chef/admin/employé). Empêche qu'un employé invité bypass la création de mot de passe et arrive directement sur /onboarding. Logique extraite dans src/lib/auth-redirect-helpers.ts (testable) via shouldForceSetPassword().",
      },
      {
        type: "fix",
        title: "🚪 routes/index.tsx : hash #access_token redirige vers /auth/set-password",
        description:
          "Défense en profondeur : si la racine reçoit un hash de lien d'invitation/recovery (access_token, type=invite|recovery|magiclink|signup), redirect immédiat vers /auth/set-password en préservant le hash, AVANT que detectSessionInUrl ne consomme la session sur la mauvaise route. Helper isAuthHashPresent() testable.",
      },
      {
        type: "fix",
        title: "⚡ auth-context : chargement rôles synchrone (suppression setTimeout)",
        description:
          "Bug secondaire : le setTimeout(0) sur fetchRoles créait un gap où AppGuard pouvait router prematurely (user présent mais rolesLoaded=false → loader → routing immédiat sur /onboarding). Refonte : loadUserData() asynchrone fire-and-forget sans setTimeout, expose passwordSetAt + isInviteStatus pour la garde étendue. Pas d'await dans le callback onAuthStateChange (évite deadlock).",
      },
      {
        type: "fix",
        title: "✅ +23 tests Vitest sur la régression auth (543 verts au total)",
        description:
          "Couverture complète : shouldForceSetPassword (8 cas dont chef legacy, invité employé, skip, password déjà set), isAuthHashPresent (8 cas dont anchor classique, invite, recovery), resolveSetPasswordRedirect (7 cas dont fallback, trailing slash, http preview, Lovable preview).",
      },
    ],
  },
  {
    date: "2026-04-29",
    version: "v0.26.0",
    title: "Dashboard customizable mixable (17 widgets atomiques)",
    entries: [
      {
        type: "feature",
        title: "🧩 Dashboard universel /dashboard avec 17 widgets atomiques mixables",
        description:
          "Catalogue final 17 widgets : 8 existants identifiés (kpi_top, opportunites_priorite, pipeline_charge_affaires, pipeline_typologie, conversions_recentes, opportunites_perdues, meteo_chantiers, charge_atelier) + 5 existants no-regression (charge_equipe, flotte_kpis, montages_j7, tension_budget, absences_semaine) + 4 nouveaux (heures_a_valider, objets_en_retard, mes_etapes_fab, sous_effectif_J7). Mix libre commerce + opérationnel + commerce + perso sur une seule page. Grid responsive 2 colonnes lg, widgets width=2 prennent toute la largeur.",
      },
      {
        type: "feature",
        title: "🎯 Presets par rôle au 1er login (admin / chef / chargé d'affaires / employé)",
        description:
          "Admin : tous (17). Chef de chantier : 10 widgets ops + perso + fab pertinents. Chargé d'affaires : 7 widgets commerce + tension_budget (preset exposé pour usage futur). Employé : mes_etapes_fab uniquement. Fallback automatique si profiles.dashboard_layout est NULL. Bouton « Réinitialiser au preset » dans la Sheet.",
      },
      {
        type: "feature",
        title: "⚙️ Sheet latérale « Personnaliser » (show/hide par widget)",
        description:
          "Drawer droit avec checkboxes groupées par catégorie (Commerce / Opérationnel / Fabrication / Personnel). Persistance JSONB dans profiles.dashboard_layout. Optimistic update + toast confirmation. Drag & drop reorder reporté en Phase B (v0.27+).",
      },
      {
        type: "feature",
        title: "🔀 Fusion /dashboard-employe → /dashboard universel",
        description:
          "Suppression de la dualité de routes. /dashboard-employe redirect 301 vers /dashboard pour ne casser aucun lien. EMPLOYE_DESKTOP_ALLOWED whitelist élargie (/dashboard ajouté). Le preset 'employe' réduit l'expérience à mes_etapes_fab pour rester cohérent avec l'ancienne vue.",
      },
      {
        type: "feature",
        title: "🗄️ Migration : profiles.dashboard_layout JSONB nullable",
        description:
          "Stockage par utilisateur du layout personnalisé { visible: WidgetId[], hidden?: WidgetId[] }. RLS héritées des policies profiles existantes (self-update). sanitizeLayout filtre les WidgetId obsolètes au chargement (forward-compat).",
      },
      {
        type: "feature",
        title: "✅ +45 tests Vitest (520/520 verts)",
        description:
          "ROLE_PRESETS (admin=17, chef=10, employe=1, charge_affaires=7) + computePresetForRoles priorité + sanitizeLayout (null, formats invalides, ids inconnus filtrés) + widget-registry (registerWidget / getWidgetComponent) + WIDGET_META widths cohérents + groupement par catégorie (6/5/3/3) + Personnaliser sheet (toggle, idempotence, buildLayoutFromDraft).",
      },
      {
        type: "improvement",
        title: "🪶 Hook partagé useOpportunitesPipeline (déduplication fetch)",
        description:
          "Les widgets commerce (kpi_top, pipeline_charge_affaires, opportunites_priorite, etc.) partagent un même hook de fetch pour éviter N requêtes parallèles redondantes quand plusieurs widgets commerce sont actifs simultanément.",
      },
    ],
  },
  {
    date: "2026-04-29",
    version: "v0.25.2",
    title: "Bulk-assign rôles à l'import devis Progbat",
    entries: [
      {
        type: "feature",
        title: "🎯 Section 5 du wizard import : 8 dropdowns pré-assignation responsables",
        description:
          "Chef de projet (niveau affaire), responsables Montage / Démontage (niveau affaire), responsables des 5 étapes fab par objet (BE, Usinage, Respo Fab, Finition, Manutention). Filtrage par flag rôle profile (est_chef_projet, est_bureau_etude, est_usinage_numerique, est_respo_fab, est_finition, est_manutention). Masquage automatique des dropdowns pour métiers sans heures sélectionnées. Tous skipables (placeholder « — Non assigné — » + bouton « Passer cette étape »).",
      },
      {
        type: "feature",
        title: "🗄️ 2 nouvelles colonnes affaires : responsable_montage_id & responsable_demontage_id",
        description:
          "FK profiles ON DELETE SET NULL, indexes dédiés. Cohérent avec chef_projet_id préexistant.",
      },
      {
        type: "feature",
        title: "🆕 RPC v3 : import_devis_atomique_v3 (param _bulk_assign jsonb)",
        description:
          "Étend la v2 avec un paramètre _bulk_assign optionnel. Pour chaque objet : si heures du métier > 0 ET assignee fourni → UPDATE fabrication_etapes.assignee_id (uniquement étapes statut « a_faire »). Au niveau affaire : UPDATE chef_projet_id, responsable_montage_id, responsable_demontage_id si fournis. RPC v2 conservée pour rétrocompatibilité.",
      },
      {
        type: "feature",
        title: "✅ 15 nouveaux tests Vitest (475/475 verts)",
        description:
          "activeEtapesFromObjets (regroupements bois+metal, peinture+tapisserie), buildBulkAssignPayload (skip = {} → comportement v0.25.1 inchangé, payload partiel, payload complet), profileLabel (fallback email).",
      },
    ],
  },
  {
    date: "2026-04-29",
    version: "v0.25.1",
    title: "Import devis depuis onglet Devis d'affaire (UX quick win)",
    entries: [
      {
        type: "feature",
        title: "📥 Bouton « Importer un devis Progbat » sur fiche affaire → onglet Devis",
        description:
          "Remplace le bouton « Nouveau devis » historique. Au clic, navigation vers `/devis/import?affaire_id={current_id}` avec pré-sélection automatique de l'affaire de destination dans le wizard d'import. Le bouton « Devis manuel » (création vide) reste disponible en secondaire pour les cas hors-Progbat.",
      },
      {
        type: "improvement",
        title: "🔒 /devis/import : pré-remplissage + verrouillage dropdown affaire",
        description:
          "Nouveau `validateSearch` zod-adapter avec `affaire_id?: string().uuid()`. Si présent : fetch ciblé Supabase (peut être hors top 200), pré-sélection + dropdown disabled avec tooltip « Pré-rempli depuis l'affaire courante ». Bouton « ← Retour à l'affaire » visible en haut. Edge cases gérés : UUID invalide → fallback dropdown libre, affaire RLS-bloquée → message d'erreur + déverrouillage. `reset()` post-import préserve la sélection verrouillée.",
      },
      {
        type: "improvement",
        title: "🧪 +9 tests Vitest (validateSearch + decidePrefillState + buildImportLinkSearch)",
        description: "Couverture : UUID valide, query string vide, UUID malformé (fallback), params inconnus ignorés, états valid/invalid/idle du fetch ciblé, encodage du Link search. Total 460 tests verts.",
      },
    ],
  },
  {
    date: "2026-04-29",
    version: "v0.25.0",
    title: "Onboarding profil utilisateur (wizard 4 étapes)",
    entries: [
      {
        type: "feature",
        title: "🎉 Wizard /onboarding 4 étapes (RGPD → Identité → Pro → Sécurité)",
        description:
          "1ʳᵉ connexion : redirect automatique post-set-password vers `/onboarding`. Stepper visuel + barre de progression. Validation Zod par étape, erreurs inline. Auto-save partiel à chaque passage. Bouton « Compléter plus tard » sur chaque étape. Champs obligatoires : téléphone + adresse complète + contact urgence + consentement RGPD. Photo de profil (bucket public `avatars`, RLS owner-only write), date de naissance, bio, métier principal, permis : skipables.",
      },
      {
        type: "feature",
        title: "🔒 Page /privacy (politique de confidentialité)",
        description:
          "Page publique listant : données collectées (identité, contact, pro, urgence, activité), finalités (paie SILAE, planning, contact urgence), durée conservation (contrat + 5 ans), droits RGPD. Contact référent : Gabin g.chaussegros@groupe-smart.fr.",
      },
      {
        type: "feature",
        title: "⚠️ Bandeau persistant ProfileIncompleteBanner",
        description:
          "Affiché sur AppLayout tant que `profile_completed_at` est null. Affiche le % de complétion calculé sur les 7 champs requis (téléphone, adresse rue/CP/ville, contact urgence nom/tel, RGPD). Lien direct vers /onboarding.",
      },
      {
        type: "improvement",
        title: "🗄️ Schéma profiles : 13 nouveaux champs + helper SQL",
        description:
          "Colonnes ajoutées : avatar_url, telephone, date_naissance, bio_courte, adresse_rue/code_postal/ville/pays, contact_urgence_nom/telephone/lien, rgpd_consent_at, profile_completed_at. Helper `is_profile_complete(uuid)` STABLE SECURITY DEFINER (REVOKE PUBLIC, GRANT authenticated). Bucket Storage `avatars` public read + RLS écriture par owner uniquement (path = `{user_id}/...`).",
      },
      {
        type: "improvement",
        title: "🔁 AuthGuard étendu : redirect onboarding obligatoire",
        description:
          "`_app.tsx` chaîne désormais : login → set-password (chef/admin) → onboarding (tous) → dashboard. `useAuth()` expose `profileCompleted: boolean` rafraîchi à chaque session.",
      },
      {
        type: "improvement",
        title: "✅ Tests Vitest : 427 → 451 (+24)",
        description:
          "Nouveau fichier `onboarding-schemas.test.ts` couvrant : telephoneSchema (FR/intl/edge cases), codePostalSchema, stepRgpdSchema, stepIdentiteSchema, stepSecuriteSchema, isProfileComplete, computeProfileCompletion (0/partiel/100). Suite complète verte en 7,7s.",
      },
      {
        type: "improvement",
        title: "🔮 Roadmap v0.27+ : pièce d'identité (CNI / passeport)",
        description:
          "Reportée pour v0.27+ : upload CNI ou passeport sur profil utilisateur (storage chiffré, RLS RH-only, validation manuelle admin). Reportée car nécessite arbitrage RGPD + workflow validation RH.",
      },
    ],
  },
  {
    date: "2026-04-29",
    version: "v0.24.1",
    title: "Hotfix dette technique — 5 findings audit Bloc 8",
    entries: [
      {
        type: "improvement",
        title: "🛠️ S1.1 Factorisation `stripDiacritics` (8 fichiers → 1 module)",
        description:
          "Centralisation dans `src/lib/string-normalize.ts` (`stripDiacritics`, `normalizeName`, `normalizeForMatch`, `fuzzyMatch`, alias `fuzzyContains`). 8 fichiers convertis : saisie-equipe-filter, opportunites-import, employes-import, devis-import, devis-parser/match, planning, interimaires, AddInterimDialog. Anti-régression critique (cause du bug fuzzyMatch v0.23.1). +11 tests dédiés (`string-normalize.test.ts`).",
      },
      {
        type: "improvement",
        title: "🔒 S2.1 REVOKE EXECUTE PUBLIC sur 37 helpers SQL internes",
        description:
          "Migration : tous les `notify_*`, `set_*`, `log_*`, `guard_*`, `handle_*`, `sync_*`, `enforce_*`, `check_*`, `create_notification`, `update_updated_at_column` ne sont plus exécutables par `public/anon/authenticated`. Ils restent appelés par les triggers (rôle `postgres`). Linter Supabase : 98 warnings → 28 (les 28 restants = helpers RLS volontairement publics : has_role, is_admin, is_chef_or_admin, can_saisie_on_affaire, etc.).",
      },
      {
        type: "improvement",
        title: "⚡ S3.1 Lazy-load `jszip` sur planning-zip-export",
        description:
          "`await import('jszip')` à l'intérieur du handler d'export. Avec le lazy-load `xlsx` déjà fait au tour précédent (Lot B v0.24.1), gain bundle initial cumulé estimé ~600–800 KB. Aucun changement fonctionnel.",
      },
      {
        type: "improvement",
        title: "🧠 S3.2 useMemo Planning sur filtre typologie",
        description:
          "`affaireIdsByTypo` + `filterAffaireStr` mémoïsés sur `[affaires, typoFilter, filterAffaire]`. Évite re-render inutile à chaque toggle typologie. (Déjà appliqué au commit Bloc 4 v0.24.0, validé en audit.)",
      },
      {
        type: "improvement",
        title: "🛡️ S7.2 UNIQUE INDEX `fabrication_objets(affaire_id, reference)`",
        description:
          "Anti-doublon en base contre double-clic import progbat ou bulk insert concurrent. 0 doublon existant détecté avant création. Garantie d'idempotence native côté DB.",
      },
      {
        type: "improvement",
        title: "✅ Tests Vitest : 416 → 427 (+11)",
        description:
          "Nouveau fichier `string-normalize.test.ts` couvrant 100% des helpers (NFD, lowercase, fuzzyContains, edge cases majuscules accents, null/undefined). Suite complète verte en 7s.",
      },
    ],
  },
  {
    date: "2026-04-29",
    version: "v0.24.0",
    title: "Typologie de chantiers + hotfix set-password",
    entries: [
      {
        type: "feature",
        title: "🆕 Typologie d'affaires (filtre multi-zones)",
        description:
          "Nouvelle colonne `typologie` générée STORED + indexée sur `affaires`, dérivée du `numero` via `compute_affaire_typologie()` (5 valeurs : non_operationnel, montage_demontage, fabrication, stockage, prototype). Helper TS miroir `getAffaireTypologie()`, tokens design `--typologie-*` (5 couleurs + foreground), composants `TypologieBadge` + `TypologieMultiFilter` (preset « Opérationnels » = M/D + Fab strict, sans stockage — voix Gabin).",
      },
      {
        type: "feature",
        title: "🆕 Filtre multi-typologies sur 4 vues",
        description:
          "Ajout de TypologieMultiFilter sur Planning, Liste Chantiers (+ colonne typologie), Kanban Opportunités (+ badge sur cartes) et Dashboard Pipeline (segmentation BarChart). Persistance query string `?typo=fab,md,...` via `validateSearch` + zod-adapter (fallback + stripSearchParams).",
      },
      {
        type: "fix",
        title: "🚨 Hotfix bouton submit page set-password (lien d'invitation)",
        description:
          "Bug terrain : nouvel utilisateur invité par admin clique sur lien email, arrive sur /auth/set-password, mais le bouton « Créer mon compte » restait inerte. Causes identifiées : (1) hash `#access_token=...&refresh_token=...` parfois pas consommé avant le redirect /login (race condition au mount), (2) erreurs Zod silencieuses (toast au lieu d'erreur sous champ), (3) attribut HTML `required minLength=8` qui bloquait la prévalidation native. Fix : consommation explicite du hash via `setSession()` au mount avant toute décision de redirect, délai de grâce 600ms, validation visible sous chaque champ, bouton toujours cliquable, vérification session avant `updateUser()`, logs `[set-password]` à chaque étape. Helpers extraits dans `src/lib/set-password-helpers.ts` pour testabilité.",
      },
      {
        type: "improvement",
        title: "Tests Vitest +23 (416 tests, target ≥410)",
        description:
          "Nouveaux fichiers : `affaire-typologie.test.ts` (14 tests — mapping 1XXX/2XXXX/3XXX/4XXX/5XXX/6XXX/9XXX, edge cases longueur, null, preset Opérationnels, labels & colors), `set-password-helpers.test.ts` (9 tests — validation password court / mismatch / cumul, parser hash invitation Supabase). Build tsc clean, 416/416 verts.",
      },
    ],
  },
  {
    date: "2026-04-28",
    version: "v0.23.1",
    title: "Hotfix UX — 3 fixes groupés",
    entries: [
      {
        type: "fix",
        title: "🚨 Fusion onglet Devis + Devis Progbat (un seul upload)",
        description:
          "Régression UX bloquante v0.23.0 : 2 onglets séparés pour le même fichier .xlsx Progbat. Fusion en un seul flux : 1 upload → parsing dual (postes RH + objets fabrication) → un écran de validation chef avec sections 📋 Postes / 🛠️ Objets fab / 🏗️ Heures chantier → bouton « Valider import » → transaction atomique via nouvelle RPC `import_devis_atomique_v2` (postes + objets + heures montage/démontage en une seule transaction, hash anti-doublon). Onglet « Devis Progbat » supprimé de ImportsTabsNav. Route `/devis/progbat-import` → redirect 301 vers `/devis/import` (rétrocompat liens). Warning visuel sans blocage si poste « machiniste » détecté ET heures chantier cochées (anti double-comptage, reco B).",
      },
      {
        type: "improvement",
        title: "🛠️ Export Planning all-in-one (.zip)",
        description:
          "Bouton « Exporter toutes les vues (.zip) » sur /export. Génère un zip `planning-export-{YYYY-MM-DD}-{YYYY-MM-DD}.zip` contenant : (1) le .xlsx multi-vues (CDI-CDD / Intérim / Synthèse / Heures par employé / Flotte avec onglet Véhicules ajouté), (2) la Feuille de route .xlsx (un onglet par jour de la plage). 100% client-side via JSZip — aucune nouvelle surface serveur, aucun nouveau secret. Plage limitée à 4 semaines comme l'export simple.",
      },
      {
        type: "improvement",
        title: "🛠️ Filtres Saisie pour équipe (typologie + recherche fuzzy)",
        description:
          "Page /saisie-pour-equipe : ajout d'un ToggleGroup typologie (Tous / CDI-CDD / Intérim-Indép.) + Input recherche nom (debounce 200ms, fuzzy maison lowercase + NFD strip diacritics + includes — « Léa » match « lea », « François » match « francois »). Persistance de l'état en query string via validateSearch + zod-adapter (`fallback()` + `stripSearchParams`) — partageable et restauré au reload. 0 nouvelle dépendance fuzzy.",
      },
      {
        type: "improvement",
        title: "Tests Vitest +32 (393 tests, target ≥380)",
        description:
          "Nouveaux fichiers : `saisie-equipe-filter.test.ts` (12 tests fuzzy + ToggleGroup), `planning-zip-export.test.ts` (7 tests workbook multi-vues + onglet Flotte + composition zip JSZip), `devis-import-v2.test.ts` (13 tests détection machiniste reco B + contrat RPC v2 10 paramètres + redirect progbat-import). Helpers extraits pour testabilité : `src/lib/saisie-equipe-filter.ts`, `src/lib/devis-import-v2-helpers.ts`. Build tsc clean, 393/393 verts.",
      },
    ],
  },
  {
    date: "2026-04-28",
    version: "v0.23.0",
    title: "Parser devis Progbat — import objets fabrication",
    entries: [
      {
        type: "feature",
        title: "Page /devis/progbat-import (admin) : upload + validation chef + import",
        description:
          "Nouvelle page admin only : upload Excel Progbat (max 5MB) → sélection affaire active → parsing 100% client → tableau de validation chef interactif (cocher/décocher/éditer chaque objet, heures par métier, budget matières, lot) → confirmation heures Montage/Démontage chantier (checkboxes pour ne pas écraser) → bulk insert fabrication_objets + UPDATE conditionnel affaires.heures_prevues_montage/demontage. Redirige vers /affaires/$id/fabrication après import. Onglet « Devis Progbat » ajouté dans /imports.",
      },
      {
        type: "feature",
        title: "Helpers parser purs (src/lib/devis-parser/)",
        description:
          "matchMetier (fuzzy), isMatiere, isChantierKeyword, detectDevisType (Fabrication / Chantier seul / Mixte / Inconnu), computeFlagsFromMetiers (5 flags v0.22 dérivés des métiers détectés), detectTypeFinition. 100% pur, testable isolément.",
      },
      {
        type: "feature",
        title: "Parser core parse-excel.ts",
        description:
          "Pipeline : xlsx → matrice → détection headers → extraction metadata (n° devis, client, total HT) → findObjetParents (niveaux 1-2) → aggregateObjet (somme heures × quantité par métier, accumulation budget matériaux, confidence high/medium/low) → computeHeuresChantier (Montage/Démontage globaux) → findRenvois (« Voir devis XXXX »).",
      },
      {
        type: "feature",
        title: "13 fixtures Excel reproduisant les devis Progbat réels",
        description:
          "Mocks matriciels couvrant les 13 cas analysés : D-2153, D-2141, D-2023, D-1973, D-1816, D-1831, D-1625, D-1665, D-1707, D-2022, D-1650, D-2028, D-2133. Cas couverts : objets multi-quantités, lots Achat/Régul/Voir devis exclus, chantier seul, mixte fabrication+chantier, accessoires (budget sans heures), transport.",
      },
      {
        type: "feature",
        title: "Détection auto type devis",
        description:
          "Fabrication (objets atelier) / Chantier seul (Montage/Démontage uniquement, 0 objet) / Mixte / Inconnu. Si chantier seul → 0 objet créé, juste extraction des heures chantier vers l'affaire.",
      },
      {
        type: "feature",
        title: "UI validation chef : tableau interactif",
        description:
          "Checkboxes Importer/Skip par objet, édition inline nom/quantité/budget matières/heures par métier (BE, Numérique, Bois, Métal, Peinture, Tapisserie, Manutention), warnings (matière sans prix, métier ambigu), confidence 🟢🟡🔴. Section heures chantier séparée avec checkboxes pour ne pas écraser les valeurs existantes sur l'affaire.",
      },
      {
        type: "feature",
        title: "Helper importProgbatToAffaire (bulk insert + UPDATE conditionnel)",
        description:
          "Bulk insert fabrication_objets (références auto OBJ-N si nom manquant, devis_id propagé, flags v0.22 dérivés). UPDATE affaires.heures_prevues_montage/demontage uniquement si checkbox cochée. Trigger v2 (Bloc 1 v0.22) crée automatiquement les 5 étapes pour chaque objet importé. Toast succès « N objets importés sur affaire Y ».",
      },
      {
        type: "feature",
        title: "Mapping fuzzy : 8 métiers atelier + 2 chantier + 30+ aliases",
        description:
          "Tissu → Tapisserie (cumul), Serrurerie → Métal (cumul), Permanence → Montage (cumul chantier), Day 1-4 → Montage, CNC/3D/Découpe Numérique → Numérique (mappe vers étape Usinage v0.22). Lots Achat / leurre / Voir devis / Régul / Cadrage = exclus. Numérique = métier à part entière.",
      },
      {
        type: "improvement",
        title: "+111 tests Vitest (250 → 361 verts)",
        description:
          "75 tests helpers (matchMetier, detectDevisType, flags, type finition) + 16 tests fixtures (parse-excel sur les 13 cas réels) + 20 tests intégration importProgbatToAffaire (bulk insert, UPDATE conditionnel, confidence, RBAC, idempotence). Non-régression v0.20-v0.22 vérifiée.",
      },
      {
        type: "improvement",
        title: "Spec issue de l'analyse de 14 devis Progbat réels",
        description:
          "parser-rules-progbat.md : 29 questions de cadrage Q1-Q29 résolues avec Gabin avant code. Définit la grammaire des cellules Progbat (lots, sous-lots, lignes matières, métiers, mots-clés exclus, conventions de quantité).",
      },
    ],
  },
  {
    date: "2026-04-28",
    version: "v0.22.0",
    title:
      "Refonte module Fabrication — heures par métier + étape Usinage Numérique",
    entries: [
      {
        type: "feature",
        title: "Nouvelle étape Usinage Numérique (5 étapes au lieu de 4)",
        description:
          "Ajout d'une 5e étape de fabrication entre BE et Respo Fab pour tracer le travail CNC distinctement. Enum fabrication_etape_type étendu avec 'usinage', flag a_usiner sur fabrication_objets (default true). Triggers create_fabrication_etapes_for_objet et sync_fabrication_etapes_on_flags_change mis à jour pour gérer les 5 étapes. Backfill automatique : tous les objets existants reçoivent une étape usinage en a_faire.",
      },
      {
        type: "feature",
        title: "Heures prévues par métier sur fabrication_objets",
        description:
          "7 colonnes numériques ajoutées : heures_prevues_be / numerique / bois / metal / peinture / tapisserie / manutention. Plus colonne budget_materiaux. Éditables manuellement par chef projet via la modale Ajouter/Éditer Objet (section dédiée). Alimenteront le parser devis Progbat v0.23.",
      },
      {
        type: "feature",
        title: "Heures montage/démontage sur l'affaire",
        description:
          "Colonnes heures_prevues_montage et heures_prevues_demontage ajoutées sur affaires. Mini-formulaire chef projet/admin sur la fiche affaire avec total chantier calculé en live. Ces heures vont sur l'affaire (pas sur fabrication_objets) car elles concernent le chantier global.",
      },
      {
        type: "feature",
        title: "Modale Ajouter/Éditer Objet : 5 questions Oui/Non",
        description:
          "Section « Étapes nécessaires » passe de 4 à 5 questions : à dessiner (BE), à usiner (Usinage Num — NOUVEAU), à construire (Respo Fab), brut (skip Finition), à emballer (Manutention). Chaque réponse pilote le statut initial de l'étape correspondante via le trigger.",
      },
      {
        type: "feature",
        title: "UI Fabrication : 5 colonnes étapes partout",
        description:
          "Tableau objets × étapes sur /affaires/$id/fabrication passe à 5 colonnes (BE / Usinage / Respo Fab / Finition / Manutention). Cartes mobile : 5 boutons. Dashboard global /fabrication : 5 pôles de charge. Page /parametres/roles-fabrication : matrice 6 colonnes incluant Usinage Num.",
      },
      {
        type: "feature",
        title: "Rôle Usinage Numérique sur profils + employés",
        description:
          "Nouveau flag est_usinage_numerique sur profiles. Intégré dans la grille de gestion employés (_app.employes.tsx, 6 colonnes au lieu de 5), dans le filtre des assignees éligibles (ETAPE_TO_FLAG.usinage → est_usinage_numerique), et dans MesHeuresGrid pour la saisie d'heures sur étape usinage.",
      },
      {
        type: "feature",
        title: "Helper SQL etape_for_metier() + mirror TS etapeForMetier()",
        description:
          "Fonction immutable côté DB qui mappe les 7 métiers devis vers les 5 étapes fabrication (be→be, numerique→usinage, bois/metal→respo_fab, peinture/tapisserie→finition, manutention→manutention). Mirror TS exporté depuis use-fabrication.ts pour les calculs UI et tests.",
      },
      {
        type: "improvement",
        title: "Tests Vitest +21 (229 → 250 verts)",
        description:
          "Nouveau fichier fabrication-v022.test.ts couvrant : trigger create_fabrication_etapes_for_objet v2 (5 étapes, statuts dérivés des flags), helper etape_for_metier (7 cas), trigger sync sur a_usiner (bascule ↔ non_applicable), ETAPE_TO_FLAG.usinage, getEligibleEtapesForRoles avec est_usinage_numerique. Non-régression v0.20–v0.21 vérifiée.",
      },
    ],
  },
  {
    date: "2026-04-28",
    version: "v0.21.0",
    title:
      "Saisie heures par chef + bulk staffing + feuille de route + verrouillage affaires",
    entries: [
      {
        type: "feature",
        title: "Saisie d'heures par chef pour un employé",
        description:
          "Modale ponctuelle « + Saisir pour un employé » depuis Validation heures (dropdown employé + date + horaires + auto-calc) + nouvelle page /saisie-pour-equipe (sidebar Équipes) avec grille employé × jour, filtres période/employés/métier/affaire + modale « Saisir en bulk » multi-employés × multi-jours (default 8h-17h pause 60min, aperçu avant validation, skip cellules déjà saisies). Toutes les saisies créées en statut 'valide' (la saisie chef vaut validation). saisi_par + saisi_par_chef remplis automatiquement par trigger DB.",
      },
      {
        type: "feature",
        title: "Page admin /audit-heures (traçabilité RH)",
        description:
          "Nouvelle route admin only avec stats globales, filtres par période / employé / type d'action (création_self, création_chef, soumission, validation, rejet, acquittement, édition), badges colorés et export CSV. S'appuie sur heures_saisies_historique enrichi (action_type + pour_compte_de) pour permettre un audit RH complet.",
      },
      {
        type: "feature",
        title: "Badge 👤 + popover historique sur saisies créées par un chef",
        description:
          "Composant SaisieChefBadge affiché sur les cellules dont saisi_par_chef = true. Au clic, popover qui détaille qui a saisi quoi pour qui et quand, avec extraction depuis heures_saisies_historique. N'apparaît jamais sur les saisies pré-v0.21 (backfill saisi_par_chef = false).",
      },
      {
        type: "feature",
        title: "Notification in-app à l'employé sur saisie chef",
        description:
          "Trigger DB notify_saisie_par_chef qui pousse une notification « Heures saisies par votre chef » à l'employé concerné (avec deep-link /mes-heures) à chaque insert avec saisi_par_chef = true. Anti-spam : pas de notif si statut + heures + horaires inchangés sur un UPDATE.",
      },
      {
        type: "feature",
        title: "Verrouillage des affaires en statut termine / annule",
        description:
          "Helpers SQL is_affaire_open() + can_saisie_on_affaire() (Option B : saisies heures autorisées jusqu'à date_demontage incluse, fallback strict si NULL ; admin override) + helper TS isAffaireSelectable + filtrage UI cohérent sur Planning, Validation heures, Module Fabrication, Demandes transport. RLS heures_saisies_self_insert durcie. Index idx_affaires_statut. Trigger check_affaire_open_for_assignation bloque les modifs structurelles d'assignations sur affaire fermée.",
      },
      {
        type: "feature",
        title: "Bulk staffing Planning (Ctrl+clic + modale dédiée)",
        description:
          "Sélection multi-cellules par Ctrl+clic avec cadre violet épais (ring-4) et barre flottante sticky « N cellules sélectionnées » → bouton « Affecter ces N cellules » qui ouvre la modale d'affectation pré-remplie. Nouvelle modale « + Staffer en bulk » à côté du WeekPicker : multi-select employés (groupés par métier avec raccourcis « Tous CDI / Tous Intérim »), multi-select dates, aperçu avec cellules occupées en jaune (skip auto), création en lot. Helper computeBulkPreview centralisé + 12 tests Vitest.",
      },
      {
        type: "feature",
        title: "Vue « Feuille de route » sur Planning (6e onglet)",
        description:
          "Nouvel onglet « Feuille de route » : 1 jour = 1 page, blocs chantiers verticaux avec équipe staffée, type d'opération et chef du jour. Navigation J-1 / J+1, filtres par adresse et par responsable. Helper resolveResponsable centralisé avec 4 niveaux de fallback : est_chef_jour → chef_projet → manutention staffé → chargé d'affaires. 6 tests Vitest.",
      },
      {
        type: "feature",
        title: "Désignation chef du jour par chantier × date",
        description:
          "Nouveau champ assignations.est_chef_jour + trigger enforce_unique_chef_jour qui garantit un seul chef du jour par couple (affaire_id, date) — désigner un nouveau chef bascule automatiquement le précédent à false. Index partiel idx_assignations_chef_jour. Checkbox dans AssignationDialog.",
      },
      {
        type: "feature",
        title: "Champ type_operation sur assignation",
        description:
          "Nouveau champ assignations.type_operation (text libre) avec combobox dans AssignationDialog proposant 8 options pré-remplies (Montage, Démontage, Préparation, Livraison, Récupération, Maintenance, Repérage, Atelier). Affiché sur la feuille de route quotidienne.",
      },
      {
        type: "feature",
        title: "Export Excel « Feuille de route » (template équipes terrain)",
        description:
          "Bouton « Exporter Excel » sur la feuille de route avec dialog plage 1-7 jours. Format conforme au template terrain : date_header → chantier_header → chantier_data → liste équipe (NOM Prénom en majuscule). Génération via XLSX.",
      },
      {
        type: "feature",
        title: "Export PDF imprimable feuille de route",
        description:
          "Bouton « Exporter PDF » : A4 portrait, 1 page = 1 jour, blocs chantiers verticaux. Réutilise le moteur PDF existant.",
      },
      {
        type: "feature",
        title: "Édition directe depuis Planning par chantier (Bloc 6)",
        description:
          "Clic sur cellule vide chantier × jour → ouvre la modale d'affectation pré-remplie (affaire + date + lot devis si unique). Ctrl+clic multi-cellules même ligne → modale bulk multi-employé multi-jour avec skip des cellules occupées. Cellules sur affaires termine/annule passent en lecture seule avec icône cadenas. Helper parchantier-edit.ts + 8 tests Vitest.",
      },
      {
        type: "fix",
        title: "Intérimaire : date d'assignation désormais éditable",
        description:
          "Correction d'un bug qui forçait silencieusement la date au lundi de la semaine courante lors de la création d'une assignation pour un intérimaire. La date est maintenant éditable via le Calendar comme pour les CDI.",
      },
      {
        type: "improvement",
        title: "30 nouveaux tests Vitest (229 au total)",
        description:
          "12 affaire-lock + 12 bulk-staffer + 6 feuille-route-helpers + 4 feuille-route-excel + 8 parchantier-edit. Couverture du verrouillage des affaires, des conflits AM/PM/full sur bulk staffing, des 4 niveaux de fallback chef du jour, du format Excel template, et du skip des cellules occupées en édition par chantier.",
      },
      {
        type: "refactor",
        title: "4 migrations DB consolidées",
        description:
          "(1) affaire-lock : is_affaire_open + can_saisie_on_affaire + RLS heures_saisies_self_insert + index statut. (2) audit-heures : saisi_par + saisi_par_chef sur heures_saisies + action_type + pour_compte_de sur heures_saisies_historique + trigger set_saisie_authorship + trigger log_heures_saisies_transition enrichi + RLS hsh_select_admin + 3 indexes audit. (3) notify-saisie-chef : trigger notify_saisie_par_chef avec anti-spam. (4) feuille-route : assignations.type_operation + assignations.est_chef_jour + trigger enforce_unique_chef_jour + index partiel.",
      },
      {
        type: "improvement",
        title: "Audit pré-publish v0.21 — RLS / triggers / perf",
        description:
          "Audit en lecture stricte sur 10 axes : RLS et récursion (helpers SECURITY DEFINER avec search_path = public, pas de référence auto-récursive sur heures_saisies), triggers DB (pas de boucle infinie, anti-spam notif validé), régression saisie employé (compatibilité pré-v0.21 préservée, badge 👤 absent sur vieilles lignes), saisie chef (statut 'valide' uniformément appliqué), verrouillage affaires (Option B respectée), bulk staffing (skip occupées + filtrage isAffaireSelectable), feuille de route (4 niveaux de fallback testés), édition par chantier (lock cohérent), tests gaps identifiés, cohérence UI (ordre onglets Planning + sidebar). 0 BLOCKER. Findings MEDIUM reportés en v0.21.1.",
      },
    ],
  },
  {
    date: "2026-04-25",
    version: "v0.20.0",
    title: "Hotfix accès employé /fabrication/mes-etapes + audit pré-publish v0.20",
    entries: [
      {
        type: "fix",
        area: "Sécurité — Routing",
        title: "🚨 BLOCKER fixé : /fabrication ajouté à EMPLOYE_DESKTOP_ALLOWED",
        description:
          "Audit pré-publish v0.20 a identifié que la route /fabrication/mes-etapes (livrée v0.20) était inaccessible aux employés desktop : le guard AppGuard les redirigeait vers /dashboard-employe au clic sur la sidebar « Mes étapes fab ». Fix : ajout de '/fabrication' dans EMPLOYE_DESKTOP_ALLOWED de src/routes/_app.tsx, qui couvre /fabrication/mes-etapes via startsWith. Le dashboard /fabrication global reste protégé par son propre guard chef/admin côté composant. tsc --noEmit ✅.",
      },
      {
        type: "improvement",
        area: "Audit",
        title: "✅ Audit RLS Fabrication clean — pas de récursion détectée",
        description:
          "Vérification post-hotfix v0.18.3 : les 3 nouvelles tables fabrication_objets / fabrication_etapes / fabrication_etapes_historique utilisent bien is_chef_or_admin() (SECURITY DEFINER, search_path public) sans EXISTS auto-référencé. Les 3 triggers de notification (assignation, prêt à livrer, signée) ne réécrivent jamais sur leur propre table source — pas de boucle infinie. Anti-spam 24h confirmé sur 'affaire prête à livrer'. Les indexes de base sont en place pour les KPIs dashboard.",
      },
      {
        type: "improvement",
        area: "Audit",
        title: "✅ Compatibilité saisie heures pré-v0.20 préservée",
        description:
          "Vérifié que les heures saisies AVANT v0.20 (avec fabrication_objet_id et fabrication_etape_type NULL) s'affichent et se ré-éditent sans erreur. Le sous-bloc 'Sur quoi as-tu travaillé ?' est strictement optionnel et collapsible par défaut. Si un utilisateur n'a aucun flag rôle fabrication, le dropdown Étape reste vide sans crash.",
      },
    ],
  },
  {
    date: "2026-04-25",
    version: "v0.20",
    title: "Module Fabrication / Suivi de production (remplace Asana)",
    entries: [
      {
        type: "feature",
        area: "Fabrication",
        title: "Onglet Fabrication sur fiche affaire — tableau objets × 4 étapes",
        description:
          "Tableau BE / Respo Fab / Finition / Manutention par objet, avec statuts (a_faire / en_cours / termine / non_applicable), assignees, validateurs et historique. Vue cards mobile dédiée < 1024px.",
      },
      {
        type: "feature",
        area: "Fabrication",
        title: "5 flags rôles indépendants + matrice bulk /parametres/roles-fabrication",
        description:
          "Chef projet, Bureau d'étude, Respo Fab, Finition, Manutention configurables sur fiche employé et via une matrice bulk admin.",
      },
      {
        type: "feature",
        area: "Fabrication",
        title: "4 flags d'applicabilité par objet (a_dessiner, a_construire, est_brut, a_emballer)",
        description:
          "Modale création/édition objet pose 4 questions Oui/Non qui basculent automatiquement les étapes correspondantes en non_applicable. Trigger DB sync_fabrication_etapes_on_flags_change garantit la cohérence.",
      },
      {
        type: "feature",
        area: "Fabrication",
        title: "Dashboard /fabrication (chef/admin) + page /fabrication/mes-etapes (employé)",
        description:
          "Dashboard global avec KPIs, charge par pôle, étapes non assignées et affaires prêtes à livrer. Page perso listant les étapes assignées à l'utilisateur, triées par urgence (date démontage).",
      },
      {
        type: "feature",
        area: "Fabrication",
        title: "Lien optionnel saisie heures ↔ objet/étape",
        description:
          "Sous-bloc collapsible 'Sur quoi as-tu travaillé ?' sur chaque saisie : dropdown Objet (filtré par affaire) + dropdown Étape (filtré par flags rôle de l'utilisateur).",
      },
      {
        type: "feature",
        area: "Logistique",
        title: "Lien automatique avec module Demandes transport et flotte interne",
        description:
          "Bandeau 'Affaire prête à livrer' apparaît dès que toutes les étapes Manutention sont termine ou non_applicable. Boutons Staffer véhicule interne (Camion 20m³ par défaut) ou Demander trajet sous-traité.",
      },
      {
        type: "feature",
        area: "Notifications",
        title: "Notifications in-app fabrication (3 types)",
        description:
          "Assignation à une étape (notif assignee), Affaire prête à livrer (notif chef projet, anti-spam 24h), Affaire signée (notif chef projet ou admins).",
      },
      {
        type: "improvement",
        area: "Fabrication",
        title: "Hors-scope reporté en v0.20.1 — import objets depuis devis",
        description:
          "Bouton 'Importer depuis devis' présent mais désactivé (tooltip explicatif). Parser à entraîner sur des devis réels avant ouverture.",
      },
    ],
  },
  {
    date: "2026-04-22",
    version: "v0.19",
    title: "Vraie page Demandes transport — suivi trajets sous-traités",
    entries: [
      {
        type: "feature",
        area: "Logistique",
        title: "Tableau filtrable de tous les trajets sous-traités",
        description:
          "Refonte complète de /export/demandes-devis (héritage incohérent depuis v0.13 où la route servait par erreur d'Export planning) en une vraie page de suivi des trajets sous-traités. Tableau 10 colonnes : Référence, Date, Horaires, Adresse départ, Adresse arrivée, Aller-retour, Véhicule demandé, Affaire, Prestataire, Statut (parmi a_sous_traiter / devis_envoye / confirme / non), Commentaires. Tri sur toutes les colonnes, pagination 50 lignes, recherche texte globale.",
      },
      {
        type: "feature",
        area: "Logistique",
        title: "Filtres période / statut / prestataire / affaire + compteurs interactifs",
        description:
          "Filtres multi-critères en haut de page : plage de dates, statut sous-traitance, prestataire, affaire, recherche texte. Compteurs cliquables par statut pour filtrage rapide. Clic ligne → ouvre la modale TrajetDialog existante (mêmes actions que depuis Planning Flotte). Menu contextuel par ligne pour transition rapide de statut (à sous-traiter → devis envoyé → confirmé).",
      },
      {
        type: "feature",
        area: "Logistique",
        title: "Approche hybride : drawer « Générer texte demande » conservé",
        description:
          "Le tableau filtrable devient la vue principale, mais le mode « copier-coller mail » historique reste accessible via un bouton dédié dans le header de page : ouvre une modale avec textarea pré-remplie (groupement par date, format chronologique, copie en un clic). Permet à Gabin de continuer à générer ses mails aux transporteurs sans cliquer partout. Pas de duplication fonctionnelle : les exports CSV/XLSX trajets sous-traités de v0.18.1 restent intégrés à la même page.",
      },
      {
        type: "feature",
        area: "DB",
        title: "Migration trajets : colonnes prestataire + aller_retour + reference auto-générée",
        description:
          "Ajout de 3 colonnes natives à `trajets` : `prestataire` (text, fini le parsing depuis `notes`), `aller_retour` (boolean, fini le calcul via `parent_trajet_id`), `reference` (text au format `TR-YYYY-NNNNN` auto-générée par séquence + trigger). Permet une exploitation directe sans transformation côté client. TrajetDialog enrichi du champ Prestataire. Export trajets sous-traités migré pour utiliser ces colonnes natives.",
      },
      {
        type: "feature",
        area: "Logistique",
        title:
          "Workflow brouillon → envoyé : filtre par défaut + auto-passage au copier-coller mail",
        description:
          "Au chargement de /export/demandes-devis, le filtre statut est pré-positionné sur « Brouillon » pour que Gabin voie uniquement ce qui reste à envoyer. Le drawer « Générer texte demande » affiche une note explicite indiquant le nombre de trajets brouillons qui seront marqués comme envoyés au clic. Bouton principal « Copier et marquer comme envoyé » → copie clipboard + UPDATE statut_soustraitance='devis_envoye' + soustraitance_envoye_le=now() en une seule action atomique (filtré sur statut a_sous_traiter uniquement, pour ne pas re-toucher les déjà envoyés/confirmés). Bouton secondaire discret « Copier sans marquer envoyé » conservé pour les cas de relecture. Snapshot de la liste au moment de l'ouverture pour éviter les surprises si les filtres changent. Toast détaillé + refresh tableau + auto-fermeture modale en cas de succès. En cas d'erreur DB, statuts conservés en brouillon avec log console pour debug.",
      },
      {
        type: "fix",
        area: "Cohérence routing",
        title: "Item sidebar « Demandes transport » pointe vers la bonne page",
        description:
          "Vérification : l'autre Export planning Excel (matriciel multi-semaines CDI/Intérim/Synthèse/Heures) existe bien à /export en section Administration — pas de doublon à supprimer. La route /export/demandes-devis est désormais cohérente avec son nom et son item sidebar LOGISTIQUE > Demandes transport.",
      },
      {
        type: "fix",
        area: "Cohérence routing",
        title: "Layout route /export (ajout <Outlet />) — fix régression d'affichage",
        description:
          "Le fichier _app.export.tsx était une page terminale sans <Outlet />, ce qui faisait que /export/demandes-devis affichait toujours le rendu parent (Export planning Excel) au lieu de la nouvelle page enfant. Fix : _app.export.tsx devient un layout route minimal (Outlet only), et l'Export planning Excel est déplacé dans _app.export.index.tsx pour conserver l'URL /export historique. Sidebar Administration > Export planning inchangée.",
      },
      {
        type: "fix",
        area: "Flotte",
        title: "Affichage dates location véhicules loués + filtrage planning strict hors période",
        description:
          "Bug remonté par Gabin : le tableau /flotte onglet « Loués / Sous-traitance » n'affichait pas les colonnes date_debut_location / date_fin_location malgré la présence des champs en DB depuis v0.15. Ajout de 2 colonnes « Début location » et « Fin location » (format FR JJ/MM/AAAA) entre Propriétaire et CT. La colonne Fin location passe en badge warning ≤ 30 jours avant échéance et en badge destructive si déjà expirée. La modale VehiculeDialog éditait déjà ces 2 dates (DatePickers natifs), pas de changement. Vérification du filtrage planning : FlotteGrid masque déjà strictement un véhicule loué si la semaine affichée est entièrement hors plage [date_debut_location, date_fin_location], donc location expirée → disparait du planning, location future → pas encore affichée. Sémantique métier intacte.",
      },
    ],
  },
  {
    date: "2026-04-22",
    version: "v0.18.3",
    title:
      "🚨 Hotfix récursion RLS assignations post-v0.18.2 — policy Option Z refactorisée via fonction SECURITY DEFINER",
    entries: [
      {
        type: "fix",
        area: "Sécurité — Hotfix critique",
        title: "Casse la récursion infinie RLS sur assignations",
        description:
          "La policy Option Z livrée en v0.18.2 (EXISTS sur assignations dans la policy d'assignations) déclenchait `infinite recursion detected in policy for relation 'assignations'` et bloquait Planning, Export, Dashboard, Heures restantes — tous les écrans qui lisent assignations. Refactor via deux fonctions SECURITY DEFINER (`user_has_affaire_access(_affaire_id)` + `user_is_mentioned_on_affaire(_affaire_id)`) qui isolent la sous-requête du contexte RLS. Sémantique métier préservée à 100% (employé voit ses collègues sur les affaires où il est staffé, accès via mention conservé). Policies impactées : `assignations_select_self_or_chef`, `heures_saisies_self_select`, `affaire_commentaires_select_chef_admin_or_mentioned`, `affaires_select_chef_admin_or_assigned`.",
      },
      {
        type: "fix",
        area: "Sécurité — Audit défense en profondeur",
        title: "Vérification systématique des policies à risque de récursion",
        description:
          "Audit complet des policies utilisant `EXISTS` sur leur propre table ou des tables croisées (heures_saisies → assignations, affaires → assignations + commentaires). Toutes refactorisées via fonctions SECURITY DEFINER. Aucune autre récursion détectée dans les 23 policies actives.",
      },
    ],
  },
  {
    date: "2026-04-22",
    version: "v0.18.2",
    title:
      "Consolidation RLS — 6 findings audit B + 2 mineurs audit A (option Z planning partagé par chantier)",
    entries: [
      {
        type: "fix",
        area: "Sécurité — A1",
        title: "Drop doublon UNIQUE affaires_numero_unique",
        description:
          "Suppression de la contrainte redondante `affaires_numero_unique` (on garde le standard `affaires_numero_key`). Plus de duplication structurelle sur la colonne `affaires.numero`.",
      },
      {
        type: "fix",
        area: "Sécurité — A2 / M3",
        title: "Policy heures_saisies_self_update — USING/CHECK alignés",
        description:
          "USING et WITH CHECK couvrent désormais tous deux `brouillon` ET `soumis` (un employé peut éditer son brouillon et le soumettre dans la même opération). Commentaire SQL inline pour rappeler que le trigger `guard_heures_saisies_transition` valide la transition réelle.",
      },
      {
        type: "feature",
        area: "Sécurité — M1",
        title: "Vue v_vehicules_public — coût/contrat masqués aux livreurs",
        description:
          "Nouvelle vue `v_vehicules_public` (security_invoker) exposant les colonnes safe : id, nom, type, immatriculation, marque, modèle, permis_requis, capacité, poids/volume, propriétaire, dates contrôle/révision/assurance, dates de location. Masque `cout_journalier_eur`, `prestataire_location`, `reference_contrat`, `fournisseur_location`. Utilisable côté livreur pour les futurs écrans mobiles (les chefs/admins continuent de lire la table complète sur Flotte / Planning / TrajetDialog).",
      },
      {
        type: "fix",
        area: "Sécurité — M2",
        title: "RPC next_affaire_numero réservée aux chefs/admins",
        description:
          "Ajout de `IF NOT public.is_chef_or_admin() THEN RAISE EXCEPTION 'insufficient_privilege'` en tête de la fonction. Cohérence avec `create_opportunite`, `sign_opportunite`, `import_devis_atomique`. Plus de divulgation indirecte du compteur 5XXX/9XXX par un employé.",
      },
      {
        type: "feature",
        area: "Sécurité — M4",
        title: "Vue v_feedbacks_public — notes admin masquées à l'auteur",
        description:
          "Nouvelle vue `v_feedbacks_public` (security_invoker) qui omet `notes_admin` et `resolved_by`. Les chefs auteurs voient leur signalement et son statut, mais pas les annotations internes admin (« doublon », « à recadrer », etc.). L'admin garde l'accès complet à la table feedbacks pour annoter et résoudre.",
      },
      {
        type: "feature",
        area: "Sécurité — M5",
        title: "Option Z — Planning partagé par chantier (assignations + heures + commentaires)",
        description:
          "Choix produit tranché par Gabin : un employé voit toutes les assignations / heures / commentaires des chantiers sur lesquels IL EST LUI-MÊME STAFFÉ (pas toutes les assignations, pas uniquement les siennes). Policies SELECT enrichies sur `assignations`, `heures_saisies`, `affaire_commentaires` avec EXISTS croisé sur `affaire_id`. Permet aux coéquipiers d'une même équipe de se voir (utile pour swaps, covoiturage, coordination terrain).",
      },
      {
        type: "fix",
        area: "Sécurité — M6",
        title: "Affaires accessibles si mentionné dans un commentaire",
        description:
          "Policy `affaires_select_chef_admin_or_assigned` élargie avec `OR EXISTS (SELECT 1 FROM affaire_commentaires WHERE affaire_id = affaires.id AND auth.uid() = ANY (mentions))`. Plus de 404 RLS quand un chef mentionne un employé sur une affaire où il n'est pas (encore) assigné — la notif devient cliquable.",
      },
      {
        type: "improvement",
        area: "Sécurité — F1/F2",
        title: "Documentation des ouvertures intentionnelles (adresses_favorites, vca)",
        description:
          "COMMENT ON POLICY ajouté sur `adresses_favorites_select_authenticated` et `vca_select_authenticated` pour figer le choix : référentiels logistiques partagés (adresses entrepôts/clients/fournisseurs et liste des chauffeurs autorisés sur PL) accessibles à tous les utilisateurs authentifiés. Pas de risque, juste de la doc.",
      },
      {
        type: "improvement",
        area: "Audit final",
        title: "✅ TypeScript vert, Supabase linter clean, RLS toutes alignées",
        description:
          "Post-migration : `tsc --noEmit` silencieux, supabase--linter retourne 0 issue, aucune régression côté UI (les hooks existants `use-vehicules.ts`, `use-feedbacks` côté admin restent sur la table complète puisque utilisés en contexte chef/admin uniquement). Les vues `v_vehicules_public` et `v_feedbacks_public` sont prêtes pour les futurs écrans côté livreur / chef-auteur.",
      },
    ],
  },
  {
    date: "2026-04-22",
    version: "Audit v0.18.1",
    title: "Audit de stabilité post-prod — empilement v0.15 → v0.17 → v0.18 → v0.18.1",
    entries: [
      {
        type: "improvement",
        area: "Audit",
        title: "✅ Sanité technique : 0 erreur TypeScript, 156/156 tests Vitest, Supabase linter clean",
        description:
          "tsc --noEmit silencieux. 6 fichiers de tests, 156 assertions vertes (employes, devis, opportunités, flotte, demandes-devis). supabase--linter remonte 0 issue. Build production stable.",
      },
      {
        type: "improvement",
        area: "Audit",
        title: "✅ Cohérence DB : 25 tables, 23 RLS actives, 44 FK, 167 contraintes CHECK, 0 orphelin",
        description:
          "Toutes les colonnes/tables ajoutées en v0.15-v0.18.1 sont présentes (affaires.phase/code_opportunite/charge_affaires_id/taille, assignations.devis_id/metier_id, heures_saisies.heures_nuit, profiles.matricule_silae, employes.est_livreur/categories_permis, vehicules.date_fin_location/prestataire_location, lieux, vehicule_chauffeurs_autorises, opportunites_imports, trajets). Vue v_affaire_consommation correctement à jour (somme assignations.heures sans filtre devis_id, correctif v0.18.1 confirmé). 0 ligne orpheline sur 5 FK testées (assignations→devis/affaires, heures→employe, trajets→chauffeur/vehicule).",
      },
      {
        type: "improvement",
        area: "Audit",
        title: "✅ RLS : matricule SILAE admin only, lieux admin only, vehicule_chauffeurs_autorises chef/admin",
        description:
          "Trigger guard_matricule_silae_admin_only confirmé actif. Policy lieux_admin_modify (admin only en écriture, lecture authentifiée). Policy vca_admin_chef_modify (chef/admin en écriture). 28 triggers actifs sur tables critiques (notifications, guards, log historique). Aucune policy USING(true) sur table sensible.",
      },
      {
        type: "improvement",
        area: "Audit",
        title: "✅ Data prod cohérente : 91 affaires, 370 employés (219 actifs), 5 devis, 8 véhicules",
        description:
          "Sondage prod : 91 affaires (toutes en phase=signe), 0 opportunité créée pour l'instant, 219 employés actifs sur 370, 6 employés liés à un compte (les autres sont intérimaires sans login), 8 véhicules dont 1 loué, 1 atelier + 1 stockage configurés, 6 trajets, 0 feedback reçu sur 7 jours.",
      },
      {
        type: "fix",
        area: "Audit — mineurs",
        title: "⚠️ Doublon contrainte UNIQUE affaires_numero_key vs affaires_numero_unique",
        description:
          "Deux contraintes UNIQUE redondantes sur affaires.numero (affaires_numero_key + affaires_numero_unique). Sans gravité fonctionnelle, juste de la dette. À nettoyer en v0.18.2 via DROP CONSTRAINT affaires_numero_unique.",
      },
      {
        type: "fix",
        area: "Audit — mineurs",
        title: "⚠️ Policy heures_saisies_self_update : USING/CHECK incohérents",
        description:
          "Le USING exige statut='brouillon' (correct) mais le WITH CHECK accepte encore brouillon OR soumis. Pas exploitable car USING bloque déjà la lecture, mais à aligner pour clarté en v0.18.2.",
      },
      {
        type: "fix",
        area: "Audit — cosmétique",
        title: "⚠️ 3207 erreurs Prettier (formatage auto-fixable) + ~24 warnings ESLint réels",
        description:
          "Aucune erreur fonctionnelle. Le projet n'est pas formaté Prettier (à régler via `bunx eslint --fix`). 24 warnings ESLint réels : quelques `any` dans 4-5 fichiers, dépendances exhaustives manquantes sur useMemo/useEffect (weekStart/weekEnd dans use-trajets.ts), warnings react-refresh sur fichiers exportant constantes ET composants. À nettoyer progressivement.",
      },
      {
        type: "improvement",
        area: "Audit",
        title: "🟢 Recommandation finale : app stable, GO pour v0.16 ou v0.18.2",
        description:
          "Aucun bloquant. Aucun majeur. Les 3 mineurs/cosmétiques peuvent être groupés dans une v0.18.2 légère (1 migration DROP CONSTRAINT + alignement policy + bunx eslint --fix). Sinon, on peut directement attaquer v0.16 (auto-envoi devis Resend) sans risque. La consolidation post-empilement v0.15→v0.18.1 est validée.",
      },
    ],
  },
  {
    date: "2026-04-22",
    version: "v0.18.1",
    title: "Correctifs post-publish v0.18 — Flotte, livreur/chauffeur, lieux entreprise, suggestions trajets, export sous-traitance + polish UI",
    entries: [
      {
        type: "feature",
        area: "Flotte",
        title: "Autorisation chauffeur PL actionnable depuis la modale Trajet",
        description:
          "Dans la modale « Nouveau trajet » sur un poids lourd, tous les livreurs actifs sont désormais listés (au lieu d'être silencieusement masqués). Les non-autorisés sont grisés avec une raison claire (« Permis non compatible » ou « À autoriser sur ce PL »), et un bouton « Autoriser » (admin/chef) ajoute l'employé à `vehicule_chauffeurs_autorises` via l'RPC `set_vehicule_chauffeurs_autorises` puis rafraîchit le dropdown. Le livreur passe immédiatement en sélectionnable. Compatibilité rétro : un livreur sans permis renseigné reste accepté (legacy v0.18).",
      },
      {
        type: "feature",
        area: "Flotte",
        title: "Fond de ligne teinté pour véhicules loués / sous-traités + badges Loué / S/T",
        description:
          "Les lignes de la grille `FlotteGrid` héritent d'une teinte `bg-warning/5` quand le véhicule a `proprietaire = 'location' | 'sous_traitance'`, avec badge dédié. Distinction visuelle immédiate entre la flotte interne et les véhicules ponctuels.",
      },
      {
        type: "fix",
        area: "Flotte",
        title: "date_fin_location filtre désormais l'affichage planning",
        description:
          "Les véhicules dont `date_fin_location` est dépassée disparaissent automatiquement de la grille planning et des sélecteurs. Pas besoin de désactiver manuellement la fiche.",
      },
      {
        type: "feature",
        area: "Flotte",
        title: "Bouton « + S/T » par jour pour créer un trajet sous-traité hors véhicule",
        description:
          "Au pied de chaque colonne de jour, un bouton ouvre la modale Trajet avec le switch « Sous-traiter ce trajet » déjà activé et la date pré-remplie. Permet de saisir un trajet à externaliser sans véhicule interne attribué.",
      },
      {
        type: "improvement",
        area: "Flotte",
        title: "Tooltip explicatif sur la section « À sous-traiter »",
        description:
          "Header enrichi d'un icône info détaillant l'origine de ces trajets (créés via le switch « Sous-traiter ce trajet ») et listant les statuts possibles (à envoyer / devis envoyé / confirmé). Lève l'ambigüité signalée en QA terrain.",
      },
      {
        type: "feature",
        area: "Paramétrage",
        title: "Page /parametres/lieux pour gérer ATELIER (unique) + STOCKAGE (1..N)",
        description:
          "Nouvelle page admin (lien dans la sidebar « Lieux entreprise ») permettant de déclarer l'atelier principal de Setup Paris (unique) et N adresses de stockage. Adresse autocomplétée via Nominatim, désactivation soft (flag `actif`). Ces lieux alimentent les suggestions auto de trajets.",
      },
      {
        type: "feature",
        area: "Flotte",
        title: "Suggestions automatiques de trajets ATELIER ↔ chantier",
        description:
          "Bloc « Suggestions trajets » dans l'onglet Véhicules staffés : scanne les `affaires` actives avec `date_montage`/`date_demontage` dans la semaine et propose 1 trajet « Pose » (ATELIER → chantier) au montage et 1 trajet « Dépose » (chantier → ATELIER ou STOCKAGE choisi) au démontage. Clic sur « Créer » → ouvre la modale Trajet pré-remplie (adresses, catégorie, affaire, date). Plus aucun trajet à saisir à la main pour les chantiers récurrents.",
      },
      {
        type: "feature",
        area: "Export",
        title: "Export trajets sous-traités (CSV UTF-8 BOM + Excel) — 15 colonnes",
        description:
          "Bouton « Exporter trajets sous-traités » dans l'onglet Véhicules staffés (distinct de l'export SILAE des heures salariés). Filtres : plage de dates, statuts (à sous-traiter / devis envoyé / confirmé), affaire, prestataire. Colonnes : Référence, Date, Horaires, Adresses départ/arrivée, Aller-retour (oui/non basé sur parent_trajet_id), Véhicule demandé, Kilométrage estimé, Affaire + code, Catégorie, Prestataire (« À attribuer » si vide), Statut, Commentaires. Usage : transmission directe au transporteur pour demande de devis groupée.",
      },
      {
        type: "feature",
        area: "Employés",
        title: "Section Capacités/Permis sur fiche employé : livreur + permis B/C/CE/D",
        description:
          "Nouveau bloc dans la modale d'édition employé : checkbox « Livreur/Chauffeur » + tags multi-sélection des catégories de permis détenues (B / C / CE / D). Stocké dans `employes.est_livreur` et `employes.categories_permis` (array enum `categorie_permis`). Le filtrage chauffeur dans Planning Flotte s'appuie sur ces deux champs (cf. helper `getChauffeursAvecStatut`).",
      },
      {
        type: "fix",
        area: "Pilotage",
        title: "Audit Heures staffées vs réalisées — colonnes restées cohérentes",
        description:
          "Validation visuelle terrain (Maison&Objet) : la vue `v_devis_consommation` distingue désormais clairement `heures_assignees` (planning prévu), `heures_reelles_validees` (chef OK) et `heures_reelles_soumises` (en attente). Les indicateurs de consommation budget pilotage chantier sont remontés correctement.",
      },
      {
        type: "improvement",
        area: "Design system",
        title: "Polish UI Kanban opportunités — focus visible + KeyboardSensor",
        description:
          "Cartes opportunités : ajout de `focus-within:ring-2 focus-within:ring-ring` et bouton de drag avec focus-visible cohérent. Ajout du `KeyboardSensor` @dnd-kit avec `sortableKeyboardCoordinates` pour permettre le déplacement des cartes au clavier (espace pour saisir, flèches pour déplacer, espace pour valider). Tokens sémantiques utilisés partout (warning, primary, ring) — aucune couleur hard-codée résiduelle dans les composants Flotte.",
      },
    ],
  },
  {
    date: "2026-04-22",
    version: "v0.18",
    title: "Export SILAE + heures de nuit déclaratives + matricule SILAE + fix filtre Métiers (titulaires/renforts)",
    entries: [
      {
        type: "feature",
        area: "Paie / Export",
        title: "Export SILAE 28 colonnes (CSV UTF-8 BOM + Excel 2 onglets)",
        description:
          "Bouton « Exporter validées » sur /validation-heures qui génère en parallèle un CSV (UTF-8 + BOM, séparateur `;`, dates JJ/MM/AAAA, virgule décimale FR — destiné import SILAE/PROGBAT) et un Excel `.xlsx` à 2 onglets (Détail saisies + Récap hebdo par employé). 28 colonnes : matricule SILAE, nom/prénom, catégorie contrat, date / semaine ISO / jour / mois / année, code et phase affaire, nom et adresse chantier, poste affecté (métier mobilisé) vs métier principal, badge PROTO si phase opportunité, heures totales / jour / nuit / dimanche / férié (calcul automatique des fériés FR via algorithme de Butcher pour Pâques + dates fixes), commentaires employé et chef, statut, valideur, date validation, devis_id. On remonte les données brutes : SILAE applique son moteur de paie (HS 125/150 %, paniers, primes hauteur/salissure).",
      },
      {
        type: "feature",
        area: "Saisie heures",
        title: "Heures de nuit déclaratives sur la modale de saisie (collapse par défaut)",
        description:
          "Champ optionnel « Dont heures de nuit » sur la modale `MesHeuresGrid` avec tooltip explicatif (00h-06h selon convention spectacle vivant). Default 0, modifiable par l'employé et par le chef au moment de la validation. Stockage dans `heures_saisies.heures_nuit` numeric(5,2) avec trigger DB `validate_heures_nuit` qui interdit les valeurs négatives ou supérieures aux heures réelles. Phase 1 = saisie déclarative ; Phase 2 (v0.19) = horaires précis avec auto-calcul par overlap.",
      },
      {
        type: "feature",
        area: "RH",
        title: "Matricule SILAE éditable uniquement par admin sur la fiche employé",
        description:
          "Nouveau champ `profiles.matricule_silae` (text nullable) visible et éditable uniquement par les administrateurs depuis la modale d'édition employé (section RH, à côté du contrat). Trigger DB `guard_matricule_silae_admin_only` qui bloque toute modification non-admin. Ce matricule est la clé de jointure principale de l'export SILAE.",
      },
      {
        type: "feature",
        area: "Planning",
        title: "Fix filtre Métiers : sections « Titulaires » + « Renforts » (task #51)",
        description:
          "La colonne `assignations.metier_id` devient nullable et trace le « métier mobilisé » (différent du métier principal de l'employé = renfort). Le filtre Métiers du planning inclut désormais un employé dans la section X si son métier principal = X OU s'il a au moins une assignation de la semaine filtrée avec metier_id = X. Affichage scindé en 2 sous-sections visuelles par métier (Titulaires + Renforts), badge discret du métier d'origine sur les cartes des renforts, header enrichi `Peinture (7) — 5 titulaires + 2 renforts`. Modale `AssignationDialog` complétée d'un dropdown « Métier mobilisé » pré-rempli avec le métier principal mais éditable par le chef.",
      },
      {
        type: "improvement",
        area: "Imports",
        title: "Hash anti-doublon SHA-256 sur l'import CRM opportunités",
        description:
          "Nouvelle table `opportunites_imports` qui stocke un hash SHA-256 de chaque fichier importé. Au glisser-déposer, l'app calcule le hash, interroge la table et bloque l'import avec un toast clair `Ce fichier a déjà été importé le …` si une signature identique existe déjà. Évite les doublons accidentels lors de mises à jour CRM répétées.",
      },
      {
        type: "improvement",
        area: "Design system",
        title: "Migration des couleurs hardcoded restantes vers tokens sémantiques",
        description:
          "Remplacement systématique des classes `text-emerald-*`, `text-amber-*`, `text-red-*`, `text-blue-*` par les tokens `text-success`, `text-warning`, `text-destructive`, `text-info` (et variantes `bg-*/10`, `border-*/30`). Composants nettoyés : Roadmap, AdminFeedback, BulkInviteDialog, SwapsList, Dashboard, AuthResetPassword. Cohérence clair/sombre garantie.",
      },
      {
        type: "improvement",
        area: "Tests",
        title: "Tests unitaires Vitest sur le parser Excel/CSV opportunités",
        description:
          "Nouvelle suite `src/lib/__tests__/opportunites-import.test.ts` : ligne valide, sans code (ou code hors plage 9XXX), code existant (simulation), colonnes manquantes, taille invalide, alias tailles (XS/P/M/L/XL) et statuts FR (gagnée/perdue/terminée), lignes vides, fichier vide. Garantit la stabilité du parser face aux variations CRM.",
      },
    ],
  },
  {
    date: "2026-04-21",
    version: "v0.15.2",
    title: "Hotfix terrain — modals stables, planning débloqué, véhicules loués datés",
    entries: [
      {
        type: "fix",
        area: "UX globale",
        title: "Bug #1 P0 — Les modals/sheets ne se ferment plus au changement d'onglet Chrome",
        description:
          "Patch global sur les composants Dialog et Sheet (Radix) : `onFocusOutside` désactivé et `onInteractOutside` ignore les événements provenant hors du document (window blur). Les chefs peuvent maintenant changer d'onglet pour vérifier une info sans perdre la saisie en cours sur fiche employé, fiche véhicule, fiche affaire, etc. Aucune régression sur la fermeture par X / Annuler / Escape / clic overlay.",
      },
      {
        type: "fix",
        area: "Planning",
        title: "Bug #2 P0 — Bouton Supprimer affectation à nouveau cliquable",
        description:
          "Le popover de confirmation `Supprimer cette affectation ?` était masqué par le tooltip de hover de la cellule planning. Fix : `z-[60]` sur le PopoverContent (au-dessus du z-50 du tooltip) + le tooltip est forcé fermé tant que le popover de confirmation est ouvert. Workflow de suppression d'affectations à nouveau fluide.",
      },
      {
        type: "feature",
        area: "Logistique",
        title: "Véhicules loués — dates de location, prestataire, ref contrat, coût journalier + filtre planning actif",
        description:
          "Ajout des colonnes `date_debut_location`, `date_fin_location`, `prestataire_location`, `reference_contrat` et `cout_journalier_eur` sur la table `vehicules`. Dans la fiche véhicule (mode location/sous-traitance), 5 nouveaux champs avec dates obligatoires. Le planning Flotte masque automatiquement les véhicules loués hors plage de location active → fini l'alourdissement avec d'anciennes locations qui restaient affichées en permanence. La liste véhicules avec filtres statut/période fait office d'historique des locations (scope minimal v0.15.2 — page dédiée et reporting coût par affaire reportés v0.16+).",
      },
    ],
  },
  {
    date: "2026-04-21",
    version: "v0.15.1",
    title: "Phases de chantier / lots de devis — multi-devis bout en bout",
    entries: [
      {
        type: "feature",
        area: "Workflow devis",
        title: "Cycle de vie devis enrichi : Brouillon → Signé → En cours → Terminé → Clôturé",
        description:
          "Statuts `signe` et `termine` ajoutés à `devis_statut`. Action « Marquer livré » sur la fiche affaire qui passe le lot à Terminé (`livre_le`, `livre_par` historisés). Action admin « Rouvrir » qui ramène un lot Terminé en En cours, audit-loggée. Permet de suivre la livraison réelle des lots indépendamment de la facturation.",
      },
      {
        type: "feature",
        area: "Schéma DB",
        title: "FK `assignations.devis_id` (nullable) + backfill auto mono-devis",
        description:
          "Nouvelle FK sur `assignations` et `heures_saisies` vers `devis(id)`. Migration de backfill : pour toute affaire avec un seul devis actif, les assignations/heures orphelines sont automatiquement rattachées (idempotente). Les chantiers multi-devis restent à traiter via la page admin dédiée. Index ajouté pour la perf des requêtes par lot.",
      },
      {
        type: "feature",
        area: "Sécurité",
        title: "RLS : verrouillage post-livraison côté chef + override admin",
        description:
          "Helper SQL `is_devis_termine(_devis_id)` utilisé dans les policies `assignations_*` et `heures_saisies_*` : un chef ne peut plus modifier ni supprimer une assignation/heure rattachée à un lot Terminé ou Clôturé. L'admin garde la main (override). Évite la corruption rétroactive des données livrées et facturées.",
      },
      {
        type: "feature",
        area: "Audit",
        title: "Triggers d'audit admin sur les actions sensibles devis",
        description:
          "Triggers DB qui historisent toute transition de statut devis (signé→terminé, terminé→en_cours via rouvrir admin) avec acteur, horodatage et ancien/nouveau statut. Visible dans le journal de l'affaire pour traçabilité chef + audit.",
      },
      {
        type: "feature",
        area: "Affaires",
        title: "Onglet Devis sur la fiche affaire — alerte dépassement, Terminer, Rouvrir admin",
        description:
          "Nouvel onglet `/affaires/$id/devis` listant tous les lots de l'affaire avec progression `prévues / assignées / réelles validées` par lot (vue `v_devis_consommation`). Alerte visuelle si `pct_consomme > 100%`. Actions contextuelles : « Marquer livré » (chef + admin), « Rouvrir » (admin only) avec confirmation.",
      },
      {
        type: "feature",
        area: "Planning",
        title: "Sélecteur de lot dans Planning + AssignationDialog",
        description:
          "Quand un chantier a 1 seul devis actif, le lot est auto-rempli (transparent pour le chef). Quand le chantier a ≥2 devis actifs (cas multi-lots), un sélecteur `devis_id` apparaît dans `AssignationDialog` pour rattacher l'assignation au bon lot. Le sélecteur de lot apparaît également dans la barre du planning quand l'affaire courante a ≥2 devis actifs. Les heures saisies héritent du `devis_id` de leur assignation, pour un suivi propre par lot.",
      },
      {
        type: "feature",
        area: "Admin",
        title: "Page /devis/rattachement-historique pour backfill multi-devis",
        description:
          "Nouvelle page admin (sidebar Administration → Rattachement devis) listant les chantiers multi-devis avec assignations/heures encore orphelines (sans `devis_id`). Pour chaque affaire, l'admin choisit un lot par défaut auquel rattacher en masse les lignes orphelines. Indispensable pour migrer proprement les chantiers historiques importés avant v0.15. Opération ponctuelle, idempotente.",
      },
      {
        type: "improvement",
        area: "Design system",
        title: "Tokens sémantiques success/warning sur les badges statut",
        description:
          "Migration des hardcoded `text-emerald-700` / `text-amber-700` vers les tokens `text-success` / `text-warning` (déjà définis en oklch dans styles.css). Compatibilité dark mode native, cohérence visuelle des badges entre validation heures, rattachement devis, statuts de feedback.",
      },
    ],
  },
  {
    date: "2026-04-21",
    version: "v0.14",
    title: "Feedback chefs d'équipe — module signalement in-app",
    entries: [
      {
        type: "feature",
        area: "Signalements",
        title: "Bouton flottant « Signaler » sur toutes les pages",
        description:
          "Visible uniquement pour chefs de chantier et admins (jamais pour les employés). Position fixe en bas à droite, monte au-dessus de la bottom-nav mobile. Ouvre un dialog avec type (🐛 Bug / 💡 Idée / 🎯 Amélioration / ❓ Question), priorité (basse/moyenne/haute/critique), titre, description et capture d'écran auto de la page courante.",
      },
      {
        type: "feature",
        area: "Signalements",
        title: "Capture d'écran client + stockage privé",
        description:
          "Capture html-to-image de la page (filtre les dialogs/popovers Radix et le bouton lui-même). Upload dans le bucket privé `feedback-screenshots` scopé par `auth.uid()`. URL signée 1h générée à la demande dans la page admin.",
      },
      {
        type: "feature",
        area: "Admin",
        title: "Page /admin/feedback avec stats, filtres et édition",
        description:
          "5 KPIs (total / nouveaux / en cours / résolus / critiques ouverts), filtres statut + type, liste détaillée avec auteur, page concernée, user-agent, capture en preview cliquable. Édition statut (nouveau / en cours / résolu / fermé / rejeté) + notes admin privées + suppression. Accès admin uniquement (RBAC strict).",
      },
      {
        type: "feature",
        area: "Notifications",
        title: "Notification in-app + email Resend aux admins",
        description:
          "Trigger DB `notify_feedback_created` qui crée une notification in-app pour chaque admin actif (cloche en header). En complément, edge function `notify-feedback-email` qui envoie un email branded Setup Paris (palette indigo) à tous les admins, avec reply-to vers l'auteur du signalement et lien direct vers /admin/feedback.",
      },
      {
        type: "feature",
        area: "Sécurité",
        title: "RLS + RBAC sur signalements",
        description:
          "Table `feedbacks` : insert réservé aux chefs/admins (RLS), select limité à l'auteur ou aux admins, update/delete réservés aux admins. Bucket `feedback-screenshots` privé, accès via URL signée uniquement. Trigger `guard_feedback_resolution` qui auto-fill resolved_at/resolved_by lors du passage à résolu/fermé/rejeté.",
      },
    ],
  },
  {
    date: "2026-04-21",
    version: "v0.13",
    title: "UX polish + refonte IA + mobile-first",
    entries: [
      {
        type: "refactor",
        area: "Navigation",
        title: "Sidebar regroupée en 5 sections cohérentes",
        description:
          "Pilotage (Dashboard, Planning) / Chantiers (Chantiers, Devis, Demandes de devis) / Équipes (Employés, Intérimaires, Absences, Validation heures) / Véhicules / Administration (admin only). Fini la section « Outils » fourre-tout pour les chefs ; les exports et demandes de devis vivent désormais à l'endroit logique.",
      },
      {
        type: "fix",
        area: "Sécurité",
        title: "RBAC sidebar strict basé sur le rôle effectif",
        description:
          "Bug critique : un admin en preview « Chef d'équipe » continuait de voir la section Administration. La sidebar utilise maintenant `effectiveRole` au lieu du rôle réel. Les chefs ne voient plus aucune entrée admin (Utilisateurs, Imports, Exports, Métiers, Roadmap, Signalements). L'employé voit 4 items flat (Ma semaine, Mes heures, Mes échanges, Mes propositions).",
      },
      {
        type: "improvement",
        area: "Lisibilité",
        title: "Renommages Affaires → Chantiers et Flotte → Véhicules",
        description:
          "Vocabulaire aligné sur le métier des chefs Setup Paris. Les routes (/affaires, /flotte) restent inchangées pour ne pas casser les liens existants ; seule l'UI évolue (sidebar, command palette, breadcrumbs, headers).",
      },
      {
        type: "improvement",
        area: "Validation",
        title: "Badge live « Heures à valider » dans la sidebar",
        description:
          "Compteur indigo sur l'entrée « Validation heures » (Équipes), branché en realtime sur les saisies de statut « soumis ». Le compteur est aussi visible sur le dashboard et reste synchronisé. Plus besoin de cliquer pour savoir qu'il y a quelque chose à traiter.",
      },
      {
        type: "improvement",
        area: "Planning",
        title: "Onglet planning « Flotte » renommé « Véhicules staffés »",
        description:
          "Désambigüise avec l'entrée « Véhicules » de la sidebar : on parle bien des véhicules planifiés sur la semaine en cours, pas du parc complet.",
      },
      {
        type: "feature",
        area: "Recherche",
        title: "Bouton « Rechercher ⌘K » exposé dans le header",
        description:
          "La command palette (déjà présente mais cachée) gagne un déclencheur visible : bouton avec raccourci kbd dans le header, à côté de la cloche de notifications. Recherche multi-source affaires + employés + navigation.",
      },
      {
        type: "refactor",
        area: "Imports",
        title: "Page /imports unifiée (3 onglets : Employés / Devis / Historique)",
        description:
          "Composant ImportsTabsNav qui regroupe les 3 flux d'import auparavant dispersés (Import employés CSV, Import devis Excel, Historique des imports devis). Un seul point d'entrée admin dans la sidebar.",
      },
      {
        type: "improvement",
        area: "Navigation",
        title: "Breadcrumb désormais présent sur Validation heures",
        description:
          "Cohérence du fil d'Ariane : toutes les pages chef/admin affichent leur breadcrumb (Équipes › Validation heures, etc.).",
      },
      {
        type: "improvement",
        area: "Auth",
        title: "Layout auth unifié split ink/cream sur toutes les pages d'auth",
        description:
          "Login, magic link, set-password, forgot-password, reset-password partagent désormais le même layout split (panneau gauche ink avec branding, panneau droit cream avec formulaire). Bouton retour cohérent.",
      },
      {
        type: "feature",
        area: "Mobile",
        title: "Breakpoint mobile à 1024px → hamburger drawer Sheet",
        description:
          "En dessous de 1024px (lg), la sidebar bascule en drawer Sheet ouvert via hamburger. Au-dessus, elle reste persistante. Permet d'utiliser confortablement l'app sur tablette portrait et téléphone.",
      },
      {
        type: "improvement",
        area: "Design system",
        title: "Design tokens CSS Setup Paris (indigo / cream / ink) documentés",
        description:
          "Variables CSS oklch pour la palette de marque : Setup Indigo #2A2A8C (--primary, --ring, --accent-foreground), cream #F7F4EF, ink #0A0A0B. Échelles de spacing (4/8/16/24/32) et typographie. Documentation dans docs/DESIGN_TOKENS.md pour cohérence des futures pages.",
      },
    ],
  },
  {
    date: "2026-04-21",
    version: "v0.12",
    title: "Module signalements + roadmap enrichie",
    entries: [
      {
        type: "feature",
        area: "Feedback",
        title: "Bouton flottant 💬 « Signaler ou proposer » sur toutes les pages",
        description:
          "Bouton fixe en bas à droite (desktop) ou au-dessus de la bottom nav (mobile) accessible aux chefs et admins. Dialog avec type (bug/idée/amélioration/question), priorité, titre, description et capture d'écran auto de la page courante (via html-to-image). Capture stockée dans bucket privé feedback-screenshots, signalement créé dans table feedbacks avec page_url + user_agent. Notification auto envoyée à tous les admins.",
      },
      {
        type: "feature",
        area: "Admin",
        title: "Page /admin/feedback pour trier et résoudre les signalements",
        description:
          "Vue admin avec stats (total, nouveaux, en cours, résolus, critiques ouverts), filtres par statut/type, cartes signalement avec badges colorés, dialog détail montrant la capture (URL signée), édition statut + notes admin internes, auto-fill resolved_at/by, suppression définitive (capture + ligne).",
      },
      {
        type: "feature",
        area: "Roadmap",
        title: "Roadmap « À venir » enrichie (~30 features identifiées)",
        description:
          "Nouvelles pistes structurées par priorité : notifications push PWA, mode hors-ligne, suggestions IA de staffing, détection conflits temps réel, dashboard direction (marges), justificatifs absence, géoloc pointage, export compta, calendrier Gantt, intégration Google Calendar, QR pointage, multi-tenant, etc.",
      },
      {
        type: "refactor",
        area: "Database",
        title: "Migration feedbacks + bucket feedback-screenshots",
        description:
          "Nouvelle table feedbacks (RLS : insert chef/admin, select own/admin, update/delete admin only), enums feedback_type/priorite/statut, triggers notify_feedback_created (notif admins) + guard_feedback_resolution (auto-fill resolved_at). Bucket privé avec policies storage scopées par auth.uid().",
      },
    ],
  },
  {
    date: "2026-04-21",
    version: "v0.12.1",
    title: "Fix déconnexion mobile",
    entries: [
      {
        type: "fix",
        area: "Mobile",
        title: "Bouton « Se déconnecter » sur /mobile/profil sans effet",
        description:
          "Les routes /mobile/* ne sont pas sous le guard _app : après signOut() Supabase, aucune redirection ne se déclenchait et l'écran restait figé. Ajout d'une navigation explicite vers /login après la déconnexion sur mobile.",
      },
    ],
  },
  {
    date: "2026-04-21",
    version: "v0.12",
    title: "Auth flow différencié par rôle + reset password via Resend",
    entries: [
      {
        type: "feature",
        area: "Auth",
        title: "Page /auth/set-password — création de mot de passe au 1er login",
        description:
          "Après un magic link d'invitation, l'utilisateur arrive sur /auth/set-password (UI cream/ink/indigo). Chef de chantier et admin doivent OBLIGATOIREMENT créer un mot de passe (8 car. min). Les employés ont un bouton secondaire « Passer (utiliser le lien magique uniquement) » qui flag le profil et redirige direct vers le dashboard.",
      },
      {
        type: "feature",
        area: "Auth",
        title: "Page /auth/forgot-password — demande de reset",
        description:
          "Champ email + CTA « Envoyer le lien ». Réponse générique pour ne pas leaker l'existence des comptes (anti-énumération). Email branded Setup Paris envoyé via Resend (from onboarding@setup.paris) avec lien valable 1 heure.",
      },
      {
        type: "feature",
        area: "Auth",
        title: "Page /auth/reset-password — choix du nouveau mot de passe",
        description:
          "Détecte la session Supabase recovery (event PASSWORD_RECOVERY), affiche un formulaire confirmation + nouveau mot de passe, met à jour via supabase.auth.updateUser puis flag profile.password_set_done = true. Si lien expiré, écran « Demander un nouveau lien ».",
      },
      {
        type: "feature",
        area: "Auth",
        title: "Login enrichi : mot de passe OU lien magique",
        description:
          "Nouvelle page /login à 3 onglets : Mot de passe (signin classique + lien « Oublié ? »), Lien magique (signInWithOtp + redirect vers /auth/set-password), Créer un compte. UI Setup Paris.",
      },
      {
        type: "feature",
        area: "Emails",
        title: "Template Resend reset password branded Setup Paris",
        description:
          "Nouveau template HTML cream/ink/indigo cohérent avec invitation : titre « Réinitialisation de mot de passe », CTA indigo, fallback link, mention validité 60 min, footer « Constructeur d'imaginaire ».",
      },
      {
        type: "improvement",
        area: "Backend",
        title: "Server fns auth-actions (markPasswordSet + sendPasswordReset)",
        description:
          "Nouveau module src/lib/auth-actions.ts. markPasswordSet flag profile.password_set_done et active le rôle (status invite → actif). sendPasswordReset utilise supabaseAdmin.auth.admin.generateLink({ type: 'recovery' }) pour générer le lien sans déclencher l'email Supabase natif, puis envoie via Resend gateway.",
      },
      {
        type: "improvement",
        area: "Backend",
        title: "AuthGuard force /auth/set-password pour chef/admin sans mot de passe",
        description:
          "Le guard /_app vérifie passwordSetDone et redirige les chef_chantier/admin vers /auth/set-password tant que le password n'est pas créé. Les employés peuvent skip et accéder directement à leur dashboard.",
      },
      {
        type: "refactor",
        area: "Database",
        title: "Migration profiles : password_set_done + password_set_at",
        description:
          "Nouvelles colonnes pour tracker qui a posé un vrai password vs qui utilise magic link only. Backfill : tous les profils existants marqués comme set_done = true (pour ne pas casser l'existant).",
      },
    ],
  },
  {
    date: "2026-04-21",
    version: "v0.11",
    title: "Email stack production-ready + invitations en lot",
    entries: [
      {
        type: "feature",
        area: "Emails",
        title: "Template HTML branded Setup Paris (cream / ink / indigo)",
        description:
          "Refonte du template d'invitation : fond cream #F5F0E8, titre indigo #2A2A8C « Bienvenue chez Setup Paris », sous-titre « Staffing by Setup.Paris », CTA bouton indigo « Créer mon compte », footer « 🏗️ Constructeur d'imaginaire ». Police Inter, 100% responsive (table-based), compatible clients mail.",
      },
      {
        type: "feature",
        area: "Admin",
        title: "Page /admin/email-preview pour visualiser les templates sans envoyer",
        description:
          "Page admin avec contrôles (nom, rôle, lien magique) et preview live en iframe sandbox + onglet HTML source. Permet de QA le rendu des emails transactionnels avant déclenchement.",
      },
      {
        type: "feature",
        area: "Admin",
        title: "Bouton « Inviter en lot » dans Paramètres → Utilisateurs",
        description:
          "Modal avec textarea (1 email par ligne / virgules / point-virgules), dropdown rôle (chef_chantier par défaut), checkbox « Envoyer auto », parsing avec déduplication. Envoi séquentiel avec retry 1× automatique sur échec, tableau récap live (✅ envoyé / ⏳ retry / ❌ échec / message_id Resend) et export CSV du rapport.",
      },
      {
        type: "improvement",
        area: "Emails",
        title: "Sender migration vers domaine vérifié",
        description:
          "From: « Setup Paris <onboarding@setup.paris> », Reply-To: smart@setup.paris. DNS Resend verified sur setup.paris (DKIM + SPF + MX via Cloudflare).",
      },
      {
        type: "improvement",
        area: "Emails",
        title: "inviteUser retourne le message_id Resend",
        description:
          "Le server fn `inviteUser` parse la réponse Resend et expose `messageId` pour traçabilité (utilisé par le bouton Inviter en lot et permettra le futur module email_logs).",
      },
    ],
  },
  {
    date: "2026-04-21",
    version: "v0.10",
    title: "Audits qualité — modules heures & absences",
    entries: [
      {
        type: "feature",
        area: "Mobile",
        title: "Route /mobile/absences pour les employés (CDI/CDD/Indépendant)",
        description:
          "Liste des absences personnelles + bouton « Demander une absence » (création en valide=false). Onglet dédié dans la bottom nav, masqué pour les intérimaires (redirigés vers leur agence).",
      },
      {
        type: "feature",
        area: "Validation",
        title: "Drawer Historique sur chaque ligne de validation des heures",
        description:
          "Timeline anti-chronologique des transitions (ancien → nouveau statut, auteur, date, motif/commentaire) lue depuis heures_saisies_historique. Lazy-load au clic.",
      },
      {
        type: "feature",
        area: "Absences",
        title: "Détection des assignations conflictuelles avant enregistrement",
        description:
          "Dialog récapitulatif des assignations chevauchantes avec bouton « Supprimer toutes les assignations conflictuelles » avant validation d'une absence par le chef.",
      },
      {
        type: "feature",
        area: "Planning",
        title: "Pré-remplissage du créneau (AM/PM/Journée) lors de « Déclarer absence »",
        description:
          "Le clic droit sur une cellule du planning propage l'employé, la date et le slot vers /absences pour ouvrir un dialog déjà rempli.",
      },
      {
        type: "fix",
        area: "Mobile",
        title: "Affichage du motif de rejet + bouton « J'ai compris » sur mobile",
        description:
          "Variante mobile de MesHeuresGrid : carte rouge avec motif de rejet et action acknowledge_heures_rejet pour repasser en brouillon avant re-soumission.",
      },
      {
        type: "fix",
        area: "Sécurité",
        title: "Valeur par défaut « Validée » à false pour les nouvelles absences",
        description:
          "Le chef doit cocher explicitement la case avant d'enregistrer, évitant les validations involontaires.",
      },
      {
        type: "refactor",
        area: "Code quality",
        title: "Cleanup lot 8 : mutation immutable, type partagé HeuresExportRow, label « Tout est soumis »",
        description:
          "Mise à jour byKey immutable dans use-mes-heures, type ExportRow partagé, suppression TZ_OFFSET_DAYS, label dynamique du bouton de soumission.",
      },
    ],
  },
  {
    date: "2026-04-20",
    version: "v0.9",
    title: "Export PDF paginé & filtres employés cumulables",
    entries: [
      {
        type: "improvement",
        area: "Export",
        title: "Export PDF planning multi-pages avec en-tête répété",
        description:
          "Pagination automatique : la grille est découpée verticalement, en-tête (titre, semaine, vue, date d'édition) répété sur chaque page + pied de page « Page X/Y ». UTF-8 préservé via rendu PNG navigateur.",
      },
      {
        type: "feature",
        area: "Employés",
        title: "Filtres MultiFilter Métier principal + Compétences cumulables",
        description:
          "2 nouveaux filtres multi-select sur /employes : Métier principal (OR) et Compétences secondaires (OR sur secondaires hors principal), combinés en AND avec contrat/actif/recherche.",
      },
    ],
  },
  {
    date: "2026-04-20",
    version: "v0.8",
    title: "Dashboard employé & verrouillage rôles",
    entries: [
      {
        type: "feature",
        area: "Employé",
        title: "Page /dashboard-employe (vue desktop)",
        description:
          "Grille semaine responsive avec assignations (n° affaire, nom, heures, lieu, pastille couleur métier).",
      },
      {
        type: "improvement",
        area: "Sécurité",
        title: "Verrouillage strict des routes pour le rôle employé",
        description:
          "Whitelist EMPLOYE_DESKTOP_ALLOWED dans _app.tsx (dashboard, mes-heures, mes-swaps, mes-propositions). Toute autre route redirige vers /dashboard-employe.",
      },
      {
        type: "improvement",
        area: "UI",
        title: "Cloche notifications restylée + suppression label STUDIO",
        description:
          "Icône 24px gray-700, badge red-500. Navbar nettoyée. Lien « Ma semaine » ajouté à la sidebar employé.",
      },
    ],
  },
  {
    date: "2026-04-20",
    version: "v0.7",
    title: "Flotte, trajets & sous-traitance",
    entries: [
      {
        type: "feature",
        area: "Flotte",
        title: "Onglet Flotte sur /planning (véhicules × jours)",
        description:
          "Grille hebdomadaire des véhicules avec création de trajet, chauffeurs autorisés filtrés par permis, case « créer le retour » pour aller-retour automatique.",
      },
      {
        type: "feature",
        area: "Flotte",
        title: "Adresses favorites + autocomplete Nominatim",
        description:
          "Entrepôts, ateliers, clients récurrents enregistrés et réutilisables dans les trajets.",
      },
      {
        type: "feature",
        area: "Sous-traitance",
        title: "Trajets « à sous-traiter » + page /export/demandes-devis",
        description:
          "Toggle sous-traitance sur le trajet, bloc « À sous-traiter » dans le footer planning, page d'agrégation avec texte de devis copiable et bouton « Marquer envoyé ».",
      },
      {
        type: "feature",
        area: "Export",
        title: "Feuille « Flotte » dans l'export Excel planning",
        description: "Ajout de la grille véhicules × jours dans l'export hebdomadaire.",
      },
      {
        type: "feature",
        area: "Dashboard",
        title: "KPIs flotte (véhicules en service J/J+1, alertes CT/révision/assurance, km semaine)",
        description: "Bloc dédié sur le dashboard admin avec alertes J-30 sur les échéances.",
      },
      {
        type: "improvement",
        area: "Tests",
        title: "Tests unitaires getCompatibleChauffeurs / alerteDate / bloc devis",
        description: "Couverture des helpers flotte et de la génération du texte de demande de devis.",
      },
    ],
  },
  {
    date: "2026-04-20",
    version: "v0.6",
    title: "Devis & Employés — confort d'usage",
    entries: [
      {
        type: "feature",
        area: "Devis",
        title: "Bouton + Nouveau devis sur /devis",
        description:
          "Accès direct depuis la liste des devis vers le flux d'import / création.",
      },
      {
        type: "feature",
        area: "Devis",
        title: "Import Excel/CSV avec pré-remplissage",
        description:
          "Dépôt d'un fichier .xlsx, parsing automatique du numéro de devis, des postes, des heures et du montant HT.",
      },
      {
        type: "fix",
        area: "Routing",
        title: "Conflit de route /devis corrigé",
        description:
          "Renommage en _app.devis.index.tsx pour permettre la coexistence avec /devis/import.",
      },
      {
        type: "feature",
        area: "Employés",
        title: "Toggle rapide Actif / Inactif",
        description:
          "Clic direct sur le badge de statut dans la liste, mise à jour optimiste + toast.",
      },
    ],
  },
  {
    date: "2026-04-19",
    version: "v0.5",
    title: "Planning — vues métier",
    entries: [
      {
        type: "feature",
        area: "Planning",
        title: "3 vues : CDI, Intérim, Synthèse chantier",
        description:
          "Tabs dédiés avec sélecteur de semaine et sidebar des heures restantes par devis.",
      },
      {
        type: "feature",
        area: "Planning",
        title: "Assignation multi-employés (bulk)",
        description: "Dialog d'assignation groupée sur plusieurs jours/demi-journées.",
      },
      {
        type: "feature",
        area: "Planning",
        title: "Filtres multi-critères et combobox affaire",
        description: "Filtrage par métier, statut, chantier ; recherche d'affaire instantanée.",
      },
      {
        type: "feature",
        area: "Export",
        title: "Export Excel du planning",
        description: "Export hebdomadaire formaté pour diffusion équipe.",
      },
    ],
  },
  {
    date: "2026-04-18",
    version: "v0.4",
    title: "Notifications & Validation",
    entries: [
      {
        type: "feature",
        area: "Notifications",
        title: "Cloche de notifications temps réel",
        description:
          "Assignations, soumissions d'heures, validations, mentions — tout remonte dans la cloche.",
      },
      {
        type: "feature",
        area: "Validation",
        title: "Page de validation des heures",
        description: "Workflow brouillon → soumis → validé / rejeté pour les chefs et admins.",
      },
      {
        type: "feature",
        area: "Absences",
        title: "Gestion des absences (congés, maladie, RTT, formation)",
        description: "Saisie demi-journée ou journée, validation par admin/chef.",
      },
    ],
  },
  {
    date: "2026-04-17",
    version: "v0.3",
    title: "Mode preview & rôles",
    entries: [
      {
        type: "feature",
        area: "Admin",
        title: "View-as switcher (admin → chef / employé desktop / mobile)",
        description: "QA des UI selon les rôles sans déconnexion.",
      },
      {
        type: "improvement",
        area: "Sécurité",
        title: "RLS strictes sur toutes les tables",
        description: "Politiques basées sur has_role + is_admin / is_chef_or_admin.",
      },
      {
        type: "feature",
        area: "Mobile",
        title: "Vues mobiles employé : Aujourd'hui, Mes heures, Mon profil",
        description: "Bottom nav dédiée et saisie d'heures simplifiée.",
      },
    ],
  },
  {
    date: "2026-04-16",
    version: "v0.2",
    title: "Imports en masse",
    entries: [
      {
        type: "feature",
        area: "Employés",
        title: "Import CSV des employés",
        description: "Mapping colonnes, contrôle des doublons, association métier principal.",
      },
      {
        type: "feature",
        area: "Devis",
        title: "Import Excel devis (1ère version)",
        description: "Lecture brute des postes et heures prévues.",
      },
      {
        type: "feature",
        area: "UX",
        title: "Command palette (⌘K)",
        description: "Navigation rapide entre toutes les pages de l'app.",
      },
    ],
  },
  {
    date: "2026-04-15",
    version: "v0.1",
    title: "Fondations",
    entries: [
      {
        type: "feature",
        area: "Auth",
        title: "Authentification email + Google",
        description: "3 rôles : admin, chef_chantier, employe (table user_roles séparée).",
      },
      {
        type: "feature",
        area: "Modèle",
        title: "Schéma : affaires, devis, postes, employés, métiers, assignations, heures",
        description: "8 métiers Setup Paris, vues consolidées de consommation.",
      },
      {
        type: "feature",
        area: "UI",
        title: "Design system (sidebar, dashboard, cartes, tokens OKLCH)",
        description: "Layout responsive avec sidebar collapsible et thème Setup Paris.",
      },
    ],
  },
];

const PLANNED: RoadmapPlanned[] = [
  // ========== v0.26+ ==========
  {
    priority: "moyenne",
    title: "v0.26+ — Pièce d'identité (CNI / passeport) sur profil utilisateur",
    description:
      "🔮 Ajouter upload sécurisé de pièce d'identité (CNI ou passeport) sur le profil employé : champ photo recto/verso, type de pièce, numéro, date d'expiration. Stockage privé (bucket Lovable Cloud avec RLS stricte : seuls admin + l'employé lui-même peuvent voir), expiration alerte 60j avant. Use case : conformité chantiers, contrôle accès sites sécurisés.",
  },
  // ========== v0.20.1 — Hotfixes & finitions Fabrication ==========
  {
    priority: "haute",
    title: "v0.20.1 — Pré-remplissage trajet sous-traité depuis bandeau « Prête à livrer »",
    description:
      "🔴 HIGH identifié à l'audit v0.20 : les boutons « Demander trajet sous-traité » du dashboard /fabrication et de la fiche affaire ouvrent /flotte sans passer ?affaireId=… ni les adresses pré-remplies. À fixer : query params + auto-ouverture du TrajetDialog en mode création avec affaire_id, adresse arrivée client, statut_soustraitance='a_sous_traiter' pré-positionnés.",
  },
  {
    priority: "moyenne",
    title: "v0.20.1 — Indexes composites dashboard fabrication (perf)",
    description:
      "🟡 MEDIUM identifié à l'audit : sur grosse base, les requêtes 'charge par assignee' et 'étapes non assignées' du dashboard /fabrication peuvent ralentir. Ajouter index composites (assignee_id, statut) et (statut, type_etape) sur fabrication_etapes. À déclencher si latence dashboard > 1s en prod.",
  },
  {
    priority: "moyenne",
    title: "v0.20.1 — Cache useObjetsAffaireLight partagé (anti N+1)",
    description:
      "🟡 MEDIUM identifié à l'audit : si plusieurs lignes de saisie d'heures pour la même affaire sont ouvertes simultanément, le hook fetche les objets N fois. Refactor avec queryKey partagée par affaire_id pour mutualiser le cache TanStack Query.",
  },
  {
    priority: "moyenne",
    title: "v0.20.1 — Notification « prête à livrer » étendue au chargé d'affaires",
    description:
      "Aujourd'hui notif chef projet uniquement (spec d'origine). À itérer selon retour terrain : si un chargé d'affaires est défini sur l'affaire et différent du chef projet, lui pousser aussi la notif. À cadrer avec Gabin après 2-3 livraisons réelles.",
  },
  {
    priority: "basse",
    title: "v0.20.1 — Suggestion intelligente type véhicule pour staffing interne",
    description:
      "Aujourd'hui par défaut Camion 20m³ pour le bouton « Staffer véhicule interne ». À itérer : suggérer le type selon le volume cumulé estimé des objets prêts à livrer (VL si < 3 m³, Camion 20m³ entre 3-15 m³, Poids lourd > 15 m³). Nécessite de saisir un volume estimé sur fabrication_objets.",
  },
  {
    priority: "basse",
    title: "v0.20.1 — Tests Vitest triggers DB fabrication",
    description:
      "Couvrir en tests d'intégration : trigger sync_fabrication_etapes_on_flags_change (bascule auto a_faire ↔ non_applicable), trigger d'historique fabrication_etapes_historique, transitions de statut a_faire → en_cours → termine. Aujourd'hui validés manuellement uniquement.",
  },

  // ========== HAUTE PRIORITÉ ==========
  {
    priority: "haute",
    title: "Notifications push mobile (PWA + Web Push API)",
    description:
      "Installation PWA (manifest + service worker) + Web Push pour que les employés reçoivent une notif système sur leur téléphone : nouvelle proposition de mission, validation d'heures, swap accepté, trajet assigné. Évite d'avoir à ouvrir l'app pour voir.",
  },
  {
    priority: "haute",
    title: "Mode hors-ligne saisie heures (mobile)",
    description:
      "Permettre aux employés sur chantier sans réseau de saisir leurs heures localement (IndexedDB + queue de sync). Sync automatique au retour réseau avec gestion des conflits.",
  },
  {
    priority: "haute",
    title: "Suggestions automatiques de staffing (IA Lovable AI)",
    description:
      "À l'ouverture du planning, proposer automatiquement les meilleurs candidats pour combler les manques d'un devis : disponibles, bon métier, pas en absence, expérience similaire (déjà bossé sur le même client). Score + raisons. Powered by gemini-2.5-flash.",
  },
  {
    priority: "haute",
    title: "Détection de conflits de planning en temps réel",
    description:
      "Avant validation d'une assignation : vérifier double-booking (déjà sur autre chantier le même slot), absence validée chevauchante, dépassement budget heures du devis. Dialog bloquant ou warning selon gravité.",
  },
  {
    priority: "haute",
    title: "Contrainte EXCLUDE anti-chevauchement sur la table absences",
    description:
      "Migration : CREATE EXTENSION btree_gist + contrainte EXCLUDE (employe_id, daterange, slot) pour empêcher tout chevauchement d'absences en base, en complément du dialog de conflits côté UI.",
  },
  {
    priority: "haute",
    title: "Routage ciblé des notifications « absence_demandee »",
    description:
      "Notifier uniquement le chef rattaché à l'employé (via affaire.chef_chantier_id de la semaine courante) plutôt que tous les chefs/admins.",
  },
  {
    priority: "haute",
    title: "Export PDF planning en jsPDF natif (sans rasterisation PNG)",
    description:
      "Remplacer html-to-image + découpe d'image par un rendu jsPDF natif (autoTable, texte vectoriel, polices Roboto/DejaVu UTF-8). Bénéfices : poids fichier réduit, texte sélectionnable, qualité d'impression nette, accessibilité.",
  },
  {
    priority: "haute",
    title: "Dashboard direction : marge prévisionnelle par chantier",
    description:
      "Vue admin avec, par affaire en cours : montant devis HT, coût main d'œuvre prévu (heures × taux par métier), coût flotte, marge brute prévisionnelle vs réelle (heures validées). Alertes sur les chantiers qui dérapent.",
  },

  // ========== MOYENNE PRIORITÉ ==========
  {
    priority: "moyenne",
    title: "Filtre MultiFilter Métier sur /interimaires",
    description:
      "Ajouter un MultiFilter multi-select Métier principal sur la page de classement intérimaires, combiné en AND avec la recherche existante. Permet de comparer le top staffing par corps de métier.",
  },
  {
    priority: "moyenne",
    title: "Confirmation avant archivage d'un employé avec assignations futures",
    description: "AlertDialog pour éviter les fausses manips sur le toggle Actif.",
  },
  {
    priority: "moyenne",
    title: "Toggle rapide 'Hors staffing' dans la liste employés",
    description: "Même UX que le toggle Actif, sur la colonne non_staffing.",
  },
  {
    priority: "moyenne",
    title: "Modèle CSV téléchargeable pour import devis",
    description: "Bouton 'Télécharger un modèle' avec colonnes + 2 lignes de démo.",
  },
  {
    priority: "moyenne",
    title: "Historique commenté des modifications de planning",
    description:
      "Audit log : qui a créé/modifié/supprimé quelle assignation, quand, et optionnellement pourquoi (champ commentaire au moment du clic). Drawer historique sur chaque ligne planning.",
  },
  {
    priority: "moyenne",
    title: "Justificatifs photo pour les absences (arrêt maladie, etc.)",
    description:
      "Upload PDF/image dans le bucket privé absences-justificatifs lors de la demande. Visible uniquement par chef/admin. Aide à la contestation côté Pôle emploi / mutuelle.",
  },
  {
    priority: "moyenne",
    title: "Géolocalisation au pointage (mobile)",
    description:
      "Capture optionnelle de la position GPS au moment où l'employé saisit ses heures, pour tracer la présence effective sur le chantier. Désactivable par l'employé. Stockée chiffrée.",
  },
  {
    priority: "moyenne",
    title: "Templates de planning récurrents (équipes-types)",
    description:
      "Sauvegarder une combinaison « 3 peintres + 2 menuisiers + 1 chef » comme template réutilisable. Application en 1 clic sur un nouveau chantier.",
  },
  {
    priority: "moyenne",
    title: "Export comptable mensuel (heures validées par employé)",
    description:
      "Export CSV ou PDF formaté pour la paie : par employé, par mois, total d'heures validées par chantier, ventilation jours travaillés / absences. Compatible Sage / EBP / Cegid.",
  },
  {
    priority: "moyenne",
    title: "Rappels automatiques de soumission d'heures (vendredi 17h)",
    description:
      "Cron edge function qui envoie une notif/email aux employés n'ayant pas soumis leurs heures de la semaine en cours. Configurable par l'admin.",
  },
  {
    priority: "moyenne",
    title: "Recherche globale unifiée (⌘K) — étendue aux affaires + employés + devis",
    description:
      "Étendre la command palette pour rechercher au-delà des routes : affaires (numéro/nom/client), employés (prénom/nom), devis. Navigation directe vers la fiche.",
  },

  // ========== v0.21.1 — Findings audit v0.21 + chantiers reportés ==========
  {
    priority: "haute",
    title: "v0.21.1 — Garde RBAC UI sur /saisie-pour-equipe",
    description:
      "🔴 HIGH identifié à l'audit v0.21 : la route /saisie-pour-equipe n'a pas de garde useAuth côté UI (la RLS protège mais l'UI est accessible aux employés et trompeuse). Ajouter Navigate vers /dashboard si !isChef && !isAdmin, et conditionner l'item sidebar sur le même critère.",
  },
  {
    priority: "moyenne",
    title: "v0.21.1 — Durcissement RLS heures_saisies_self_update (Option B)",
    description:
      "🟡 MEDIUM identifié à l'audit v0.21 : la policy update employé n'inclut pas can_saisie_on_affaire(affaire_id, date), ce qui permet à un employé d'éditer une saisie en brouillon/soumis après que l'affaire est fermée. Cohérence Option B à durcir côté RLS.",
  },
  {
    priority: "moyenne",
    title: "v0.21.1 — UNIQUE INDEX partiel chef_jour (anti race condition)",
    description:
      "🟡 MEDIUM identifié à l'audit v0.21 : sous bulk-insert simultané sur même (affaire, date) avec plusieurs est_chef_jour=true, le trigger BEFORE peut produire un état final unique mais le verrouillage est ligne par ligne. Ajouter CREATE UNIQUE INDEX ... ON assignations(affaire_id, date) WHERE est_chef_jour = true comme garde-fou DB.",
  },
  {
    priority: "moyenne",
    title: "v0.21.1 — Tests d'intégration SQL (audit v0.21 gaps)",
    description:
      "🟡 MEDIUM identifié à l'audit v0.21 : 4 cas non couverts par tests automatisés — can_saisie_on_affaire avec date_demontage NULL + statut termine, set_saisie_authorship quand chef = employé (auto-saisie), trigger enforce_unique_chef_jour (bascule), export Excel feuille de route avec 0 chantier ce jour. À ajouter via tests RPC ou tests purs sur la logique TS.",
  },
  {
    priority: "moyenne",
    title: "v0.21.1 — Pagination intra-jour pour PDF feuille de route chargée",
    description:
      "🟡 MEDIUM identifié à l'audit v0.21 : aucun test ni garde sur le débordement de page si plus de 5 chantiers dans la même journée. Ajouter pagination intra-jour ou réduction automatique de la taille de bloc.",
  },

  // ========== Chantiers prioritaires identifiés à l'audit v0.20 — reportés ==========
  {
    priority: "haute",
    title: "Vue Gantt par chantier (timeline visuelle)",
    description:
      "Identifié comme prioritaire à l'audit v0.20. Représentation visuelle horizontale des affaires sur calendrier (montage → démontage), avec barres colorées par chef ou statut. Pratique pour visualiser le carnet de commandes et anticiper les conflits multi-chantiers. Complète la feuille de route quotidienne livrée en v0.21.",
  },
  {
    priority: "haute",
    title: "Module Absences / Congés annuels (compteurs + soldes)",
    description:
      "Identifié comme prioritaire à l'audit v0.20. Suivi des compteurs CP / RTT par employé : acquis, posés, restants. Affichage sur fiche employé + alerte chef si solde insuffisant lors d'une demande d'absence. Justificatifs photo (cf. carte dédiée).",
  },
  {
    priority: "moyenne",
    title: "Consolidation des redondances code (audit v0.20)",
    description:
      "Identifié à l'audit v0.20. Plusieurs helpers et hooks dupliqués (notamment autour de planning/data, employes/affaires). Audit dédié + refactor en lib/ partagée pour réduire la dette technique avant v0.22.",
  },


  // ========== BASSE PRIORITÉ ==========
  {
    priority: "basse",
    title: "Heuristique de mapping métier améliorée + override en bulk",
    description: "Reconnaissance plus fine des libellés ambigus dans la preview d'import devis.",
  },
  {
    priority: "basse",
    title: "Mode sombre forcé / clair forcé (préférence utilisateur)",
    description: "Aujourd'hui suit l'OS. Ajouter un toggle 3 états (auto/clair/sombre) dans le menu profil.",
  },
  {
    priority: "basse",
    title: "Avatars personnalisés (employés + chefs)",
    description:
      "Upload photo dans bucket avatars, affichage dans planning, dashboard, sidebar. Aide à reconnaître visuellement les équipes.",
  },
  {
    priority: "basse",
    title: "Intégration calendrier externe (Google Calendar / Outlook)",
    description:
      "Push automatique des assignations confirmées dans le calendrier perso de l'employé via OAuth. Sync unidirectionnel app → calendrier.",
  },
  {
    priority: "basse",
    title: "QR code chantier pour pointage rapide",
    description:
      "Affiche du QR sur site → l'employé scanne → ouvre directement /mobile/heures pré-rempli avec l'affaire et la date du jour.",
  },
  {
    priority: "basse",
    title: "Statistiques personnelles employé (gamification light)",
    description:
      "Page /mobile/profil enrichie : nb d'heures validées sur le mois/année, nb chantiers différents, métier le plus utilisé, taux de confirmation des propositions (intérimaires).",
  },
  {
    priority: "basse",
    title: "Mode multi-tenant (autres entreprises clientes Setup Paris)",
    description:
      "Refactor pour supporter plusieurs organisations isolées (workspace_id + RLS étendu). Permettrait de proposer l'app en SaaS à d'autres scénographes / décorateurs.",
  },
];

const TYPE_META: Record<
  EntryType,
  { label: string; icon: typeof Sparkles; className: string }
> = {
  feature: {
    label: "Nouveauté",
    icon: Sparkles,
    className: "bg-primary/15 text-primary border-primary/30",
  },
  fix: {
    label: "Correctif",
    icon: Bug,
    className: "bg-destructive/15 text-destructive border-destructive/30",
  },
  improvement: {
    label: "Amélioration",
    icon: Rocket,
    className: "bg-success/15 text-success border-success/30",
  },
  refactor: {
    label: "Refacto",
    icon: Wrench,
    className: "bg-warning/15 text-warning border-warning/30",
  },
};

const PRIORITY_META: Record<
  RoadmapPlanned["priority"],
  { label: string; className: string }
> = {
  haute: {
    label: "Priorité haute",
    className: "bg-destructive/15 text-destructive border-destructive/30",
  },
  moyenne: {
    label: "Priorité moyenne",
    className: "bg-warning/15 text-warning border-warning/30",
  },
  basse: {
    label: "Priorité basse",
    className: "bg-muted text-muted-foreground border-border",
  },
};

function formatDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function RoadmapPage() {
  const { isAdmin } = useAuth();

  const stats = useMemo(() => {
    let features = 0;
    let fixes = 0;
    let improvements = 0;
    for (const r of RELEASES) {
      for (const e of r.entries) {
        if (e.type === "feature") features++;
        else if (e.type === "fix") fixes++;
        else if (e.type === "improvement" || e.type === "refactor") improvements++;
      }
    }
    return { features, fixes, improvements, releases: RELEASES.length };
  }, []);

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Accès restreint</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Cette page est réservée aux administrateurs.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Roadmap & changelog"
        description="Historique des évolutions, correctifs et nouveautés livrés sur l'application."
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Versions livrées" value={stats.releases} icon={Rocket} />
        <StatCard label="Nouveautés" value={stats.features} icon={Sparkles} />
        <StatCard label="Améliorations" value={stats.improvements} icon={Wrench} />
        <StatCard label="Correctifs" value={stats.fixes} icon={Bug} />
      </div>

      <Tabs defaultValue="changelog" className="w-full">
        <TabsList>
          <TabsTrigger value="changelog" className="gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Livré
          </TabsTrigger>
          <TabsTrigger value="planned" className="gap-2">
            <ListTodo className="h-4 w-4" />
            À venir
          </TabsTrigger>
        </TabsList>

        <TabsContent value="changelog" className="mt-4">
          <div className="relative">
            <div
              className="absolute left-[15px] top-2 bottom-2 w-px bg-border"
              aria-hidden
            />
            <div className="flex flex-col gap-6">
              {RELEASES.map((release) => (
                <ReleaseBlock key={release.date + (release.version ?? "")} release={release} />
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="planned" className="mt-4">
          <div className="grid gap-3 md:grid-cols-2">
            {PLANNED.map((p) => (
              <Card key={p.title}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{p.title}</CardTitle>
                    <Badge
                      variant="outline"
                      className={PRIORITY_META[p.priority].className}
                    >
                      {PRIORITY_META[p.priority].label}
                    </Badge>
                  </div>
                </CardHeader>
                {p.description && (
                  <CardContent className="text-sm text-muted-foreground">
                    {p.description}
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Sparkles;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-2xl font-bold leading-none">{value}</div>
          <div className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">
            {label}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ReleaseBlock({ release }: { release: RoadmapRelease }) {
  return (
    <div className="relative pl-10">
      <div className="absolute left-0 top-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-primary bg-background text-primary">
        <Calendar className="h-4 w-4" />
      </div>
      <div className="mb-3 flex flex-wrap items-baseline gap-2">
        {release.version && (
          <Badge className="bg-primary text-primary-foreground">{release.version}</Badge>
        )}
        <h3 className="text-lg font-semibold">{release.title}</h3>
        <span className="text-xs text-muted-foreground">{formatDate(release.date)}</span>
      </div>
      <Card>
        <CardContent className="flex flex-col gap-2 p-4">
          {release.entries.map((entry, i) => {
            const meta = TYPE_META[entry.type];
            const Icon = meta.icon;
            return (
              <div
                key={i}
                className="flex gap-3 rounded-lg border border-border/60 bg-muted/30 p-3"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={meta.className}>
                      {meta.label}
                    </Badge>
                    {entry.area && (
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {entry.area}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-sm font-medium">{entry.title}</div>
                  {entry.description && (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {entry.description}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
