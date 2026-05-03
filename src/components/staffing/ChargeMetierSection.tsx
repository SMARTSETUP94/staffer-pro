// v0.38.2 — Wrapper Charge par métier : collapsible + drilldown objet par cellule.
// Contient HeatmapMetier (ou HeatmapCibleVsReel si configs) + Popover détail objets.
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HeatmapMetier } from "./HeatmapMetier";
import { HeatmapCibleVsReel } from "./HeatmapCibleVsReel";
import { METIER_COLOR, METIER_LABEL, METIER_ORDER, formatShortDate } from "./gantt-helpers";
import type { PlanStep, MetierKey } from "@/lib/staffing/types";
import { METIER_KEY_BY_ID } from "@/lib/staffing/types";
import type { ChantierMetierConfigRow } from "@/server/staffing-pre-parametrage.functions";

interface ObjetInfo {
  objet_id: string;
  reference: string;
  nom: string;
}

interface Props {
  planId: string;
  steps: PlanStep[];
  days: string[];
  objets: ObjetInfo[];
  preParamConfigs?: ChantierMetierConfigRow[];
}

interface DrillCell {
  metier: MetierKey;
  day: string;
  contributions: Array<{ objet_id: string | null; reference: string; nom: string; pers: number }>;
  total: number;
}

export function ChargeMetierSection({ planId, steps, days, objets, preParamConfigs }: Props) {
  const lsKey = `charge-metier-collapsed-${planId}`;
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(lsKey) === "1";
  });
  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      try { window.localStorage.setItem(lsKey, next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  };

  const [drill, setDrill] = useState<DrillCell | null>(null);

  const objetById = useMemo(() => {
    const m = new Map<string, ObjetInfo>();
    for (const o of objets) m.set(o.objet_id, o);
    return m;
  }, [objets]);

  // Index : metier × day → liste des contributions par objet
  const contributionIndex = useMemo(() => {
    const idx = new Map<string, Map<string, Map<string | null, number>>>();
    for (const s of steps) {
      if (s.start_date === "TBD") continue;
      const k = METIER_KEY_BY_ID[s.metier_id];
      if (!k) continue;
      const start = new Date(s.start_date + "T00:00:00Z");
      const spanDays = Math.max(1, Math.ceil((s.span_demi_jours ?? s.span_days * 2) / 2));
      for (let i = 0; i < spanDays; i++) {
        const d = new Date(start);
        d.setUTCDate(d.getUTCDate() + i);
        const iso = d.toISOString().slice(0, 10);
        if (!days.includes(iso)) continue;
        if (!idx.has(k)) idx.set(k, new Map());
        const dayMap = idx.get(k)!;
        if (!dayMap.has(iso)) dayMap.set(iso, new Map());
        const objMap = dayMap.get(iso)!;
        objMap.set(s.objet_id, (objMap.get(s.objet_id) ?? 0) + s.pers);
      }
    }
    return idx;
  }, [steps, days]);

  const handleCellClick = (metier: MetierKey, day: string) => {
    const objMap = contributionIndex.get(metier)?.get(day);
    if (!objMap || objMap.size === 0) {
      setDrill(null);
      return;
    }
    const contributions: DrillCell["contributions"] = [];
    let total = 0;
    for (const [objId, pers] of objMap.entries()) {
      const info = objId ? objetById.get(objId) : null;
      contributions.push({
        objet_id: objId,
        reference: info?.reference ?? (objId ? "—" : "Pool"),
        nom: info?.nom ?? (objId ? "" : "Tous objets"),
        pers,
      });
      total += pers;
    }
    contributions.sort((a, b) => b.pers - a.pers || a.reference.localeCompare(b.reference));
    setDrill({ metier, day, contributions, total });
  };

  return (
    <section
      data-testid="charge-metier-section"
      className="space-y-2"
    >
      <header className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={toggle}
          className="flex items-center gap-2 rounded text-left hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-expanded={!collapsed}
          aria-controls="charge-metier-body"
          data-testid="charge-metier-toggle"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Charge par métier {preParamConfigs && preParamConfigs.length > 0 ? "" : "— réel"}
          </h3>
        </button>
        {!collapsed && (
          <span className="text-[10px] text-muted-foreground italic">
            Astuce : clic sur une cellule pour le détail par objet
          </span>
        )}
      </header>

      {!collapsed && (
        <div id="charge-metier-body" className="space-y-2">
          {preParamConfigs && preParamConfigs.length > 0 ? (
            <HeatmapCibleVsReel steps={steps} days={days} configs={preParamConfigs} />
          ) : (
            <HeatmapMetier steps={steps} days={days} />
          )}

          {/* Drilldown overlay : grille invisible posée par-dessus pour capter clics */}
          <DrillOverlay
            steps={steps}
            days={days}
            onCellClick={handleCellClick}
            drill={drill}
            onClose={() => setDrill(null)}
            objetById={objetById}
          />
        </div>
      )}
    </section>
  );
}

