// v0.35.2bis — Vue Charge atelier multi-chantiers (chef+admin)
import { useEffect, useMemo, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ChevronLeft, ChevronRight, AlertTriangle, Activity, Hammer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getChargeAtelier } from "@/server/staffing.functions";
import { workingDaysBetween, formatShortDate, formatDayName, METIER_COLOR, METIER_LABEL, METIER_ORDER } from "./gantt-helpers";
import { METIER_KEY_BY_ID } from "@/lib/staffing/types";

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
    // Map plan_id -> affaire_id ; couleur par affaire
    const planToAffaire = new Map<string, string>();
    for (const p of data.plans) planToAffaire.set(p.id, p.affaire_id);
    const affaireIds = Array.from(new Set(data.plans.map((p) => p.affaire_id)));
    const affaireColor = new Map<string, string>();
    affaireIds.forEach((id, i) => affaireColor.set(id, CHANTIER_COLORS[i % CHANTIER_COLORS.length]));

    // matrix[metier][day] = [{ affaire_id, pers }]
    const matrix = new Map<number, Map<string, Array<{ affaire_id: string; pers: number }>>>();
    for (const k of METIER_ORDER) {
      const id = (k === "BE" ? 8 : k === "Num" ? 4 : k === "Bois" ? 1 : k === "Metal" ? 2 : k === "Peint" ? 3 : k === "Tap" ? 5 : 7);
      matrix.set(id, new Map());
    }
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
        row.get(iso)!.push({ affaire_id: aff, pers: s.pers });
      }
    }

    // Conflits CNC : cellule Num avec >= 2 affaires distinctes
    const cncConflicts: Array<{ date: string; affaires: string[] }> = [];
    const numRow = matrix.get(4) ?? new Map<string, Array<{ affaire_id: string; pers: number }>>();
    for (const [date, list] of numRow.entries()) {
      const uniq: string[] = Array.from(new Set((list as Array<{ affaire_id: string }>).map((l) => l.affaire_id)));
      if (uniq.length >= 2) cncConflicts.push({ date, affaires: uniq });
    }

    // Pic global : total pers / jour
    const totalsByDay = new Map<string, number>();
    let picGlobal = 0;
    for (const day of days) {
      let t = 0;
      for (const k of METIER_ORDER) {
        const id = (k === "BE" ? 8 : k === "Num" ? 4 : k === "Bois" ? 1 : k === "Metal" ? 2 : k === "Peint" ? 3 : k === "Tap" ? 5 : 7);
        const list = matrix.get(id)?.get(day) ?? [];
        for (const it of list) t += it.pers;
      }
      totalsByDay.set(day, t);
      if (t > picGlobal) picGlobal = t;
    }

    return {
      planToAffaire,
      affaireColor,
      affaireIds,
      matrix,
      cncConflicts,
      totalsByDay,
      picGlobal,
      chantiers: data.plans.map((p) => ({
        ...p,
        couleur: affaireColor.get(p.affaire_id) ?? "#5F5E5A",
      })),
    };
  }, [data, days]);

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (error) {
    return <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">{error}</div>;
  }
  if (!data || !analysis) return null;

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
            <div key={c.id} className="flex items-center gap-2 text-xs">
              <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: c.couleur }} />
              <span className="font-mono">{c.affaires?.numero ?? c.affaire_id.slice(0, 6)}</span>
              <span className="text-muted-foreground truncate max-w-[180px]">{c.affaires?.nom}</span>
            </div>
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
              const id = (k === "BE" ? 8 : k === "Num" ? 4 : k === "Bois" ? 1 : k === "Metal" ? 2 : k === "Peint" ? 3 : k === "Tap" ? 5 : 7);
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
                    const list: Array<{ affaire_id: string; pers: number }> = row.get(d) ?? [];
                    const total = list.reduce((s, it) => s + it.pers, 0);
                    const uniq = Array.from(new Set(list.map((l) => l.affaire_id)));
                    const isCncConflict = id === 4 && uniq.length >= 2;
                    return (
                      <td key={d} className="px-0.5 py-0.5">
                        <div
                          className={`flex h-7 items-center justify-center gap-0.5 rounded text-[10px] font-mono ${
                            isCncConflict ? "outline outline-2 outline-destructive" : ""
                          } ${total === 0 ? "bg-muted/20" : ""}`}
                          title={uniq.map((a) => `${a.slice(0, 6)} (${list.filter((l) => l.affaire_id === a).reduce((s, l) => s + l.pers, 0)}p)`).join(" · ")}
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
                const cls = v === 0 ? "bg-muted/20 text-muted-foreground" : v <= 8 ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300" : v <= 12 ? "bg-amber-500/30 text-amber-700 dark:text-amber-300" : "bg-destructive/40 text-destructive font-bold";
                return (
                  <td key={d} className="px-0.5 py-1">
                    <div className={`flex h-7 items-center justify-center rounded text-[11px] font-mono ${cls}`}>
                      {v > 0 ? v : ""}
                    </div>
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
            <AlertTriangle className="h-3 w-3" /> Conflits détectés
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
                Pic global {analysis.picGlobal} pers (max 12) — répartir sur plusieurs semaines ou ajouter de l'intérim.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

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
