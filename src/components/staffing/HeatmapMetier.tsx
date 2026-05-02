// v0.35.2 — Heatmap par métier (lignes métier × colonnes jours ouvrés)
import { METIER_COLOR, METIER_LABEL, METIER_ORDER, formatShortDate } from "./gantt-helpers";
import type { PlanStep, MetierKey } from "@/lib/staffing/types";
import { METIER_ID } from "@/lib/staffing/types";

interface Props {
  steps: PlanStep[];
  days: string[];
}

function metierKeyById(id: number): MetierKey | null {
  for (const k of METIER_ORDER) if (METIER_ID[k] === id) return k;
  return null;
}

function loadColor(load: number): string {
  if (load === 0) return "bg-muted/30 text-muted-foreground";
  if (load <= 8) return "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300";
  if (load <= 12) return "bg-amber-500/30 text-amber-700 dark:text-amber-300";
  return "bg-destructive/40 text-destructive font-bold";
}

export function HeatmapMetier({ steps, days }: Props) {
  // Build matrix [metier][day] -> pers
  const matrix = new Map<MetierKey, Map<string, number>>();
  for (const k of METIER_ORDER) matrix.set(k, new Map());
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
      const m = matrix.get(k)!;
      m.set(iso, (m.get(iso) ?? 0) + s.pers);
    }
  }

  const totalsByDay = new Map<string, number>();
  for (const day of days) {
    let t = 0;
    for (const k of METIER_ORDER) t += matrix.get(k)!.get(day) ?? 0;
    totalsByDay.set(day, t);
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
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
            const hasAny = days.some((d) => (row.get(d) ?? 0) > 0);
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
                  </span>
                </td>
                {days.map((d) => {
                  const v = row.get(d) ?? 0;
                  return (
                    <td key={d} className="px-0.5 py-0.5">
                      <div
                        className={`flex h-7 items-center justify-center rounded text-[11px] font-mono ${loadColor(v)}`}
                      >
                        {v > 0 ? v : ""}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
          <tr className="border-t-2 border-border bg-background/30">
            <td className="sticky left-0 z-10 bg-background/30 px-3 py-2 text-xs font-bold uppercase tracking-wider">
              Total / jour
            </td>
            {days.map((d) => {
              const v = totalsByDay.get(d) ?? 0;
              return (
                <td key={d} className="px-0.5 py-1">
                  <div
                    className={`flex h-7 items-center justify-center rounded text-[11px] font-mono ${loadColor(v)}`}
                  >
                    {v > 0 ? v : ""}
                  </div>
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
