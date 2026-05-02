// v0.35.2 / Sprint 2.1 — GanttInteractif : composant principal Auto-staffing Fabrication 5XXX
// v0.35.x — Pré-vol risque (toast + slider warning + badge inline) avant commit.
// v0.35.x BATCH — sliders + shifts écrivent dans useEditStore (pas de round-trip serveur).
//                 Reorder objet reste save-immédiat (rare, pas de cumul).
import { useEffect, useMemo, useState, useCallback, useImperativeHandle, useRef, forwardRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ArrowUp, ArrowDown, RefreshCw, Calendar, Users, Activity, AlertTriangle, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  calculateStaffingPlan,
  updatePlanObject,
} from "@/server/staffing.functions";
import { useEditStore, applyEdits } from "@/lib/staffing/edit-store";
import {
  workingDaysBetween,
  formatDayName,
  formatShortDate,
  stepSpanInWindow,
  METIER_COLOR,
  METIER_LABEL,
} from "./gantt-helpers";
import { GanttBar } from "./GanttBar";
import { BulkPersByMetierBar } from "./BulkPersByMetierBar";
import { HeatmapMetier } from "./HeatmapMetier";
import { AlerteBandeau } from "./AlerteBandeau";
import { ResolveCncConflictDialog } from "./ResolveCncConflictDialog";
import { updatePlanDateFinFab } from "@/server/staffing-resolve.functions";
import type { PlanResult, PlanStep, PlanAlert } from "@/lib/staffing/types";
import { METIER_KEY_BY_ID } from "@/lib/staffing/types";
import { simulateStepChange, impactToastMessage, type SliderImpact } from "@/lib/staffing/slider-impact";

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

export interface GanttInteractifHandle {
  reload: () => Promise<void>;
}

export const GanttInteractif = forwardRef<
  GanttInteractifHandle,
  {
    planId: string;
    onDataLoaded?: (d: PlanData) => void;
  }
