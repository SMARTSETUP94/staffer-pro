// v0.35.5 — Drawer historique snapshots + restore
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, RotateCcw, Eye } from "lucide-react";
import { listPlanSnapshots, restorePlanSnapshot } from "@/server/staffing-publish.functions";

type Snap = {
  id: string;
  reason: string;
  created_at: string;
  created_by_name: string | null;
  snapshot_data: unknown;
};

const reasonLabel: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  initial_calc: { label: "Calcul initial", variant: "outline" },
  manual_edit: { label: "Édition manuelle", variant: "secondary" },
  publish: { label: "Publication", variant: "default" },
  restore: { label: "Restauration", variant: "destructive" },
};

function fmt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PlanHistoryDrawer({
  planId,
  canRestore,
  open,
  onOpenChange,
  onRestored,
}: {
  planId: string;
  canRestore: boolean;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onRestored: () => void;
}) {
  const listFn = useServerFn(listPlanSnapshots);
  const restoreFn = useServerFn(restorePlanSnapshot);
  const [snaps, setSnaps] = useState<Snap[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    listFn({ data: { planId } })
      .then((rows) => setSnaps(rows as Snap[]))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Erreur historique"))
      .finally(() => setLoading(false));
  }, [open, planId, listFn]);

  const restore = async (snapshotId: string) => {
    if (!confirm("Restaurer cette version ? Les modifications actuelles seront sauvegardées dans un nouveau snapshot.")) return;
    setBusyId(snapshotId);
    try {
      await restoreFn({ data: { planId, snapshotId } });
      toast.success("Version restaurée");
      onOpenChange(false);
      onRestored();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur restauration");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-hidden flex flex-col">
        <SheetHeader>
          <SheetTitle>Historique du plan</SheetTitle>
          <SheetDescription>
            Versions et snapshots du plan staffing — du plus récent au plus ancien.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1 mt-4 pr-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : snaps.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Aucun snapshot pour ce plan.
            </p>
          ) : (
            <div className="space-y-3">
              {snaps.map((s) => {
                const meta = reasonLabel[s.reason] ?? { label: s.reason, variant: "outline" as const };
                return (
                  <div
                    key={s.id}
                    className="border-l-2 border-primary/40 pl-4 pb-2"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                      <span className="text-xs text-muted-foreground">{fmt(s.created_at)}</span>
                      {s.created_by_name && (
                        <span className="text-xs">par {s.created_by_name}</span>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setShowDetails(showDetails === s.id ? null : s.id)}
                      >
                        <Eye className="mr-1 h-3 w-3" />
                        {showDetails === s.id ? "Masquer" : "Détails"}
                      </Button>
                      {canRestore && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => restore(s.id)}
                          disabled={busyId === s.id}
                        >
                          {busyId === s.id ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : (
                            <RotateCcw className="mr-1 h-3 w-3" />
                          )}
                          Restaurer
                        </Button>
                      )}
                    </div>
                    {showDetails === s.id && (
                      <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-2 text-[10px]">
                        {JSON.stringify(s.snapshot_data, null, 2)}
                      </pre>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
