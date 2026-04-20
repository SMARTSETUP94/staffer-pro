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
  {
    priority: "haute",
    title: "Export PDF planning en jsPDF natif (sans rasterisation PNG)",
    description:
      "Remplacer html-to-image + découpe d'image par un rendu jsPDF natif (autoTable, texte vectoriel, polices Roboto/DejaVu UTF-8). Bénéfices : poids fichier réduit, texte sélectionnable, qualité d'impression nette, accessibilité.",
  },
  {
    priority: "haute",
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
    priority: "basse",
    title: "Heuristique de mapping métier améliorée + override en bulk",
    description: "Reconnaissance plus fine des libellés ambigus dans la preview d'import.",
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
