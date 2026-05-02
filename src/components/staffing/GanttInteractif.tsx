// v0.35.2 — GanttInteractif : composant principal Auto-staffing Fabrication 5XXX
import { useEffect, useMemo, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ArrowUp, ArrowDown, RefreshCw, Calendar, Users, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  calculateStaffingPlan,
  updatePlanObject,
  updatePlanStep,
} from "@/server/staffing.functions";
import {
  workingDaysBetween,
  formatDayName,
  formatShortDate,
  stepSpanInWindow,
  METIER_COLOR,
  METIER_LABEL,
} from "./gantt-helpers";
import { GanttBar } from "./GanttBar";
import { HeatmapMetier } from "./HeatmapMetier";
import { AlerteBandeau } from "./AlerteBandeau";
import type { PlanResult } from "@/lib/staffing/types";
import { METIER_KEY_BY_ID } from "@/lib/staffing/types";

interface PlanData {
  plan: { id: string; affaire_id: string; date_debut_fab: string; date_fin_fab: string; status: string };
  objets: Array<{
    id: string;
    objet_id: string;
    reference: string;
    nom: string;
    display_order: number;
    included: boolean;
    heures_total: number;
  }>;
  result: PlanResult;
  cnc_reserved_dates: string[];
}

export function GanttInteractif({ planId }: { planId: string }) {
  const calculate = useServerFn(calculateStaffingPlan);
  const updateObj = useServerFn(updatePlanObject);
  const updateStep = useServerFn(updatePlanStep);
  const [data, setData] = useState<PlanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await calculate({ data: { planId } });
      setData(r as PlanData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, [calculate, planId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const days = useMemo(() => {
    if (!data) return [];
    return workingDaysBetween(data.result.date_debut_fab, data.result.date_fin_fab);
  }, [data]);

  const stats = useMemo(() => {
    if (!data) return null;
    let totalH = 0;
    let pic = 0;
    for (const s of data.result.steps) totalH += s.pers * s.h_par_jour * s.span_days;
    for (const v of Object.values(data.result.daily_load)) if (v > pic) pic = v;
    const hasHard = data.result.alerts.some((a) => a.severity === "hard");
    const hasSoft = data.result.alerts.some((a) => a.severity === "soft");
    const statut = hasHard ? "Critique" : hasSoft ? "Attention" : "Conforme";
    const statutColor = hasHard
      ? "text-destructive"
      : hasSoft
        ? "text-amber-600 dark:text-amber-400"
        : "text-emerald-600 dark:text-emerald-400";
    return { totalH, pic, statut, statutColor };
  }, [data]);

  const handleShift = useCallback(
    async (stepId: string, delta: number) => {
      const step = data?.result.steps.find((s) => s.id === stepId);
      if (!step) return;
      // step.id est l'id en mémoire, pas le DB id ; pour MVP on n'écrit que si DB id mappable
      // ici on saute la persistance car les steps en mémoire viennent du calcul, pas de la DB
      // (Sprint 2.1 : persister steps avant de pouvoir shift)
      void delta;
    },
    [data]
  );

  const handleReorder = useCallback(
    async (objId: string, direction: -1 | 1) => {
      if (!data) return;
      const sorted = [...data.objets].sort((a, b) => a.display_order - b.display_order);
      const idx = sorted.findIndex((o) => o.id === objId);
      const swap = idx + direction;
      if (idx === -1 || swap < 0 || swap >= sorted.length) return;
      const a = sorted[idx];
      const b = sorted[swap];
      try {
        await Promise.all([
          updateObj({ data: { id: a.id, display_order: b.display_order } }),
          updateObj({ data: { id: b.id, display_order: a.display_order } }),
        ]);
        await reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur reorder");
      }
    },
    [data, updateObj, reload]
  );

  // Pour éviter unused
  void handleShift;
  void updateStep;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">
        Erreur : {error}
        <Button onClick={reload} variant="outline" size="sm" className="ml-3">
          <RefreshCw className="mr-1 h-3 w-3" /> Réessayer
        </Button>
      </div>
    );
  }
  if (!data || !stats) return null;

  const objets = [...data.objets].sort((a, b) => a.display_order - b.display_order);
  const dateLivraison = data.result.date_fin_fab;

  // Grid template : 1 col label + N cols jours
  const gridTemplate = `220px repeat(${days.length}, minmax(42px, 1fr))`;

  return (
    <div className="space-y-4">
      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          icon={<Activity className="h-4 w-4" />}
          label="Volume total"
          value={`${stats.totalH.toFixed(0)} h`}
        />
        <StatCard
          icon={<Calendar className="h-4 w-4" />}
          label="Livraison HARD"
          value={formatShortDate(dateLivraison)}
        />
        <StatCard icon={<Users className="h-4 w-4" />} label="Pic atelier" value={`${stats.pic} pers`} />
        <StatCard
          icon={<Activity className="h-4 w-4" />}
          label="Statut"
          value={stats.statut}
          valueClassName={stats.statutColor}
        />
      </div>

      {/* Alertes */}
      <AlerteBandeau alerts={data.result.alerts} />

      {/* Gantt */}
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <div className="min-w-[900px]">
          {/* Header dates */}
          <div className="grid border-b border-border bg-background/40" style={{ gridTemplateColumns: gridTemplate }}>
            <div className="px-3 py-2 text-xs font-bold uppercase tracking-wider">Objet / Étape</div>
            {days.map((d) => (
              <div key={d} className="border-l border-border/40 px-1 py-2 text-center font-mono text-[10px]">
                <div className="text-muted-foreground">{formatDayName(d)}</div>
                <div className="font-semibold">{formatShortDate(d)}</div>
              </div>
            ))}
          </div>

          {/* BE & Num steps (sans objet) */}
          {data.result.steps
            .filter((s) => s.objet_id === null && s.start_date !== "TBD")
            .map((s) => {
              const span = stepSpanInWindow(days, s.start_date, s.span_days);
              const stepEnd = new Date(s.start_date + "T00:00:00Z");
              stepEnd.setUTCDate(stepEnd.getUTCDate() + s.span_days - 1);
              const overDL = stepEnd.toISOString().slice(0, 10) > dateLivraison;
              const k = METIER_KEY_BY_ID[s.metier_id] ?? "Manut";
              return (
                <div
                  key={s.id}
                  className="grid items-center border-b border-border/30 py-1.5"
                  style={{ gridTemplateColumns: gridTemplate }}
                >
                  <div className="flex items-center gap-2 px-3 text-xs">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-sm"
                      style={{ backgroundColor: METIER_COLOR[k] }}
                    />
                    <span className="font-semibold">{METIER_LABEL[k]} (global)</span>
                  </div>
                  {span.visible && (
                    <GanttBar
                      step={s}
                      startCol={span.startCol + 1}
                      endCol={span.endCol + 1}
                      isOverDeadline={overDL}
                      disableShift
                    />
                  )}
                </div>
              );
            })}

          {/* Par objet */}
          {objets.map((obj, idx) => {
            const objSteps = data.result.steps.filter(
              (s) => s.objet_id === obj.objet_id && s.start_date !== "TBD"
            );
            return (
              <div key={obj.id} className="border-b border-border bg-background/20">
                {/* Header objet */}
                <div
                  className="grid items-center border-b border-border/30 py-2"
                  style={{ gridTemplateColumns: gridTemplate }}
                >
                  <div className="flex items-center gap-2 px-3">
                    <div className="flex flex-col gap-0.5">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5"
                        disabled={idx === 0}
                        onClick={() => handleReorder(obj.id, -1)}
                      >
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5"
                        disabled={idx === objets.length - 1}
                        onClick={() => handleReorder(obj.id, 1)}
                      >
                        <ArrowDown className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-foreground">
                        {obj.reference} — {obj.nom}
                      </p>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        {obj.heures_total.toFixed(0)} h
                      </p>
                    </div>
                  </div>
                </div>

                {/* Steps de l'objet */}
                {objSteps.map((s) => {
                  const span = stepSpanInWindow(days, s.start_date, s.span_days);
                  const stepEnd = new Date(s.start_date + "T00:00:00Z");
                  stepEnd.setUTCDate(stepEnd.getUTCDate() + s.span_days - 1);
                  const overDL = stepEnd.toISOString().slice(0, 10) > dateLivraison;
                  const k = METIER_KEY_BY_ID[s.metier_id] ?? "Manut";
                  return (
                    <div
                      key={s.id}
                      className="grid items-center py-1"
                      style={{ gridTemplateColumns: gridTemplate }}
                    >
                      <div className="flex items-center gap-2 px-3 pl-9 text-xs">
                        <span
                          className="inline-block h-2 w-2 rounded-sm"
                          style={{ backgroundColor: METIER_COLOR[k] }}
                        />
                        <span className="text-muted-foreground">{METIER_LABEL[k]}</span>
                      </div>
                      {span.visible && (
                        <GanttBar
                          step={s}
                          startCol={span.startCol + 1}
                          endCol={span.endCol + 1}
                          isOverDeadline={overDL}
                          disableShift
                        />
                      )}
                    </div>
                  );
                })}

                {objSteps.length === 0 && (
                  <div className="px-3 py-2 text-xs italic text-muted-foreground">
                    Aucune étape (heures à 0)
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Heatmap métier */}
      <div>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Charge par métier
        </h3>
        <HeatmapMetier steps={data.result.steps} days={days} />
      </div>

      <div className="flex justify-end">
        <Button onClick={reload} variant="outline" size="sm">
          <RefreshCw className="mr-1 h-3 w-3" /> Recalculer
        </Button>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  valueClassName,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClassName?: string;
}) {
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
