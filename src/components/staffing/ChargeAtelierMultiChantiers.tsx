// v0.35.2 / Sprint 2.1 — Vue Charge atelier multi-chantiers (chef+admin)
// Drill-down : cellules CNC conflit + cellules pic global > 12 cliquables (Popover)
import { useEffect, useMemo, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Loader2, ChevronLeft, ChevronRight, AlertTriangle, Activity, Hammer, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getChargeAtelier } from "@/server/staffing.functions";
import { workingDaysBetween, formatShortDate, formatDayName, METIER_COLOR, METIER_LABEL, METIER_ORDER } from "./gantt-helpers";
import type { MetierKey } from "@/lib/staffing/types";
import { METIER_ID } from "@/lib/staffing/types";

interface PlanRow {
  id: string;
  affaire_id: string;
  date_debut_fab: string;
  date_fin_fab: string;
  affaires?: { id: string; numero: string; nom: string } | null;
}

interface StepRow {
  id: string;
  plan_id: string;
  metier_id: number;
  start_date: string;
  span_days: number;
  pers: number;
}

interface CncRow { affaire_id: string; date: string }

const CHANTIER_COLORS = [
  "#185FA5", "#534AB7", "#BA7517", "#0F6E56",
  "#D4537E", "#5F5E5A", "#888780", "#7C2D12",
];

const METIER_KEY_FROM_ID: Record<number, MetierKey> = {
  8: "BE", 4: "Num", 1: "Bois", 2: "Metal", 3: "Peint", 5: "Tap", 7: "Manut",
};

function isoAddWeeks(iso: string, w: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + w * 7);
  return d.toISOString().slice(0, 10);
}

function getMondayOfWeek(d: Date): string {
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const m = new Date(d);
  m.setUTCDate(d.getUTCDate() + diff);
  return m.toISOString().slice(0, 10);
}

