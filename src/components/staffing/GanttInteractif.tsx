// v0.35.2 / Sprint 2.1 — GanttInteractif : composant principal Auto-staffing Fabrication 5XXX
import { useEffect, useMemo, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ArrowUp, ArrowDown, RefreshCw, Calendar, Users, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
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
import type { PlanResult, PlanStep } from "@/lib/staffing/types";
import { METIER_KEY_BY_ID } from "@/lib/staffing/types";

export interface PlanData {
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
  step_overrides: Record<string, { manual_shift: number; manual_pers: boolean }>;
}

export function GanttInteractif({
  planId,
  onDataLoaded,
}: {
  planId: string;
  onDataLoaded?: (d: PlanData) => void;
}) {
  const calculate = useServerFn(calculateStaffingPlan);
  const updateObj = useServerFn(updatePlanObject);
  const updateStep = useServerFn(updatePlanStep);
  const [data, setData] = useState<PlanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyStepId, setBusyStepId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = (await calculate({ data: { planId } })) as PlanData;
      setData(r);
      onDataLoaded?.(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, [calculate, planId, onDataLoaded]);

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
      if (!data || busyStepId) return;
      const ov = data.step_overrides[stepId];
      const newShift = (ov?.manual_shift ?? 0) + delta;
      setBusyStepId(stepId);
      try {
        await updateStep({ data: { id: stepId, manual_shift: newShift } });
        await reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur décalage");
      } finally {
        setBusyStepId(null);
      }
    },
    [data, busyStepId, updateStep, reload]
  );

  const handleResetShift = useCallback(
    async (stepId: string) => {
      if (busyStepId) return;
      setBusyStepId(stepId);
      try {
        await updateStep({ data: { id: stepId, manual_shift: 0 } });
        await reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur reset");
      } finally {
        setBusyStepId(null);
      }
    },
    [busyStepId, updateStep, reload]
  );

  const handleSetPers = useCallback(
    async (stepId: string, pers: number) => {
      if (busyStepId) return;
      setBusyStepId(stepId);
      try {
        await updateStep({ data: { id: stepId, pers, manual_pers: true } });
        await reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur pers");
      } finally {
        setBusyStepId(null);
      }
    },
    [busyStepId, updateStep, reload]
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

  // Helper : récupérer step Bois/Peint d'un objet pour piloter le slider sous le header
  const getObjStepByMetier = (objet_id: string, metier_id: number): PlanStep | undefined =>
    data.result.steps.find(
      (s) => s.objet_id === objet_id && s.metier_id === metier_id && s.start_date !== "TBD"
    );

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
              const ov = data.step_overrides[s.id];
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
                      manualShift={ov?.manual_shift ?? 0}
                      onShift={(d) => handleShift(s.id, d)}
                      onResetShift={() => handleResetShift(s.id)}
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
            const boisStep = getObjStepByMetier(obj.objet_id, 1);
            const peintStep = getObjStepByMetier(obj.objet_id, 3);
            return (
              <div key={obj.id} className="border-b border-border bg-background/20">
                {/* Header objet */}
                <div
                  className="grid items-start border-b border-border/30 py-2"
                  style={{ gridTemplateColumns: gridTemplate }}
                >
                  <div className="flex items-start gap-2 px-3">
                    <div className="flex flex-col gap-0.5 pt-0.5">
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
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <p className="truncate text-sm font-bold text-foreground">
                        {obj.reference} — {obj.nom}
                      </p>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        {obj.heures_total.toFixed(0)} h
                      </p>
                      {/* Sliders Bois / Peint */}
                      {boisStep && (
                        <PersSlider
                          label="Bois"
                          color={METIER_COLOR.Bois}
                          value={boisStep.pers}
                          disabled={busyStepId === boisStep.id}
                          onChange={(v) => handleSetPers(boisStep.id, v)}
                        />
                      )}
                      {peintStep && (
                        <PersSlider
                          label="Peint"
                          color={METIER_COLOR.Peint}
                          value={peintStep.pers}
                          disabled={busyStepId === peintStep.id}
                          onChange={(v) => handleSetPers(peintStep.id, v)}
                        />
                      )}
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
                  const ov = data.step_overrides[s.id];
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
                          manualShift={ov?.manual_shift ?? 0}
                          onShift={(d) => handleShift(s.id, d)}
                          onResetShift={() => handleResetShift(s.id)}
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

function PersSlider({
  label,
  color,
  value,
  disabled,
  onChange,
}: {
  label: string;
  color: string;
  value: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block h-1.5 w-1.5 rounded-sm"
        style={{ backgroundColor: color }}
      />
      <span className="w-10 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <Slider
        className="w-24"
        min={2}
        max={12}
        step={2}
        value={[value]}
        disabled={disabled}
        onValueCommit={(v) => onChange(v[0] ?? value)}
      />
      <span className="w-7 font-mono text-[10px] font-bold tabular-nums">{value}p</span>
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
