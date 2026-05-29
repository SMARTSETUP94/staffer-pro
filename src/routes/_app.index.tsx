/**
 * v0.51 (L6-A) — Page d'accueil unique `/` capability-driven.
 *
 * Fusionne `/aujourdhui` dans `/`. Une seule URL pour tous les rôles ;
 * les cartes affichées sont filtrées selon les capabilities de l'utilisateur
 * (poseur voit ses missions, commercial voit ses devis brouillons, BE voit
 * ses plans en attente, etc.).
 *
 * Anciennes routes (`/dashboard`, `/inbox`, `/aujourdhui`, `/ma-semaine`,
 * `/dashboard-employe`) redirigent toutes vers `/`.
 */
import { useEffect, useState, useCallback, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Inbox,
  Filter,
  Check,
  RotateCcw,
  ExternalLink,
  Loader2,
  Clock3,
  PartyPopper,
  Briefcase,
  HardHat,
  FileSignature,
  ClipboardCheck,
  ArrowLeftRight,
  Users,
  CalendarDays,
} from "lucide-react";

import { format, startOfWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchInboxItems,
  dismissInboxItem,
  restoreInboxItem,
  type InboxItem,
  type InboxSource,
  type InboxSeverity,
  SOURCE_LABELS,
  SOURCE_TO_CAP,
  SEVERITY_STYLES,
} from "@/lib/inbox";
import { useCapabilitiesSet, useCapability } from "@/hooks/use-capability";
import { useMesHeures } from "@/hooks/use-mes-heures";
import { EmployeAujourdhuiView } from "@/components/aujourdhui/EmployeAujourdhuiView";

export const Route = createFileRoute("/_app/")({
  head: () => ({ meta: [{ title: "Accueil — Setup Paris" }] }),
  component: HomePage,
});

function fmtRelative(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `il y a ${days} j`;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

function HeuresSemaineWidget() {
  const weekStart = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }), []);
  const { totalHeuresPrevues, totalHeuresSaisies, loading } = useMesHeures({ weekStart });
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Clock3 className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium">Mes heures cette semaine</p>
          {loading ? (
            <p className="text-xs text-muted-foreground">Chargement…</p>
          ) : (
            <p className="text-xs text-muted-foreground tabular-nums">
              {totalHeuresSaisies.toFixed(1)}h saisies / {totalHeuresPrevues.toFixed(1)}h prévues
            </p>
          )}
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/mes-heures">Saisir</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

interface MesWidgetSpec {
  capKey: string;
  to: string;
  icon: typeof Briefcase;
  title: string;
  subtitle: string;
  cta?: string;
  scope?: "mine" | "team" | "all";
}

const MES_WIDGETS: MesWidgetSpec[] = [
  { capKey: "mes_missions.view", to: "/mes-missions", icon: Briefcase, title: "Mes missions pose", subtitle: "Montage & démontage planifiés", scope: "mine" },
  { capKey: "mes_chantiers.view", to: "/mes-chantiers", icon: HardHat, title: "Mes chantiers", subtitle: "Équipes où je suis casté", scope: "mine" },
  { capKey: "mes_contrats.view", to: "/mes-contrats", icon: FileSignature, title: "Mes contrats", subtitle: "Lecture & signature", scope: "mine" },
  { capKey: "mes_propositions.view", to: "/mes-propositions", icon: ClipboardCheck, title: "Mes propositions", subtitle: "Créneaux à confirmer", scope: "mine" },
  { capKey: "mes_swaps.view", to: "/mes-swaps", icon: ArrowLeftRight, title: "Mes échanges", subtitle: "Swaps avec collègues", scope: "mine" },
  { capKey: "dashboard.team.view", to: "/mon-equipe-type", icon: Users, title: "Mon équipe type", subtitle: "Coéquipiers récurrents", cta: "Voir" },
  { capKey: "planning.view", to: "/planning", icon: CalendarDays, title: "Planning", subtitle: "Vue chantier & affectations", cta: "Ouvrir" },
];

