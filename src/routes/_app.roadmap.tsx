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
  // ========== v0.19 — Saisie heures horaires précis (auto-calcul nuit) ==========
  {
    priority: "haute",
    title: "v0.19 — Saisie heures précises (heure_debut / heure_fin / pauses) + auto-calcul nuit",
    description:
      "Refactor moyen terme du module saisie d'heures vers un format horaire précis : `heure_debut`, `heure_fin`, pauses (déjeuner + autres). Auto-calcul des heures de nuit par overlap avec la plage 00h-06h (convention spectacle vivant). Déclenchement conditionné au retour d'usage Phase 1 (v0.18, saisie déclarative).",
  },
  // ========== v0.16 — Demandes transport automatisées + prestataires ==========
  {
    priority: "haute",
    title: "v0.16 — Demandes transport automatisées + base prestataires",
    description:
      "L'export planning logistique génère automatiquement les demandes de devis aux transporteurs : pour chaque affaire staffée, pré-remplissage des adresses chargement (atelier Setup Paris par défaut) / déchargement (lieu chantier) avec horaires (J-1 montage 6h, livraison J 7h, retour J démontage). Nouvelle table `prestataires_transport` (nom, email, tel, spécialité VL/PL/SPL/grue, zones géo, notes, RLS chef/admin). Envoi 1 clic via Resend (template branded indigo/cream + PDF récap server-side). Réception et comparaison des offres (saisie manuelle des réponses dans un premier temps), choix du prestataire retenu, statut (brouillon / envoyée / répondue / acceptée / refusée / annulée). Liaison avec Véhicules (proposition « véhicule interne dispo ? » avant sous-traitance) et avec Adresses favorites existantes.",
  },

  // ========== v0.17 — Module CRM Opportunités (9XXX → 5XXX) ==========
  {
    priority: "haute",
    title: "v0.17 — Module CRM Opportunités : pipeline amont 9XXX → 5XXX",
    description:
      "Pipeline amont des affaires signées avec Kanban par statut (Envoyé / En cours / Gagné / Perdu / Terminé). Import initial des 30 dernières affaires depuis le fichier CRM Excel existant. Auto-suggestion du prochain numéro libre (9XXX pour les opportunités, 5XXX pour les affaires signées). Bouton « Signer » qui convertit une opportunité Gagnée en affaire 5XXX en gardant le lien `code_opportunite` vers le 9XXX d'origine (traçabilité commerciale conservée). Staffing possible directement sur les 9XXX avec badge `PROTO` visible et alerte « opportunité non signée » sur le planning et la fiche. Unicité garantie au niveau DB via `UNIQUE(code)` sur la table `affaires` (couvre 9XXX et 5XXX en un seul espace de noms). Permet aux commerciaux de pré-staffer les opportunités fortes sans polluer le suivi des affaires signées.",
  },



  // ========== HAUTE PRIORITÉ ==========
  {
    priority: "haute",
    title: "Module signalements / feedback intégré (chefs ↔ admin)",
    description:
      "Bouton flottant 💬 sur toutes les pages (desktop + mobile) permettant aux chefs de remonter bugs, idées et améliorations avec capture d'écran auto, page d'origine et user-agent. Page admin /admin/feedback pour trier, prioriser, ajouter des notes internes, marquer résolu. Notifications auto vers les admins.",
  },
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
    title: "Audit du module flotte (lot 10)",
    description:
      "Revue complète : véhicules, trajets, autorisations chauffeurs PL, sous-traitance, RLS, conflits de planning véhicule.",
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
    title: "Module congés annuels (compteurs + soldes)",
    description:
      "Suivi des compteurs CP / RTT par employé : acquis, posés, restants. Affichage sur fiche employé + alerte chef si solde insuffisant lors d'une demande d'absence.",
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
  {
    priority: "moyenne",
    title: "Vue Gantt par chantier (timeline visuelle)",
    description:
      "Représentation visuelle horizontale des affaires sur calendrier (montage → démontage), avec barres colorées par chef ou statut. Pratique pour visualiser le carnet de commandes.",
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
