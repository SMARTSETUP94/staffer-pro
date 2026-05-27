/**
 * v0.49 (L4a) — Page d'accueil unique capability-driven.
 *
 * Remplace `/inbox`, `/dashboard`, `/mobile/aujourdhui` et
 * `/mobile/chef/dashboard`. Une seule URL pour tous les rôles ; les cartes
 * affichées sont filtrées selon les capabilities de l'utilisateur (poseur
 * voit ses missions, commercial voit ses devis brouillons, BE voit ses
 * plans en attente, etc.).
 *
 * Note L4a : la page consomme `fetchInboxItems()` qui couvre déjà les 4
 * sources legacy (assignation_refus / divergence / absence_pending / feedback)
 * RLS-scopées. Les 6 sources additionnelles (mission_pose, devis_brouillon,
 * be_attente, etc.) sont déjà supportées par le typage `InboxSource` et le
 * mapping `SOURCE_TO_CAP` — leurs queries back-end seront branchées dans un
 * lot ultérieur (voir mem://debts/aujourdhui-10-sources-backend).
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

export const Route = createFileRoute("/_app/aujourdhui")({
  head: () => ({ meta: [{ title: "Aujourd'hui — Setup Paris" }] }),
  component: AujourdhuiPage,
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

function AujourdhuiPage() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourceFilter, setSourceFilter] = useState<"all" | InboxSource>("all");
  const [sevFilter, setSevFilter] = useState<"all" | InboxSeverity>("all");
  const [pendingDismiss, setPendingDismiss] = useState<string | null>(null);

  const { data: capsSet } = useCapabilitiesSet();
  const canSeeHeuresWidget = useCapability("inbox.heures_saisir");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchInboxItems(200);
      setItems(list);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Impossible de charger la page : ${msg}`, { id: "aujourdhui-load-err" });
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
          id: `aujourdhui-dismiss-${item.item_key}`,
          action: {
            label: "Annuler",
            onClick: () => {
              void restoreInboxItem(item.item_key).then(() => load());
            },
          },
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        toast.error(`Échec : ${msg}`, { id: "aujourdhui-dismiss-err" });
        void load();
      } finally {
        setPendingDismiss(null);
      }
    },
    [load],
  );

  // L4a — Filtrage par capability : un item dont la source mappe sur une cap
  // que l'user n'a pas est invisible (anti-fuite RGPD multi-rôle).
  // Dédup par item_key au passage (anti-doublon cap×cap).
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