function MesWidgetCard({ spec }: { spec: MesWidgetSpec }) {
  const canSee = useCapability(spec.capKey);
  if (!canSee) return null;
  const Icon = spec.icon;

  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{spec.title}</p>
          <p className="text-xs text-muted-foreground truncate">{spec.subtitle}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to={spec.to} search={spec.scope ? { scope: spec.scope } : undefined}>
            {spec.cta ?? "Ouvrir"}
          </Link>
        </Button>

      </CardContent>
    </Card>
  );
}


function HomePage() {
  // H4 audit — guard isLoading : sans ce skeleton, useCapability renvoie false
  // pendant le chargement initial et un admin voit EmployeAujourdhuiView
  // monter + fetcher avant de swap → flash + double requête réseau.
  const { data: capsSet, isLoading: capsLoading } = useCapabilitiesSet();
  if (capsLoading) {
    return (
      <div className="container mx-auto flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const canSeeTeamDashboard = capsSet.has("dashboard.team.view");

  // Vue employé (terrain) : poseur, peintre, métallier… — pas d'inbox alertes
  // équipe, mais 3 blocs dédiés (planning semaine + heures + atelier).
  if (!canSeeTeamDashboard) {
    return <EmployeAujourdhuiView />;
  }

  return <AdminChefHomeView />;
}

function AdminChefHomeView() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourceFilter, setSourceFilter] = useState<"all" | InboxSource>("all");
  const [sevFilter, setSevFilter] = useState<"all" | InboxSeverity>("all");
  const [pendingDismiss, setPendingDismiss] = useState<string | null>(null);

  const { data: capsSet } = useCapabilitiesSet();
  const canSeeHeuresWidget = useCapability("inbox.heures_saisir");

  const extractMessage = (e: unknown): string => {
    if (e instanceof Error) return e.message;
    if (e && typeof e === "object") {
      const obj = e as { message?: unknown; details?: unknown; hint?: unknown };
      if (typeof obj.message === "string" && obj.message) return obj.message;
      if (typeof obj.details === "string" && obj.details) return obj.details;
      if (typeof obj.hint === "string" && obj.hint) return obj.hint;
      try { return JSON.stringify(e); } catch { return String(e); }
    }
    return String(e);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchInboxItems(200);
      setItems(list);
    } catch (e: unknown) {
      const msg = extractMessage(e);
      console.error("[home] fetchInboxItems failed", e);
      toast.error(`Impossible de charger la page : ${msg}`, { id: "home-load-err" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDismiss = useCallback(
    async (item: InboxItem) => {
      setPendingDismiss(item.item_key);
      setItems((prev) => prev.filter((i) => i.item_key !== item.item_key));
      try {
        await dismissInboxItem(item.item_key);
        toast.success("Item masqué", {
          id: `home-dismiss-${item.item_key}`,
          action: {
            label: "Annuler",
            onClick: () => {
              void restoreInboxItem(item.item_key).then(() => load());
            },
          },
        });
      } catch (e: unknown) {
        const msg = extractMessage(e);
        console.error("[home] dismissInboxItem failed", e);
        toast.error(`Échec : ${msg}`, { id: "home-dismiss-err" });
        void load();
      } finally {
        setPendingDismiss(null);
      }
    },
    [load],
  );

  const capFiltered = useMemo(() => {
    const seen = new Set<string>();
    return items.filter((i) => {
      if (seen.has(i.item_key)) return false;
      seen.add(i.item_key);
      const requiredCap = SOURCE_TO_CAP[i.source];
      if (requiredCap && !capsSet.has(requiredCap)) return false;
      return true;
    });
  }, [items, capsSet]);

  const filtered = useMemo(() => {
    return capFiltered.filter((i) => {
      if (sourceFilter !== "all" && i.source !== sourceFilter) return false;
      if (sevFilter !== "all" && i.severity !== sevFilter) return false;
      return true;
    });
  }, [capFiltered, sourceFilter, sevFilter]);

  const sourceCounts = useMemo(() => {
    const counts = new Map<InboxSource, number>();
    for (const i of capFiltered) counts.set(i.source, (counts.get(i.source) ?? 0) + 1);
    return counts;
  }, [capFiltered]);

  const hasAnyInboxCap = useMemo(() => {
    return Object.values(SOURCE_TO_CAP).some((cap) => cap && capsSet.has(cap));
  }, [capsSet]);

  const todayLabel = useMemo(
    () => format(new Date(), "EEEE d MMMM yyyy", { locale: fr }),
    [],
  );

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        number="01"
        eyebrow="Pilotage"
        title="Aujourd'hui"
        description={todayLabel.charAt(0).toUpperCase() + todayLabel.slice(1)}
      />

      {canSeeHeuresWidget && <HeuresSemaineWidget />}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {MES_WIDGETS.map((spec) => (
          <MesWidgetCard key={spec.capKey} spec={spec} />
        ))}
      </div>



      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Filter className="h-4 w-4" />
          Filtres :
        </div>
        <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as "all" | InboxSource)}>
          <SelectTrigger className="h-9 w-[210px]">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes sources ({capFiltered.length})</SelectItem>
            {(Object.keys(SOURCE_LABELS) as InboxSource[])
              .filter((src) => (sourceCounts.get(src) ?? 0) > 0)
              .map((src) => (
                <SelectItem key={src} value={src}>
                  {SOURCE_LABELS[src]} ({sourceCounts.get(src) ?? 0})
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Select value={sevFilter} onValueChange={(v) => setSevFilter(v as "all" | InboxSeverity)}>
          <SelectTrigger className="h-9 w-[170px]">
            <SelectValue placeholder="Sévérité" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes sévérités</SelectItem>
            <SelectItem value="high">Haute</SelectItem>
            <SelectItem value="medium">Moyenne</SelectItem>
            <SelectItem value="low">Basse</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" onClick={() => load()} disabled={loading}>
          <RotateCcw className={`mr-2 h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Rafraîchir
        </Button>
        <div className="ml-auto text-sm text-muted-foreground">
          {filtered.length} item{filtered.length > 1 ? "s" : ""} affiché
          {filtered.length > 1 ? "s" : ""}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              {!hasAnyInboxCap ? (
                <>
                  <Inbox className="mb-3 h-10 w-10 text-muted-foreground" />
                  <p className="text-sm font-medium">Bienvenue sur ta page d'accueil</p>
                  <p className="mt-1 max-w-md text-xs text-muted-foreground">
                    Cette page agrège tes tâches du jour. Demande à un admin de
                    t'ajouter des rôles métier pour voir tes cartes.
                  </p>
                </>
              ) : capFiltered.length === 0 ? (
                <>
                  <PartyPopper className="mb-3 h-10 w-10 text-muted-foreground" />
                  <p className="text-sm font-medium">Tout est à jour</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Rien à faire pour aujourd'hui. Profite ! 🎉
                  </p>
                </>
              ) : (
                <>
                  <Inbox className="mb-3 h-10 w-10 text-muted-foreground" />
                  <p className="text-sm font-medium">Aucun résultat</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Aucun item ne correspond aux filtres.
                  </p>
                </>
              )}
            </div>
          ) : (
            <ul className="divide-y">
              {filtered.map((item) => (
                <li
                  key={item.item_key}
                  className="flex flex-col gap-2 px-4 py-3 hover:bg-muted/30 sm:flex-row sm:items-center sm:gap-4"
                >
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`text-[10px] uppercase ${SEVERITY_STYLES[item.severity]}`}
                    >
                      {item.severity === "high" ? "Haute" : item.severity === "medium" ? "Moy." : "Basse"}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {SOURCE_LABELS[item.source]}
                    </Badge>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    {item.subtitle && (
                      <p className="line-clamp-2 text-xs text-muted-foreground">{item.subtitle}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                    <span className="tabular-nums">{fmtRelative(item.created_at)}</span>
                    <Button asChild variant="outline" size="sm">
                      <Link to={item.action_route}>
                        <ExternalLink className="mr-1 h-3 w-3" />
                        Traiter
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDismiss(item)}
                      disabled={pendingDismiss === item.item_key}
                      title="Marquer comme traité"
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