// ---- Overlay drilldown : tableau cliquable séparé (lien visuel via légende) ----
function DrillOverlay({
  steps,
  days,
  onCellClick,
  drill,
  onClose,
  objetById: _objetById,
}: {
  steps: PlanStep[];
  days: string[];
  onCellClick: (m: MetierKey, day: string) => void;
  drill: DrillCell | null;
  onClose: () => void;
  objetById: Map<string, ObjetInfo>;
}) {
  // Calcul matrice [metier][day] -> total pers (pour savoir quelles cellules ont du contenu)
  const matrix = useMemo(() => {
    const m = new Map<MetierKey, Map<string, number>>();
    for (const k of METIER_ORDER) m.set(k, new Map());
    for (const s of steps) {
      if (s.start_date === "TBD") continue;
      const k = METIER_KEY_BY_ID[s.metier_id];
      if (!k) continue;
      const start = new Date(s.start_date + "T00:00:00Z");
      const spanDays = Math.max(1, Math.ceil((s.span_demi_jours ?? s.span_days * 2) / 2));
      for (let i = 0; i < spanDays; i++) {
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

  return (
    <div
      data-testid="charge-metier-drill"
      className="overflow-x-auto rounded-2xl border border-dashed border-border/60 bg-card/50"
    >
      <p className="px-3 pt-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        Détail par objet · cliquer sur une cellule
      </p>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border/40">
            <th className="sticky left-0 z-10 bg-card/50 px-3 py-1 text-left font-semibold">Métier</th>
            {days.map((d) => (
              <th key={d} className="min-w-[42px] px-1 py-1 text-center font-mono text-[10px]">
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
              <tr key={k} className="border-b border-border/30">
                <td className="sticky left-0 z-10 bg-card/50 px-3 py-1 font-semibold">
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
                  if (v === 0) {
                    return <td key={d} className="px-0.5 py-0.5" />;
                  }
                  const isOpen =
                    drill !== null && drill.metier === k && drill.day === d;
                  return (
                    <td key={d} className="px-0.5 py-0.5">
                      <Popover
                        open={isOpen}
                        onOpenChange={(o) => {
                          if (!o) onClose();
                          else onCellClick(k, d);
                        }}
                      >
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="flex h-6 w-full items-center justify-center rounded bg-muted/40 text-[10px] font-mono hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            data-testid={`drill-cell-${k}-${d}`}
                            onClick={() => onCellClick(k, d)}
                          >
                            {v}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72 p-3" align="center">
                          {isOpen && drill && (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold">
                                  {METIER_LABEL[drill.metier]} · {formatShortDate(drill.day)}
                                </span>
                                <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-mono text-primary">
                                  {drill.total} pers
                                </span>
                              </div>
                              <ul className="space-y-1">
                                {drill.contributions.map((c) => (
                                  <li
                                    key={c.objet_id ?? "_pool"}
                                    className="flex items-center justify-between gap-2 text-xs"
                                  >
                                    <span className="truncate">
                                      <span className="font-mono font-semibold">{c.reference}</span>
                                      {c.nom && (
                                        <span className="ml-1 text-muted-foreground">— {c.nom}</span>
                                      )}
                                    </span>
                                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                                      {c.pers}p
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </PopoverContent>
                      </Popover>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
