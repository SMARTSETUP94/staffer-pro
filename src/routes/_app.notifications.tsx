import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useCallback, useEffect } from "react";
import { Bell, Check, CheckCheck, Trash2, Loader2, Filter, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type Notification = Database["public"]["Tables"]["notifications"]["Row"];
type NotifType = Notification["type"];

import { requireCapability } from "@/lib/capability-guard";

export const Route = createFileRoute("/_app/notifications")({
  beforeLoad: () => requireCapability("ma_semaine.view"),
  head: () => ({ meta: [{ title: "Notifications — Setup Paris" }] }),
  component: NotificationsHistoriquePage,
});

const TYPE_LABEL: Record<NotifType, string> = {
  assignation_creee: "Assignation créée",
  assignation_modifiee: "Assignation modifiée",
  assignation_supprimee: "Assignation supprimée",
  heures_soumises: "Heures soumises",
  heures_validees: "Heures validées",
  heures_rejetees: "Heures rejetées",
  absence_demandee: "Absence demandée",
  absence_validee: "Absence validée",
  conflit_staffing: "Conflit staffing",
  depassement_budget: "Dépassement budget",
  mention: "Mention",
  affaire_signee: "Affaire signée",
  fabrication_assignation: "Fabrication assignation",
  fabrication_pret_livraison: "Prêt livraison",
  staffing_publie: "Staffing publié",
  system: "Système",
  mission_probleme: "Problème mission",
};

const TYPE_ICON: Record<NotifType, string> = {
  assignation_creee: "📅",
  assignation_modifiee: "✏️",
  assignation_supprimee: "🗑️",
  heures_soumises: "⏱️",
  heures_validees: "✅",
  heures_rejetees: "❌",
  absence_demandee: "🏖️",
  absence_validee: "✔️",
  conflit_staffing: "⚠️",
  depassement_budget: "💰",
  mention: "💬",
  affaire_signee: "🖋️",
  fabrication_assignation: "🔨",
  fabrication_pret_livraison: "🚚",
  staffing_publie: "📋",
  system: "🔔",
  mission_probleme: "🚨",
};

const PAGE_SIZE = 50;
type ReadFilter = "all" | "unread" | "read";

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatRelative(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "À l'instant";
  if (m < 60) return `Il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Il y a ${h} h`;
  const j = Math.floor(h / 24);
  if (j < 7) return `Il y a ${j} j`;
  return d.toLocaleDateString("fr-FR");
}

function NotificationsHistoriquePage() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const navigate = useNavigate();

  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [totalUnread, setTotalUnread] = useState(0);

  const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  const [typeFilter, setTypeFilter] = useState<NotifType | "all">("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const fetchPage = useCallback(
    async (pageIndex: number, append: boolean) => {
      if (!userId) return;
      if (append) setLoadingMore(true);
      else setLoading(true);

      let query = supabase
        .from("notifications")
        .select("*", { count: "exact" })
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .range(pageIndex * PAGE_SIZE, pageIndex * PAGE_SIZE + PAGE_SIZE - 1);

      if (readFilter === "unread") query = query.eq("lu", false);
      else if (readFilter === "read") query = query.eq("lu", true);

      if (typeFilter !== "all") query = query.eq("type", typeFilter);

      const { data, error, count } = await query;

      if (error) {
        toast.error("Erreur lors du chargement des notifications");
        setLoading(false);
        setLoadingMore(false);
        return;
      }

      const rows = data ?? [];
      setItems((prev) => (append ? [...prev, ...rows] : rows));
      setHasMore((pageIndex + 1) * PAGE_SIZE < (count ?? 0));
      setLoading(false);
      setLoadingMore(false);
    },
    [userId, readFilter, typeFilter],
  );

  const fetchUnreadCount = useCallback(async () => {
    if (!userId) return;
    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("lu", false);
    setTotalUnread(count ?? 0);
  }, [userId]);

  useEffect(() => {
    setPage(0);
    setSelectedIds(new Set());
    fetchPage(0, false);
  }, [fetchPage]);

  useEffect(() => {
    fetchUnreadCount();
  }, [fetchUnreadCount, items]);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchPage(next, true);
  };

  const refresh = () => {
    setPage(0);
    setSelectedIds(new Set());
    fetchPage(0, false);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((n) => n.id)));
    }
  };

  const markAsRead = async (ids: string[], lu: boolean) => {
    if (ids.length === 0) return;
    const { error } = await supabase
      .from("notifications")
      .update({ lu, lu_le: lu ? new Date().toISOString() : null })
      .in("id", ids);
    if (error) {
      toast.error("Erreur lors de la mise à jour");
      return;
    }
    setItems((prev) =>
      prev.map((n) => (ids.includes(n.id) ? { ...n, lu, lu_le: lu ? new Date().toISOString() : null } : n)),
    );
    toast.success(
      lu
        ? `${ids.length} notification${ids.length > 1 ? "s marquées" : " marquée"} comme lue${ids.length > 1 ? "s" : ""}`
        : `${ids.length} notification${ids.length > 1 ? "s marquées" : " marquée"} comme non lue${ids.length > 1 ? "s" : ""}`,
    );
    setSelectedIds(new Set());
  };

  const deleteMany = async (ids: string[]) => {
    if (ids.length === 0) return;
    const { error } = await supabase.from("notifications").delete().in("id", ids);
    if (error) {
      toast.error("Erreur lors de la suppression");
      return;
    }
    setItems((prev) => prev.filter((n) => !ids.includes(n.id)));
    toast.success(`${ids.length} notification${ids.length > 1 ? "s supprimées" : " supprimée"}`);
    setSelectedIds(new Set());
  };

  const markAllAsRead = async () => {
    if (!userId) return;
    const { error } = await supabase
      .from("notifications")
      .update({ lu: true, lu_le: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("lu", false);
    if (error) {
      toast.error("Erreur");
      return;
    }
    toast.success("Toutes les notifications sont marquées comme lues");
    refresh();
  };

  const handleRowClick = async (n: Notification) => {
    if (!n.lu) await markAsRead([n.id], true);
    if (n.lien) navigate({ to: n.lien });
  };

  const selectedArray = useMemo(() => Array.from(selectedIds), [selectedIds]);
  const hasSelection = selectedArray.length > 0;
  const allOnPageSelected = items.length > 0 && selectedIds.size === items.length;

  if (!userId) return null;

  return (
    <div className="space-y-5 p-6">
      <PageHeader
        number="11"
        eyebrow="Espace personnel / Historique"
        title="Toutes mes notifications"
        description="Historique complet de tes notifications. Filtre par type ou statut, marque en lot et accède directement aux pages concernées."
      />

      {/* Filtres */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <Tabs value={readFilter} onValueChange={(v) => setReadFilter(v as ReadFilter)}>
            <TabsList>
              <TabsTrigger value="all">Toutes</TabsTrigger>
              <TabsTrigger value="unread">
                Non lues {totalUnread > 0 && <Badge variant="destructive" className="ml-2 h-4 px-1.5 text-[10px]">{totalUnread}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="read">Lues</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as NotifType | "all")}>
                <SelectTrigger className="h-9 w-[220px]">
                  <SelectValue placeholder="Tous les types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les types</SelectItem>
                  {(Object.keys(TYPE_LABEL) as NotifType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {TYPE_ICON[t]} {TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {typeFilter !== "all" && (
                <Button variant="ghost" size="sm" onClick={() => setTypeFilter("all")} className="h-9 px-2">
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>

            <div className="flex-1" />

            {totalUnread > 0 && (
              <Button variant="outline" size="sm" onClick={markAllAsRead} className="gap-1">
                <CheckCheck className="h-4 w-4" />
                Tout marquer lu
              </Button>
            )}
          </div>

          {/* Barre actions batch */}
          {hasSelection && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-2">
              <span className="text-sm font-medium">
                {selectedArray.length} sélectionnée{selectedArray.length > 1 ? "s" : ""}
              </span>
              <div className="flex-1" />
              <Button size="sm" variant="ghost" onClick={() => markAsRead(selectedArray, true)} className="gap-1">
                <Check className="h-3 w-3" /> Marquer lu
              </Button>
              <Button size="sm" variant="ghost" onClick={() => markAsRead(selectedArray, false)} className="gap-1">
                <Bell className="h-3 w-3" /> Marquer non lu
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => deleteMany(selectedArray)}
                className="gap-1 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" /> Supprimer
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
                Annuler
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Liste */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
              <Bell className="h-8 w-8 opacity-40" />
              Aucune notification ne correspond à ces filtres.
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 border-b bg-muted/30 px-4 py-2">
                <Checkbox
                  checked={allOnPageSelected}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Tout sélectionner"
                />
                <span className="text-xs text-muted-foreground">
                  {items.length} notification{items.length > 1 ? "s" : ""} affichée{items.length > 1 ? "s" : ""}
                </span>
              </div>
              <ul className="divide-y">
                {items.map((n) => {
                  const isSelected = selectedIds.has(n.id);
                  return (
                    <li
                      key={n.id}
                      className={cn(
                        "group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/40",
                        !n.lu && "bg-primary/5",
                        isSelected && "bg-primary/10",
                      )}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelect(n.id)}
                        className="mt-1"
                        aria-label="Sélectionner"
                      />
                      <button
                        type="button"
                        onClick={() => handleRowClick(n)}
                        className="flex flex-1 items-start gap-3 text-left min-w-0"
                      >
                        <span className="text-lg leading-tight pt-0.5" aria-hidden>
                          {TYPE_ICON[n.type] ?? "🔔"}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className={cn("text-sm leading-tight truncate", !n.lu ? "font-semibold" : "font-medium")}>
                              {n.titre}
                            </p>
                            <span
                              className="text-[10px] text-muted-foreground whitespace-nowrap"
                              title={formatDateTime(n.created_at)}
                            >
                              {formatRelative(n.created_at)}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{n.message}</p>
                          <div className="mt-1 flex items-center gap-2">
                            <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-normal">
                              {TYPE_LABEL[n.type] ?? n.type}
                            </Badge>
                            {!n.lu && (
                              <span className="text-[10px] font-medium text-primary">● Non lu</span>
                            )}
                            {n.lien && (
                              <span className="text-[10px] text-muted-foreground truncate">{n.lien}</span>
                            )}
                          </div>
                        </div>
                      </button>
                      <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            markAsRead([n.id], !n.lu);
                          }}
                          aria-label={n.lu ? "Marquer non lu" : "Marquer lu"}
                          title={n.lu ? "Marquer non lu" : "Marquer lu"}
                        >
                          {n.lu ? <Bell className="h-3 w-3" /> : <Check className="h-3 w-3" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteMany([n.id]);
                          }}
                          aria-label="Supprimer"
                          title="Supprimer"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {hasMore && (
                <div className="border-t p-4 text-center">
                  <Button variant="outline" onClick={loadMore} disabled={loadingMore} className="gap-2">
                    {loadingMore && <Loader2 className="h-3 w-3 animate-spin" />}
                    Charger plus
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
