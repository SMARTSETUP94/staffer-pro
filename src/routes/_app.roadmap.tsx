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
    className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  },
  refactor: {
    label: "Refacto",
    icon: Wrench,
    className: "bg-amber-500/15 text-amber-600 border-amber-500/30",
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
    className: "bg-amber-500/15 text-amber-600 border-amber-500/30",
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
