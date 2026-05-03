// v0.38.3 — Treetable hiérarchique unique : 1 ligne par métier (total/jour) + sous-lignes
// objets contributeurs expand/collapse. Remplace l'ancien duo heatmap + drill par cellule.
import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { METIER_COLOR, METIER_LABEL, METIER_ORDER, formatShortDate } from "./gantt-helpers";
import type { PlanStep, MetierKey } from "@/lib/staffing/types";
import { METIER_KEY_BY_ID } from "@/lib/staffing/types";
import type { ChantierMetierConfigRow } from "@/server/staffing-pre-parametrage.functions";
import { PersStepper } from "./PersStepper";
import { DateShifter } from "./DateShifter";

interface ObjetInfo {
  objet_id: string;
  reference: string;
  nom: string;
}

interface StepEditCtx {
  step: PlanStep;
  manualShift: number;
  hasLocalEdit: boolean;
  hasWarn: boolean;
}

interface Props {
  planId: string;
  steps: PlanStep[];
  days: string[];
  objets: ObjetInfo[];
  preParamConfigs?: ChantierMetierConfigRow[];
  /** v0.39.0 — édition cross-vues : passe handlers + ctx pour PersStepper / DateShifter */
  editable?: boolean;
  getStepCtx?: (objet_id: string | null, metier: MetierKey) => StepEditCtx | null;
  onSetPers?: (step: PlanStep, pers: number) => void;
  onShift?: (step: PlanStep, delta: number) => void;
  onResetShift?: (stepId: string) => void;
}

interface MetierRow {
  metier: MetierKey;
  totalByDay: Map<string, number>;
  totalHours: number;
  contributors: Array<{
    key: string;
    objet_id: string | null;
    reference: string;
    nom: string;
    byDay: Map<string, number>;
    totalHours: number;
  }>;
}

const HIGH_VOLUME_THRESHOLD_H = 100;