>(function GanttInteractifInner({ planId, onDataLoaded }, ref) {
  const calculate = useServerFn(calculateStaffingPlan);
  const updateObj = useServerFn(updatePlanObject);
  const [data, setData] = useState<PlanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyStepId, setBusyStepId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Impacts pré-vol par stepId — alimente badge + couleur slider + bandeau bonus */
  const [impactByStep, setImpactByStep] = useState<Record<string, SliderImpact[]>>({});
  const [resolveOpen, setResolveOpen] = useState(false);
  const updateDateFin = useServerFn(updatePlanDateFinFab);
  const initFromPlan = useEditStore((s) => s.initFromPlan);
  const setStepPersStore = useEditStore((s) => s.setStepPers);
  const setStepShiftStore = useEditStore((s) => s.setStepShift);
  const resetStepShiftStore = useEditStore((s) => s.resetStepShift);
  const edits = useEditStore((s) => s.edits);
  const bulkSetPersStore = useEditStore((s) => s.bulkSetPers);

  /** Mesure dynamique de la largeur d'une colonne jour pour drag-to-shift */
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [dayWidthPx, setDayWidthPx] = useState(0);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Charger updated_at du plan en parallèle pour init store
      const [r, planMeta] = await Promise.all([
        calculate({ data: { planId } }) as Promise<PlanData>,
        supabase
          .from("staffing_plan")
          .select("updated_at")
          .eq("id", planId)
          .single(),
      ]);
      setData(r);
      onDataLoaded?.(r);
      if (planMeta.data?.updated_at) {
        initFromPlan(planId, planMeta.data.updated_at as string);
      }
      setImpactByStep({});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, [calculate, planId, onDataLoaded, initFromPlan]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useImperativeHandle(ref, () => ({ reload }), [reload]);

  /** Observe la largeur réelle du header pour calculer dayWidthPx (drag-to-shift) */
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const measure = () => {
      // 1ère colonne = 220px (label objet), reste = jours
      const total = el.getBoundingClientRect().width;
      const dayCount = el.dataset.dayCount ? parseInt(el.dataset.dayCount, 10) : 0;
      if (dayCount > 0) {
        const w = (total - 220) / dayCount;
        setDayWidthPx(w > 0 ? w : 0);
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [data]);

  /** Steps mergés : applique les edits locaux par-dessus les steps serveur */
  const mergedSteps = useMemo(() => {
    if (!data) return [];
    return data.result.steps.map((s) => {
      const e = edits[s.id];
      const baseShift = data.step_overrides[s.id]?.manual_shift ?? 0;
      return applyEdits(s, e, baseShift);
    });
  }, [data, edits]);

  /** daily_load recalculé à partir des steps mergés (pour stats + heatmap + simulate) */
  const mergedDailyLoad = useMemo(() => {
    const out: Record<string, number> = {};
    for (const s of mergedSteps) {
      if (s.start_date === "TBD") continue;
      for (let i = 0; i < s.span_days; i++) {
        const d = new Date(s.start_date + "T00:00:00Z");
        d.setUTCDate(d.getUTCDate() + i);
        const iso = d.toISOString().slice(0, 10);
        out[iso] = (out[iso] ?? 0) + s.pers;
      }
    }
    return out;
  }, [mergedSteps]);

  const days = useMemo(() => {
    if (!data) return [];
    // Étendre la fenêtre si un edit local fait commencer un step AVANT date_debut_fab
    // (réduction pers → span allongé → start avancé). Sans ça, la barre devient invisible.
    let minStart = data.result.date_debut_fab;
    for (const s of mergedSteps) {
      if (s.start_date !== "TBD" && s.start_date < minStart) minStart = s.start_date;
    }
    return workingDaysBetween(minStart, data.result.date_fin_fab);
  }, [data, mergedSteps]);

  const stats = useMemo(() => {
    if (!data) return null;
    let totalH = 0;
    let pic = 0;
    for (const s of mergedSteps) totalH += s.pers * s.h_par_jour * s.span_days;
    for (const v of Object.values(mergedDailyLoad)) if (v > pic) pic = v;
    const hasHard = data.result.alerts.some((a) => a.severity === "hard");
    const hasSoft = data.result.alerts.some((a) => a.severity === "soft");
    const statut = hasHard ? "Critique" : hasSoft ? "Attention" : "Conforme";
    const statutColor = hasHard
      ? "text-destructive"
      : hasSoft
        ? "text-amber-600 dark:text-amber-400"
        : "text-emerald-600 dark:text-emerald-400";
    return { totalH, pic, statut, statutColor };
  }, [data, mergedSteps, mergedDailyLoad]);

  /** Pré-vol : simule l'impact, affiche toast + stocke pour badges (pas de commit serveur) */
  const previewImpacts = useCallback(
    (step: PlanStep, change: { newPers?: number; newShift?: number }) => {
      if (!data) return;
      const impacts = simulateStepChange({
        step,
        newPers: change.newPers,
        newShift: change.newShift,
        allSteps: mergedSteps,
        dailyLoad: mergedDailyLoad,
        dateFinFab: data.result.date_fin_fab,
      });
      if (impacts.length > 0) {
        toast.warning("Modification à risque", {
          description: impactToastMessage(impacts),
          duration: 5000,
        });
        setImpactByStep((prev) => ({ ...prev, [step.id]: impacts }));
      } else {
        setImpactByStep((prev) => {
          if (!(step.id in prev)) return prev;
          const { [step.id]: _, ...rest } = prev;
          return rest;
        });
      }
    },
    [data, mergedSteps, mergedDailyLoad],
  );

  const handleShift = useCallback(
    (step: PlanStep, delta: number) => {
      if (!data) return;
      const baseShift = data.step_overrides[step.id]?.manual_shift ?? 0;
      const currentShift = edits[step.id]?.manual_shift ?? baseShift;
      const newShift = currentShift + delta;
      previewImpacts(step, { newShift: delta });
      setStepShiftStore(step.id, newShift);
    },
    [data, edits, previewImpacts, setStepShiftStore],
  );

  const handleResetShift = useCallback(
    (stepId: string) => {
      resetStepShiftStore(stepId);
      setImpactByStep((prev) => {
        if (!(stepId in prev)) return prev;
        const { [stepId]: _, ...rest } = prev;
        return rest;
      });
    },
    [resetStepShiftStore],
  );

  const handleSetPers = useCallback(
    (step: PlanStep, pers: number) => {
      previewImpacts(step, { newPers: pers });
      setStepPersStore(step.id, pers);
    },
    [previewImpacts, setStepPersStore],
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
        setBusyStepId(objId);
        await Promise.all([
          updateObj({ data: { id: a.id, display_order: b.display_order } }),
          updateObj({ data: { id: b.id, display_order: a.display_order } }),
        ]);
        await reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur reorder");
      } finally {
        setBusyStepId(null);
      }
    },
    [data, updateObj, reload],
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

  // Grid template
  const gridTemplate = `220px repeat(${days.length}, minmax(42px, 1fr))`;

  const getObjStepByMetier = (objet_id: string, metier_id: number): PlanStep | undefined =>
    mergedSteps.find(
      (s) => s.objet_id === objet_id && s.metier_id === metier_id && s.start_date !== "TBD",
    );

  // Bandeau alertes = officielles serveur + pré-vol pending (transient)
  const previewAlerts: PlanAlert[] = Object.entries(impactByStep).flatMap(([stepId, impacts]) =>
    impacts.map((imp) => ({
      code:
        imp.kind === "debord"
          ? "DEBORD_LIVRAISON"
          : imp.kind === "pic"
            ? "PIC_GLOBAL_DEPASSE"
            : "PLAFOND_OBJET_DEPASSE",
      severity: "soft" as const,
      message: `Pré-vol : ${imp.message}`,
      step_id: stepId,
    })),
  );
  const allAlerts = [...data.result.alerts, ...previewAlerts];
  const hasCncConflict = allAlerts.some((a) => a.code === "NUM_CONFLIT_INSOLUBLE");

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

      {/* Alertes (officielles + pré-vol) */}
      <AlerteBandeau alerts={allAlerts} />

      {hasCncConflict && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={() => setResolveOpen(true)}>
            <Wand2 className="mr-1.5 h-3.5 w-3.5" /> Résoudre auto (décaler livraison)
          </Button>
        </div>
      )}

      <ResolveCncConflictDialog
        open={resolveOpen}
        onOpenChange={setResolveOpen}
        planId={planId}
        onApplyNewDateFinFab={async (newDate) => {
          await updateDateFin({ data: { planId, date_fin_fab: newDate } });
          await reload();
        }}
      />

      {/* Bulk pers par métier (P1 #6) */}
      <BulkPersByMetierBar steps={mergedSteps} />

      {/* Gantt */}
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <div className="min-w-[900px]">
          {/* Header dates */}
          <div
            ref={gridRef}
            data-day-count={days.length}
            className="grid border-b border-border bg-background/40"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            <div className="px-3 py-2 text-xs font-bold uppercase tracking-wider">Objet / Étape</div>
            {days.map((d) => (
              <div key={d} className="border-l border-border/40 px-1 py-2 text-center font-mono text-[10px]">
                <div className="text-muted-foreground">{formatDayName(d)}</div>
                <div className="font-semibold">{formatShortDate(d)}</div>
              </div>
            ))}
          </div>

          {/* Steps globaux affaire (Num CNC partagée) — affichés UNE SEULE FOIS au top */}
          {(() => {
            const globalSteps = mergedSteps.filter(
              (s) => s.objet_id === null && s.start_date !== "TBD",
            );
            if (globalSteps.length === 0) return null;
            return (
              <div className="bg-muted/20">
                <div
                  className="grid items-center border-b border-border/30 px-3 py-1"
                  style={{ gridTemplateColumns: gridTemplate }}
                >
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Phase amont — ressource partagée (CNC)
                  </div>
                </div>
                {globalSteps.map((s) => {
                  const span = stepSpanInWindow(days, s.start_date, s.span_days);
                  const stepEnd = new Date(s.start_date + "T00:00:00Z");
                  stepEnd.setUTCDate(stepEnd.getUTCDate() + s.span_days - 1);
                  const overDL = stepEnd.toISOString().slice(0, 10) > dateLivraison;
                  const k = METIER_KEY_BY_ID[s.metier_id] ?? "Manut";
                  const baseShift = data.step_overrides[s.id]?.manual_shift ?? 0;
                  const localShift = edits[s.id]?.manual_shift ?? baseShift;
                  const hasImpact = (impactByStep[s.id]?.length ?? 0) > 0;
                  // Détail heures par objet pour ce métier
                  const totalH =
                    k === "BE"
                      ? objets.reduce((acc, o) => {
                          const f = data.objets.find((x) => x.objet_id === o.objet_id);
                          return acc + (f?.heures_total ?? 0); // approx, pas de breakdown DB
                        }, 0)
                      : 0;
                  void totalH;
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
                        <span className="font-semibold">{METIER_LABEL[k]}</span>
                        <span className="text-[10px] text-muted-foreground">
                          tous objets · {s.pers}p × {s.h_par_jour}h
                        </span>
                        {hasImpact && <ImpactBadge impacts={impactByStep[s.id]!} />}
                      </div>
                      {span.visible && (
                        <GanttBar
                          step={s}
                          startCol={span.startCol + 1}
                          endCol={span.endCol + 1}
                          dayWidthPx={dayWidthPx}
                          isOverDeadline={overDL}
                          manualShift={localShift}
                          hasWarning={hasImpact}
                          hasLocalEdit={
                            edits[s.id]?.pers !== undefined ||
                            edits[s.id]?.manual_shift !== undefined
                          }
                          onShift={(d) => handleShift(s, d)}
                          onResetShift={() => handleResetShift(s.id)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Par objet — chaque objet affiche : entête + steps métiers (incl. quote-part BE/Num) */}
          {objets.map((obj, idx) => {
            const objSteps = mergedSteps.filter(
              (s) => s.objet_id === obj.objet_id && s.start_date !== "TBD",
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
                      {boisStep && (
                        <PersSlider
                          label="Bois"
                          color={METIER_COLOR.Bois}
                          value={boisStep.pers}
                          disabled={false}
                          impacts={impactByStep[boisStep.id]}
                          onChange={(v) => handleSetPers(boisStep, v)}
                        />
                      )}
                      {peintStep && (
                        <PersSlider
                          label="Peint"
                          color={METIER_COLOR.Peint}
                          value={peintStep.pers}
                          disabled={false}
                          impacts={impactByStep[peintStep.id]}
                          onChange={(v) => handleSetPers(peintStep, v)}
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
                  const baseShift = data.step_overrides[s.id]?.manual_shift ?? 0;
                  const localShift = edits[s.id]?.manual_shift ?? baseShift;
                  const hasImpact = (impactByStep[s.id]?.length ?? 0) > 0;
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
                        {hasImpact && <ImpactBadge impacts={impactByStep[s.id]!} />}
                      </div>
                      {span.visible && (
                        <GanttBar
                          step={s}
                          startCol={span.startCol + 1}
                          endCol={span.endCol + 1}
                          dayWidthPx={dayWidthPx}
                          isOverDeadline={overDL}
                          manualShift={localShift}
                          hasWarning={hasImpact}
                          hasLocalEdit={
                            edits[s.id]?.pers !== undefined ||
                            edits[s.id]?.manual_shift !== undefined
                          }
                          onShift={(d) => handleShift(s, d)}
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
        <HeatmapMetier steps={mergedSteps} days={days} />
      </div>

      <div className="flex justify-end">
        <Button onClick={reload} variant="outline" size="sm">
          <RefreshCw className="mr-1 h-3 w-3" /> Recalculer
        </Button>
      </div>
    </div>
  );
});

GanttInteractif.displayName = "GanttInteractif";

function ImpactBadge({ impacts }: { impacts: SliderImpact[] }) {
  const labels = impacts.map((i) =>
    i.kind === "debord" ? "Débord" : i.kind === "pic" ? "Pic" : "Volume",
  );
  return (
    <Badge
      variant="outline"
      className="border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400 px-1.5 py-0 text-[9px] font-bold"
      title={impacts.map((i) => i.message).join("\n")}
    >
      <AlertTriangle className="mr-0.5 h-2.5 w-2.5" />
      {labels.join(" · ")}
    </Badge>
  );
}

function PersSlider({
  label,
  color,
  value,
  disabled,
  impacts,
  onChange,
}: {
  label: string;
  color: string;
  value: number;
  disabled?: boolean;
  impacts?: SliderImpact[];
  onChange: (v: number) => void;
}) {
  const hasWarn = (impacts?.length ?? 0) > 0;
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block h-1.5 w-1.5 rounded-sm"
        style={{ backgroundColor: color }}
      />
      <span
        className={`w-10 text-[10px] uppercase tracking-wider ${
          hasWarn ? "text-amber-600 dark:text-amber-400 font-bold" : "text-muted-foreground"
        }`}
      >
        {label}
      </span>
      <Slider
        className={`w-24 ${hasWarn ? "[&_[data-orientation=horizontal]>span:first-child]:bg-amber-500/30 [&_[role=slider]]:border-amber-500 [&_[role=slider]]:ring-2 [&_[role=slider]]:ring-amber-500/40" : ""}`}
        min={2}
        max={12}
        step={2}
        value={[value]}
        disabled={disabled}
        onValueCommit={(v) => onChange(v[0] ?? value)}
      />
      <span
        className={`w-7 font-mono text-[10px] font-bold tabular-nums ${
          hasWarn ? "text-amber-600 dark:text-amber-400" : ""
        }`}
      >
        {value}p
      </span>
      {hasWarn && <AlertTriangle className="h-3 w-3 text-amber-500" />}
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
