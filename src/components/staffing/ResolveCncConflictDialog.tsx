// v0.35.x — Dialog résolution conflit CNC (auto-replan en repoussant la livraison)
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Wand2, Calendar, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { resolveCncConflict, type ResolveResult } from "@/server/staffing-resolve.functions";
import { formatShortDate } from "./gantt-helpers";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  planId: string;
  /** Callback admin/chef si l'utilisateur accepte d'appliquer le nouveau date_fin_fab. */
  onApplyNewDateFinFab?: (newDate: string) => Promise<void> | void;
}

export function ResolveCncConflictDialog({
  open,
  onOpenChange,
  planId,
  onApplyNewDateFinFab,
}: Props) {
  const resolve = useServerFn(resolveCncConflict);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [res, setRes] = useState<ResolveResult | null>(null);

  const run = async () => {
    setBusy(true);
    setRes(null);
    try {
      const r = (await resolve({ data: { planId } })) as ResolveResult;
      setRes(r);
    } catch (e) {
      toast.error("Échec analyse : " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!res?.new_date_fin_fab || !onApplyNewDateFinFab) return;
    setApplying(true);
    try {
      await onApplyNewDateFinFab(res.new_date_fin_fab);
      toast.success(`Livraison repoussée au ${formatShortDate(res.new_date_fin_fab)}`);
      onOpenChange(false);
    } catch (e) {
      toast.error("Échec application : " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setApplying(false);
    }
  };

  const beforeAlerts = res?.before.alerts ?? [];
  const afterAlerts = res?.after?.alerts ?? [];
  const conflictsBefore = beforeAlerts.filter((a) => a.code === "NUM_CONFLIT_INSOLUBLE").length;
  const conflictsAfter = afterAlerts.filter((a) => a.code === "NUM_CONFLIT_INSOLUBLE").length;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setRes(null);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-4 w-4" />
            Résolution auto conflit CNC
          </DialogTitle>
          <DialogDescription>
            Recherche le plus petit décalage de livraison (jusqu'à 60 j) qui libère un créneau CNC
            valide. Aucune modification n'est appliquée tant que vous ne validez pas.
          </DialogDescription>
        </DialogHeader>

        {!res && !busy && (
          <div className="flex flex-col items-center gap-3 py-6">
            <p className="text-sm text-muted-foreground">
              Lancer l'analyse simule jusqu'à 60 recalculs (livraison +1j … +60j).
            </p>
            <Button onClick={run}>
              <Wand2 className="mr-2 h-4 w-4" /> Lancer l'analyse
            </Button>
          </div>
        )}

        {busy && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Recherche du créneau optimal…
          </div>
        )}

        {res && (
          <div className="space-y-4">
            {/* Comparaison avant/après */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-destructive">
                  Avant
                </div>
                <div className="mt-1 flex items-center gap-2 text-sm">
                  <Calendar className="h-3.5 w-3.5" />
                  Livraison {formatShortDate(res.date_fin_fab_initial)}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <Badge variant="destructive" className="text-[10px]">
                    {conflictsBefore} conflit{conflictsBefore > 1 ? "s" : ""} CNC
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {res.before.steps.length} steps
                  </Badge>
                </div>
              </div>
              <div
                className={`rounded-xl border p-3 ${
                  res.resolved && res.after
                    ? "border-emerald-500/40 bg-emerald-500/5"
                    : "border-amber-500/40 bg-amber-500/5"
                }`}
              >
                <div
                  className={`text-[10px] font-bold uppercase tracking-wider ${
                    res.resolved && res.after ? "text-emerald-600" : "text-amber-600"
                  }`}
                >
                  Après {res.delta_days > 0 ? `(+${res.delta_days} j)` : ""}
                </div>
                <div className="mt-1 flex items-center gap-2 text-sm">
                  <Calendar className="h-3.5 w-3.5" />
                  {res.new_date_fin_fab
                    ? `Livraison ${formatShortDate(res.new_date_fin_fab)}`
                    : "Aucune solution trouvée"}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {res.after ? (
                    <>
                      <Badge
                        variant={conflictsAfter === 0 ? "secondary" : "destructive"}
                        className="text-[10px]"
                      >
                        {conflictsAfter} conflit CNC
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {res.after.steps.length} steps
                      </Badge>
                    </>
                  ) : (
                    <Badge variant="destructive" className="text-[10px]">
                      Non résolu
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {res.reason && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {res.reason}
              </div>
            )}

            {res.after && res.delta_days > 0 && onApplyNewDateFinFab && (
              <p className="text-xs text-muted-foreground">
                Appliquer met à jour la date de livraison du plan et recalcule. Les overrides
                manuels (sliders, shifts) sont préservés.
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={applying}>
            Fermer
          </Button>
          {res && res.resolved && res.after && res.delta_days > 0 && onApplyNewDateFinFab && (
            <Button onClick={apply} disabled={applying}>
              {applying && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Appliquer (+{res.delta_days} j)
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
