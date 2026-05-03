// v0.36 RC — Heatmap cible (pré-paramétrage) vs réel (steps), avec toggle.
// Permet de visualiser l'écart pers cible (chantier_metier_config.nb_pers_cible)
// vs charge réelle journalière calculée depuis les steps.
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Eye, Target } from "lucide-react";
import { METIER_COLOR, METIER_LABEL, METIER_ORDER, formatShortDate } from "./gantt-helpers";
import type { PlanStep, MetierKey } from "@/lib/staffing/types";
import { METIER_ID } from "@/lib/staffing/types";
import type { ChantierMetierConfigRow } from "@/server/staffing-pre-parametrage.functions";

interface Props {
  steps: PlanStep[];
  days: string[];
  configs: ChantierMetierConfigRow[];
}

function metierKeyById(id: number): MetierKey | null {
  for (const k of METIER_ORDER) if (METIER_ID[k] === id) return k;
  return null;
}

type View = "reel" | "cible" | "ecart";

function cellColor(view: View, value: number, target: number): string {
  if (view === "reel") {
    if (value === 0) return "bg-muted/30 text-muted-foreground";
    if (value <= target) return "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300";
    if (value <= target * 1.3) return "bg-amber-500/30 text-amber-700 dark:text-amber-300";
    return "bg-destructive/40 text-destructive font-bold";
  }
  if (view === "cible") {
    if (value === 0) return "bg-muted/30 text-muted-foreground";
    return "bg-primary/10 text-primary";
  }
  // ecart = reel - cible
  if (value === 0) return "bg-muted/30 text-muted-foreground";
  if (value < 0) return "bg-blue-500/20 text-blue-700 dark:text-blue-300";
  if (value <= target * 0.3) return "bg-amber-500/30 text-amber-700";
  return "bg-destructive/40 text-destructive font-bold";
}

export function HeatmapCibleVsReel({ steps, days, configs }: Props) {
  const [view, setView] = useState<View>("reel");

  const matrix = useMemo(() => {
    const m = new Map<MetierKey, Map<string, number>>();
    for (const k of METIER_ORDER) m.set(k, new Map());
    for (const s of steps) {
      if (s.start_date === "TBD") continue;
      const k = metierKeyById(s.metier_id);
      if (!k) continue;
      const start = new Date(s.start_date + "T00:00:00Z");
      for (let i = 0; i < s.span_days; i++) {
        const d = new Date(start);
        d.setUTCDate(d.getUTCDate() + i);
        const iso = d.toISOString().slice(0, 10);
        if (!days.includes(iso)) continue;
        const row = m.get(k)!;
        row.set(iso, (row.get(iso) ?? 0) + s.pers);
      }
    }
    return m;
  }, [steps, days]);

  const targetByMetier = useMemo(() => {
    const t = new Map<MetierKey, number>();
    for (const c of configs) {
      const k = metierKeyById(c.metier_id);
      if (k) t.set(k, c.nb_pers_cible);
    }
    return t;
  }, [configs]);

  return (
    <div className="space-y-2 rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border p-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Charge par métier — {view === "reel" ? "réel" : view === "cible" ? "cible" : "écart"}
        </h3>
        <div className="flex gap-1" data-testid="heatmap-view-toggle">
          <Button
            size="sm"
            variant={view === "reel" ? "default" : "ghost"}
            onClick={() => setView("reel")}
            data-testid="heatmap-view-reel"
          >
            <Eye className="mr-1 h-3 w-3" /> Réel
          </Button>
          <Button
            size="sm"
            variant={view === "cible" ? "default" : "ghost"}
            onClick={() => setView("cible")}
            data-testid="heatmap-view-cible"
          >
            <Target className="mr-1 h-3 w-3" /> Cible
          </Button>
          <Button
            size="sm"
            variant={view === "ecart" ? "default" : "ghost"}
            onClick={() => setView("ecart")}
            data-testid="heatmap-view-ecart"
          >
            Δ Écart
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-background/40">
              <th className="sticky left-0 z-10 bg-background/40 px-3 py-2 text-left font-semibold">
                Métier
              </th>
              {days.map((d) => (
                <th key={d} className="min-w-[42px] px-1 py-2 text-center font-mono text-[10px]">
                  {formatShortDate(d)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {METIER_ORDER.map((k) => {
              const row = matrix.get(k)!;
              const target = targetByMetier.get(k) ?? 0;
              const hasAny = days.some((d) => (row.get(d) ?? 0) > 0) || target > 0;
              if (!hasAny) return null;
              return (
                <tr key={k} className="border-b border-border/50">
                  <td className="sticky left-0 z-10 bg-card px-3 py-1.5 font-semibold">
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-sm"
                        style={{ backgroundColor: METIER_COLOR[k] }}
                      />
                      {METIER_LABEL[k]}
                      {target > 0 && (
                        <span className="text-[10px] font-normal text-muted-foreground">
                          (cible {target})
                        </span>
                      )}
                    </span>
                  </td>
                  {days.map((d) => {
                    const reel = row.get(d) ?? 0;
                    let v = 0;
                    if (view === "reel") v = reel;
                    else if (view === "cible") v = target;
                    else v = reel - target; // ecart
                    return (
                      <td key={d} className="px-0.5 py-0.5">
                        <div
                          className={`flex h-7 items-center justify-center rounded text-[11px] font-mono ${cellColor(view, v, target)}`}
                        >
                          {v !== 0 ? (view === "ecart" && v > 0 ? `+${v}` : v) : ""}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