export function ChargeMetierSection({
  planId,
  steps,
  days,
  objets,
  preParamConfigs: _,
  editable,
  getStepCtx,
  onSetPers,
  onShift,
  onResetShift,
}: Props) {
  const sectionLsKey = `charge-metier-collapsed-${planId}`;
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(sectionLsKey) === "1";
  });
  const toggleSection = () => {
    setCollapsed((c) => {
      const next = !c;
      try { window.localStorage.setItem(sectionLsKey, next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  };

  const objetById = useMemo(() => {
    const m = new Map<string, ObjetInfo>();
    for (const o of objets) m.set(o.objet_id, o);
    return m;
  }, [objets]);

  // Agrégation : par métier → total/jour + contributeurs (objet → /jour)
  const rows = useMemo<MetierRow[]>(() => {
    const acc = new Map<MetierKey, {
      totalByDay: Map<string, number>;
      totalHours: number;
      contribs: Map<string, { objet_id: string | null; reference: string; nom: string; byDay: Map<string, number>; totalHours: number }>;
    }>();
    for (const s of steps) {
      if (s.start_date === "TBD") continue;
      const k = METIER_KEY_BY_ID[s.metier_id];
      if (!k) continue;
      const halfDays = Math.max(1, s.span_demi_jours ?? s.span_days * 2);
      const spanDays = Math.max(1, Math.ceil(halfDays / 2));
      const hours = s.pers * halfDays * 4;
      if (!acc.has(k)) acc.set(k, { totalByDay: new Map(), totalHours: 0, contribs: new Map() });
      const bucket = acc.get(k)!;
      bucket.totalHours += hours;

      const contribKey = s.objet_id ?? "_pool";
      if (!bucket.contribs.has(contribKey)) {
        const info = s.objet_id ? objetById.get(s.objet_id) : null;
        bucket.contribs.set(contribKey, {
          objet_id: s.objet_id,
          reference: info?.reference ?? (s.objet_id ? "—" : "Pool"),
          nom: info?.nom ?? (s.objet_id ? "" : "Tous objets"),
          byDay: new Map(),
          totalHours: 0,
        });
      }
      const contrib = bucket.contribs.get(contribKey)!;
      contrib.totalHours += hours;

      const start = new Date(s.start_date + "T00:00:00Z");
      for (let i = 0; i < spanDays; i++) {
        const d = new Date(start);
        d.setUTCDate(d.getUTCDate() + i);
        const iso = d.toISOString().slice(0, 10);
        if (!days.includes(iso)) continue;
        bucket.totalByDay.set(iso, (bucket.totalByDay.get(iso) ?? 0) + s.pers);
        contrib.byDay.set(iso, (contrib.byDay.get(iso) ?? 0) + s.pers);
      }
    }
    const out: MetierRow[] = [];
    for (const k of METIER_ORDER) {
      const b = acc.get(k);
      if (!b) continue;
      const hasAny = days.some((d) => (b.totalByDay.get(d) ?? 0) > 0);
      if (!hasAny) continue;
      const contributors = Array.from(b.contribs.entries())
        .map(([key, v]) => ({ key, ...v }))
        .sort((a, b1) => b1.totalHours - a.totalHours || a.reference.localeCompare(b1.reference));
      out.push({
        metier: k,
        totalByDay: b.totalByDay,
        totalHours: b.totalHours,
        contributors,
      });
    }
    return out;
  }, [steps, days, objetById]);

  // État expand/collapse par métier (persist localStorage)
  const expandedLsKey = `metier-expanded-${planId}`;
  const [expanded, setExpanded] = useState<Set<MetierKey>>(() => {
    let stored: string[] | null = null;
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(expandedLsKey);
        if (raw) stored = JSON.parse(raw) as string[];
      } catch { /* ignore */ }
    }
    if (stored) return new Set(stored as MetierKey[]);
    // Défaut : métiers gros volume (>100h) expanded
    const defaults = new Set<MetierKey>();
    for (const r of rows) {
      if (r.totalHours > HIGH_VOLUME_THRESHOLD_H && r.contributors.length > 1) {
        defaults.add(r.metier);
      }
    }
    return defaults;
  });

  const toggleMetier = (m: MetierKey) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m); else next.add(m);
      try { window.localStorage.setItem(expandedLsKey, JSON.stringify(Array.from(next))); } catch { /* ignore */ }
      return next;
    });
  };

  return (
    <section data-testid="charge-metier-section" className="space-y-2">
      <header className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={toggleSection}
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
            Charge par métier
          </h3>
        </button>
        {!collapsed && (
          <span className="text-[10px] text-muted-foreground italic">
            Clic sur un métier pour voir les objets contributeurs
          </span>
        )}
      </header>

      {!collapsed && (
        <div
          id="charge-metier-body"
          data-testid="charge-metier-treetable"
          className="overflow-x-auto rounded-2xl border border-border/60 bg-card/50"
        >
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/40">
                <th className="sticky left-0 z-10 bg-card/50 px-3 py-1 text-left font-semibold min-w-[200px]">
                  Métier / Objet
                </th>
                {days.map((d) => (
                  <th key={d} className="min-w-[42px] px-1 py-1 text-center font-mono text-[10px]">
                    <div className="font-semibold">{formatShortDate(d)}</div>
                    <div className="mt-0.5 flex items-center justify-around text-[8px] font-bold text-muted-foreground/70">
                      <span>AM</span>
                      <span>PM</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const canExpand = row.contributors.length > 1;
                const isExpanded = canExpand && expanded.has(row.metier);
                return (
                  <Fragment key={row.metier}>
                    <tr
                      key={row.metier}
                      className="border-b border-border/30 bg-muted/20"
                      data-testid={`metier-row-${row.metier}`}
                    >
                      <td className="sticky left-0 z-10 bg-muted/20 px-3 py-1 font-semibold">
                        {canExpand ? (
                          <button
                            type="button"
                            onClick={() => toggleMetier(row.metier)}
                            className="flex w-full items-center gap-2 text-left hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                            aria-expanded={isExpanded}
                            data-testid={`metier-toggle-${row.metier}`}
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-sm"
                              style={{ backgroundColor: METIER_COLOR[row.metier] }}
                            />
                            <span>{METIER_LABEL[row.metier]}</span>
                            <span className="ml-auto text-[10px] font-mono text-muted-foreground">
                              {Math.round(row.totalHours)}h · {row.contributors.length} obj.
                            </span>
                          </button>
                        ) : (
                          <span className="flex items-center gap-2 pl-[18px]">
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-sm"
                              style={{ backgroundColor: METIER_COLOR[row.metier] }}
                            />
                            <span>{METIER_LABEL[row.metier]}</span>
                            <span className="ml-auto text-[10px] font-mono text-muted-foreground">
                              {Math.round(row.totalHours)}h
                            </span>
                          </span>
                        )}
                      </td>
                      {days.map((d) => {
                        const v = row.totalByDay.get(d) ?? 0;
                        return (
                          <td key={d} className="px-0.5 py-0.5">
                            {v > 0 ? (
                              <div
                                className="flex h-6 w-full items-center justify-center rounded bg-muted/40 text-[10px] font-mono font-semibold"
                                title={`${METIER_LABEL[row.metier]} · ${formatShortDate(d)} · ${v}p`}
                              >
                                {v}
                              </div>
                            ) : null}
                          </td>
                        );
                      })}
                    </tr>
                    {isExpanded && row.contributors.map((c) => {
                      const ctx = editable && getStepCtx ? getStepCtx(c.objet_id, row.metier) : null;
                      return (
                      <tr
                        key={`${row.metier}-${c.key}`}
                        className="border-b border-border/20"
                        data-testid={`contrib-row-${row.metier}-${c.key}`}
                      >
                        <td className="sticky left-0 z-10 bg-card/30 px-3 py-1">
                          <span className="flex items-center gap-2 pl-6 text-muted-foreground">
                            <span
                              className="inline-block h-3 w-px self-stretch bg-border"
                              aria-hidden="true"
                            />
                            <span className="font-mono text-[11px] font-semibold text-foreground">
                              {c.reference}
                            </span>
                            {c.nom && (
                              <span className="truncate text-[10px]">— {c.nom}</span>
                            )}
                            <span className="ml-auto flex items-center gap-1.5 text-[10px] font-mono">
                              {ctx && onSetPers && (
                                <PersStepper
                                  value={ctx.step.pers}
                                  metier={row.metier}
                                  hasWarn={ctx.hasWarn}
                                  hasLocalEdit={ctx.hasLocalEdit}
                                  onChange={(v) => onSetPers(ctx.step, v)}
                                />
                              )}
                              {ctx && onShift && (
                                <DateShifter
                                  manualShift={ctx.manualShift}
                                  onShift={(d) => onShift(ctx.step, d)}
                                  onReset={onResetShift ? () => onResetShift(ctx.step.id) : undefined}
                                />
                              )}
                              <span className="ml-1">{Math.round(c.totalHours)}h</span>
                            </span>
                          </span>
                        </td>
                        {days.map((d) => {
                          const v = c.byDay.get(d) ?? 0;
                          return (
                            <td key={d} className="px-0.5 py-0.5">
                              {v > 0 ? (
                                <div
                                  className="flex h-5 w-full items-center justify-center rounded bg-background text-[10px] font-mono text-muted-foreground"
                                  title={`${c.reference} · ${formatShortDate(d)} · ${v}p`}
                                >
                                  {v}
                                </div>
                              ) : null}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={days.length + 1} className="px-3 py-4 text-center text-muted-foreground">
                    Aucune charge planifiée
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
