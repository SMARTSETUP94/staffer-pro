import { useEffect, useState, useCallback, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Inbox, Filter, Check, RotateCcw, ExternalLink, Loader2 } from "lucide-react";
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
  SEVERITY_STYLES,
} from "@/lib/inbox";

export const Route = createFileRoute("/_app/inbox")({
  head: () => ({ meta: [{ title: "Inbox — Setup Paris" }] }),
  component: InboxPage,
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

function InboxPage() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourceFilter, setSourceFilter] = useState<"all" | InboxSource>("all");
  const [sevFilter, setSevFilter] = useState<"all" | InboxSeverity>("all");
  const [pendingDismiss, setPendingDismiss] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchInboxItems(200);
      setItems(list);
    } catch (e: any) {
      toast.error(`Impossible de charger l'inbox: ${e.message ?? e}`, { id: "inbox-load-err" });
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
      // Optimistic
      setItems((prev) => prev.filter((i) => i.item_key !== item.item_key));
      try {
        await dismissInboxItem(item.item_key);
        toast.success("Item masqué", {
          id: `inbox-dismiss-${item.item_key}`,
          action: {
            label: "Annuler",
            onClick: () => {
              void restoreInboxItem(item.item_key).then(() => load());
            },
          },
        });
      } catch (e: any) {
        toast.error(`Échec : ${e.message ?? e}`, { id: "inbox-dismiss-err" });
        void load();
      } finally {
        setPendingDismiss(null);
      }
    },
    [load],
  );

  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (sourceFilter !== "all" && i.source !== sourceFilter) return false;
      if (sevFilter !== "all" && i.severity !== sevFilter) return false;
      return true;
    });
  }, [items, sourceFilter, sevFilter]);

  const sourceCounts = useMemo(() => {
    const counts = new Map<InboxSource, number>();
    for (const i of items) counts.set(i.source, (counts.get(i.source) ?? 0) + 1);
    return counts;
  }, [items]);

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        number="01"
        eyebrow="Pilotage / Inbox"
        title="Inbox"
        description="Tous les éléments en attente d'action regroupés. Cliquez sur un item pour le traiter, ou masquez-le."
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Filter className="h-4 w-4" />
          Filtres :
        </div>
        <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as any)}>
          <SelectTrigger className="h-9 w-[210px]">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes sources ({items.length})</SelectItem>
            {(Object.keys(SOURCE_LABELS) as InboxSource[]).map((src) => (
              <SelectItem key={src} value={src}>
                {SOURCE_LABELS[src]} ({sourceCounts.get(src) ?? 0})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sevFilter} onValueChange={(v) => setSevFilter(v as any)}>
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
              <Inbox className="mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-sm font-medium">Inbox vide</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {items.length === 0
                  ? "Aucun item en attente. Tout est traité 🎉"
                  : "Aucun item ne correspond aux filtres."}
              </p>
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
                      <Link to={item.action_route as any}>
                        <ExternalLink className="mr-1 h-3 w-3" />
                        Traiter
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDismiss(item)}
                      disabled={pendingDismiss === item.item_key}
                      title="Masquer cet item"
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