export function ChargeAtelierMultiChantiers() {
  const fetchCharge = useServerFn(getChargeAtelier);
  const [weekOffset, setWeekOffset] = useState(0);
  const [data, setData] = useState<{ plans: PlanRow[]; steps: StepRow[]; cnc: CncRow[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const window = useMemo(() => {
    const today = new Date();
    const monday = getMondayOfWeek(today);
    const start = isoAddWeeks(monday, weekOffset);
    const end = isoAddWeeks(start, 4); // 4 semaines
    return { start, end };
  }, [weekOffset]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetchCharge({ data: { date_debut: window.start, date_fin: window.end } });
      setData(r as { plans: PlanRow[]; steps: StepRow[]; cnc: CncRow[] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [fetchCharge, window.start, window.end]);

  useEffect(() => { void reload(); }, [reload]);

  const days = useMemo(() => workingDaysBetween(window.start, window.end), [window]);

  const analysis = useMemo(() => {
    if (!data) return null;
    const planToAffaire = new Map<string, string>();
    const planById = new Map<string, PlanRow>();
    for (const p of data.plans) {
      planToAffaire.set(p.id, p.affaire_id);
      planById.set(p.id, p);
    }
    const affaireIds = Array.from(new Set(data.plans.map((p) => p.affaire_id)));
    const affaireColor = new Map<string, string>();
    affaireIds.forEach((id, i) => affaireColor.set(id, CHANTIER_COLORS[i % CHANTIER_COLORS.length]));

    // affaire_id -> 1er plan_id correspondant (pour lien drill-down)
    const affairePlanId = new Map<string, string>();
    for (const p of data.plans) {
      if (!affairePlanId.has(p.affaire_id)) affairePlanId.set(p.affaire_id, p.id);
    }
    const affaireInfo = new Map<string, { numero: string; nom: string }>();
    for (const p of data.plans) {
      if (p.affaires && !affaireInfo.has(p.affaire_id)) {
        affaireInfo.set(p.affaire_id, { numero: p.affaires.numero, nom: p.affaires.nom });
      }
    }

    // matrix[metier_id][day] = [{ affaire_id, pers, plan_id }]
    type Slot = { affaire_id: string; pers: number; plan_id: string };
    const matrix = new Map<number, Map<string, Slot[]>>();
    for (const k of METIER_ORDER) matrix.set(METIER_ID[k], new Map());
    for (const s of data.steps) {
      const aff = planToAffaire.get(s.plan_id);
      if (!aff) continue;
      const start = new Date(s.start_date + "T00:00:00Z");
      for (let i = 0; i < s.span_days; i++) {
        const d = new Date(start);
        d.setUTCDate(d.getUTCDate() + i);
        const iso = d.toISOString().slice(0, 10);
        if (!days.includes(iso)) continue;
        const row = matrix.get(s.metier_id);
        if (!row) continue;
        if (!row.has(iso)) row.set(iso, []);
        row.get(iso)!.push({ affaire_id: aff, pers: s.pers, plan_id: s.plan_id });
      }
    }

    // Conflits CNC : cellule Num avec >= 2 affaires distinctes
    const cncConflicts: Array<{ date: string; affaires: string[] }> = [];
    const numRow = matrix.get(4) ?? new Map<string, Slot[]>();
    for (const [date, list] of numRow.entries()) {
      const uniq = Array.from(new Set(list.map((l) => l.affaire_id)));
      if (uniq.length >= 2) cncConflicts.push({ date, affaires: uniq });
    }

    // Pic global et breakdown par chantier × métier pour drill-down
    const totalsByDay = new Map<string, number>();
    const breakdownByDay = new Map<string, Map<string, Map<MetierKey, number>>>(); // day -> affaire_id -> metier -> pers
    let picGlobal = 0;
    for (const day of days) {
      let t = 0;
      const affMap = new Map<string, Map<MetierKey, number>>();
      for (const k of METIER_ORDER) {
        const id = METIER_ID[k];
        const list = matrix.get(id)?.get(day) ?? [];
        for (const it of list) {
          t += it.pers;
          if (!affMap.has(it.affaire_id)) affMap.set(it.affaire_id, new Map());
          const mm = affMap.get(it.affaire_id)!;
          mm.set(k, (mm.get(k) ?? 0) + it.pers);
        }
      }
      totalsByDay.set(day, t);
      breakdownByDay.set(day, affMap);
      if (t > picGlobal) picGlobal = t;
    }

    return {
      planToAffaire,
      planById,
      affairePlanId,
      affaireInfo,
      affaireColor,
      affaireIds,
      matrix,
      cncConflicts,
      totalsByDay,
      breakdownByDay,
      picGlobal,
      chantiers: data.plans.map((p) => ({
        ...p,
        couleur: affaireColor.get(p.affaire_id) ?? "#5F5E5A",
      })),
    };
  }, [data, days]);

  if (loading) {
    return (
      <div className="space-y-3 py-4" aria-busy="true" aria-label="Chargement de la charge atelier">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (error) {
    return <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">{error}</div>;
  }
  if (!data || !analysis) return null;

  if (analysis.affaireIds.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/40 p-10 text-center">
        <Activity className="mx-auto h-8 w-8 text-muted-foreground/60" />
        <p className="mt-3 text-sm font-semibold text-foreground">Aucun chantier publié sur cette fenêtre</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Publiez un plan staffing depuis une affaire 5XXX pour le voir apparaître ici.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <StatCard icon={<Hammer className="h-4 w-4" />} label="Chantiers actifs" value={`${analysis.affaireIds.length}`} />
        <StatCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Conflits CNC"
          value={`${analysis.cncConflicts.length}`}
          valueClassName={analysis.cncConflicts.length > 0 ? "text-destructive" : ""}
        />
        <StatCard
          icon={<Activity className="h-4 w-4" />}
          label="Pic global atelier"
          value={`${analysis.picGlobal} pers`}
          valueClassName={analysis.picGlobal > 12 ? "text-destructive" : analysis.picGlobal > 8 ? "text-amber-600" : ""}
        />
      </div>

      {/* Légende chantiers */}
      {analysis.chantiers.length > 0 && (
        <div className="flex flex-wrap gap-2 rounded-xl border border-border bg-card p-3">
          {analysis.chantiers.map((c) => (
            <Link
              key={c.id}
              to="/staffing/$planId"
              params={{ planId: c.id }}
              className="flex items-center gap-2 text-xs hover:underline"
            >
              <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: c.couleur }} />
              <span className="font-mono">{c.affaires?.numero ?? c.affaire_id.slice(0, 6)}</span>
              <span className="text-muted-foreground truncate max-w-[180px]">{c.affaires?.nom}</span>
            </Link>
          ))}
        </div>
      )}

      {/* Navigation semaines */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2">
        <Button variant="outline" size="sm" onClick={() => setWeekOffset((w) => w - 1)}>
          <ChevronLeft className="mr-1 h-3 w-3" /> Semaine -1
        </Button>
        <p className="text-xs font-semibold">
          {formatShortDate(window.start)} → {formatShortDate(window.end)}
        </p>
        <Button variant="outline" size="sm" onClick={() => setWeekOffset((w) => w + 1)}>
          Semaine +1 <ChevronRight className="ml-1 h-3 w-3" />
        </Button>
      </div>

      {/* Heatmap */}
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-background/40">
              <th className="sticky left-0 z-10 bg-background/40 px-3 py-2 text-left font-semibold">Métier</th>
              {days.map((d) => (
                <th key={d} className="min-w-[44px] px-1 py-2 text-center font-mono text-[10px]">
                  <div className="text-muted-foreground">{formatDayName(d)}</div>
                  <div className="font-semibold">{formatShortDate(d)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {METIER_ORDER.map((k) => {
              const id = METIER_ID[k];
              const row = analysis.matrix.get(id) ?? new Map();
              const hasAny = days.some((d) => (row.get(d)?.length ?? 0) > 0);
              if (!hasAny) return null;
              return (
                <tr key={k} className="border-b border-border/50">
                  <td className="sticky left-0 z-10 bg-card px-3 py-1.5 font-semibold">
                    <span className="flex items-center gap-2">
                      <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: METIER_COLOR[k] }} />
                      {METIER_LABEL[k]}
                    </span>
                  </td>
                  {days.map((d) => {
                    const list: Array<{ affaire_id: string; pers: number; plan_id: string }> = row.get(d) ?? [];
                    const total = list.reduce((s, it) => s + it.pers, 0);
                    const uniq = Array.from(new Set(list.map((l) => l.affaire_id)));
                    const isCncConflict = id === 4 && uniq.length >= 2;
                    const cellInner = (
                      <div
                        data-conflit-cell={isCncConflict ? "1" : undefined}
                        className={`flex h-7 items-center justify-center gap-0.5 rounded text-[10px] font-mono ${
                          isCncConflict ? "outline outline-2 outline-destructive cursor-pointer" : ""
                        } ${total === 0 ? "bg-muted/20" : ""}`}
                        title={
                          !isCncConflict
                            ? uniq
                                .map(
                                  (a) =>
                                    `${analysis.affaireInfo.get(a)?.numero ?? a.slice(0, 6)} (${list
                                      .filter((l) => l.affaire_id === a)
                                      .reduce((s, l) => s + l.pers, 0)}p)`
                                )
                                .join(" · ")
                            : undefined
                        }
                      >
                        {uniq.slice(0, 4).map((a) => (
                          <span
                            key={a}
                            className="inline-block h-4 w-3 rounded-sm"
                            style={{ backgroundColor: analysis.affaireColor.get(a) ?? "#5F5E5A" }}
                          />
                        ))}
                        {total > 0 && <span className="ml-0.5 text-foreground">{total}</span>}
                      </div>
                    );
                    return (
                      <td key={d} className="px-0.5 py-0.5">
                        {isCncConflict ? (
                          <Popover>
                            <PopoverTrigger asChild>{cellInner}</PopoverTrigger>
                            <PopoverContent className="w-72 p-3">
                              <p className="text-xs font-bold uppercase tracking-wider text-destructive">
                                Conflit CNC — {formatShortDate(d)}
                              </p>
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                {uniq.length} chantiers réservent la CNC le même jour.
                              </p>
                              <ul className="mt-2 space-y-1">
                                {uniq.map((a) => {
                                  const info = analysis.affaireInfo.get(a);
                                  const planId = analysis.affairePlanId.get(a);
                                  return (
                                    <li key={a} className="flex items-center gap-2 text-xs">
                                      <span
                                        className="inline-block h-3 w-3 rounded-sm shrink-0"
                                        style={{ backgroundColor: analysis.affaireColor.get(a) ?? "#5F5E5A" }}
                                      />
                                      <span className="font-mono">{info?.numero ?? a.slice(0, 6)}</span>
                                      <span className="text-muted-foreground truncate flex-1">
                                        {info?.nom}
                                      </span>
                                      {planId && (
                                        <Link
                                          to="/staffing/$planId"
                                          params={{ planId }}
                                          className="text-primary hover:underline"
                                        >
                                          <ExternalLink className="h-3 w-3" />
                                        </Link>
                                      )}
                                    </li>
                                  );
                                })}
                              </ul>
                            </PopoverContent>
                          </Popover>
                        ) : (
                          cellInner
                        )}
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
                const v = analysis.totalsByDay.get(d) ?? 0;
                const isPicAlert = v > 12;
                const cls =
                  v === 0
                    ? "bg-muted/20 text-muted-foreground"
                    : v <= 8
                      ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                      : v <= 12
                        ? "bg-amber-500/30 text-amber-700 dark:text-amber-300"
                        : "bg-destructive/40 text-destructive font-bold cursor-pointer";
                const cellInner = (
                  <div className={`flex h-7 items-center justify-center rounded text-[11px] font-mono ${cls}`}>
                    {v > 0 ? v : ""}
                  </div>
                );
                return (
                  <td key={d} className="px-0.5 py-1">
                    {isPicAlert ? (
                      <Popover>
                        <PopoverTrigger asChild>{cellInner}</PopoverTrigger>
                        <PopoverContent className="w-80 p-3">
                          <p className="text-xs font-bold uppercase tracking-wider text-destructive">
                            Pic atelier {v} pers — {formatShortDate(d)}
                          </p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Plafond conseillé : 12 pers. Voici le détail par chantier.
                          </p>
                          <ul className="mt-2 space-y-1.5">
                            {Array.from(analysis.breakdownByDay.get(d) ?? []).map(([affId, mm]) => {
                              const info = analysis.affaireInfo.get(affId);
                              const planId = analysis.affairePlanId.get(affId);
                              const totalAff = Array.from(mm.values()).reduce((s, v2) => s + v2, 0);
                              return (
                                <li key={affId} className="text-xs">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className="inline-block h-3 w-3 rounded-sm shrink-0"
                                      style={{ backgroundColor: analysis.affaireColor.get(affId) ?? "#5F5E5A" }}
                                    />
                                    <span className="font-mono font-bold">{info?.numero ?? affId.slice(0, 6)}</span>
                                    <span className="font-mono text-muted-foreground">{totalAff}p</span>
                                    <span className="text-muted-foreground truncate flex-1">{info?.nom}</span>
                                    {planId && (
                                      <Link
                                        to="/staffing/$planId"
                                        params={{ planId }}
                                        className="text-primary hover:underline"
                                      >
                                        <ExternalLink className="h-3 w-3" />
                                      </Link>
                                    )}
                                  </div>
                                  <div className="ml-5 mt-0.5 flex flex-wrap gap-1.5">
                                    {Array.from(mm.entries()).map(([metier, p]) => (
                                      <span
                                        key={metier}
                                        className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono"
                                      >
                                        <span
                                          className="inline-block h-1.5 w-1.5 rounded-sm"
                                          style={{ backgroundColor: METIER_COLOR[metier] }}
                                        />
                                        {METIER_LABEL[metier]} {p}p
                                      </span>
                                    ))}
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        </PopoverContent>
                      </Popover>
                    ) : (
                      cellInner
                    )}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Footer alerte */}
      {(analysis.cncConflicts.length > 0 || analysis.picGlobal > 12) && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3">
          <p className="text-xs font-bold uppercase tracking-wider text-destructive flex items-center gap-2">
            <AlertTriangle className="h-3 w-3" /> Conflits détectés — clic sur cellule rouge pour drill-down
          </p>
          <ul className="mt-2 space-y-1 text-xs text-foreground">
            {analysis.cncConflicts.map((c) => (
              <li key={c.date}>
                <span className="font-mono">{formatShortDate(c.date)}</span> — CNC partagée par{" "}
                {c.affaires.length} chantiers : décaler un BE/Num.
              </li>
            ))}
            {analysis.picGlobal > 12 && (
              <li>
                Pic global {analysis.picGlobal} pers (max 12) — répartir sur plusieurs semaines ou ajouter de l'intermittent.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

// Cohérence : utilisé dans tooltip
void METIER_KEY_FROM_ID;

function StatCard({
  icon, label, value, valueClassName,
}: { icon: React.ReactNode; label: string; value: string; valueClassName?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className={`mt-1 text-2xl font-bold ${valueClassName ?? "text-foreground"}`}>{value}</p>
    </div>
  );
}
