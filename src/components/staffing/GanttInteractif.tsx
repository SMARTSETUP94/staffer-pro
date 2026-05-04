// v0.35.2 / Sprint 2.1 — GanttInteractif : composant principal Auto-staffing Fabrication 5XXX
// v0.35.x — Pré-vol risque (toast + slider warning + badge inline) avant commit.
// v0.35.x BATCH — sliders + shifts écrivent dans useEditStore (pas de round-trip serveur).
//                 Reorder objet reste save-immédiat (rare, pas de cumul).
import { useEffect, useMemo, useState, useCallback, useImperativeHandle, useRef, forwardRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ArrowUp, ArrowDown, RefreshCw, Calendar, Users, Activity, AlertTriangle, Wand2, ChevronRight, ChevronDown, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
// v0.39.0 — Slider supprimé : remplacé par PersStepper inline.
import { Badge } from "@/components/ui/badge";
import {
  calculateStaffingPlan,
  updatePlanObject,
} from "@/server/staffing.functions";
import { useEditStore, applyEdits } from "@/lib/staffing/edit-store";
import { addWorkingDays } from "@/lib/staffing/date-utils";
import {
  workingDaysBetween,
  formatDayName,
  formatShortDate,
  stepSpanInHalves,
  METIER_COLOR,
  METIER_LABEL,
} from "./gantt-helpers";
import { GanttBar } from "./GanttBar";
import { BulkPersByMetierBar } from "./BulkPersByMetierBar";
import { ChargeMetierSection } from "./ChargeMetierSection";
import { PersStepper } from "./PersStepper";
import { DateShifter } from "./DateShifter";
import { CellEditPopover } from "./CellEditPopover";
import {
  computeCascadeForDurationChange,
  computeCascadeForShift,
} from "@/lib/staffing/cascade-aval";
import type { ChantierMetierConfigRow } from "@/server/staffing-pre-parametrage.functions";
import { AlerteBandeau } from "./AlerteBandeau";
import { ResolveCncConflictDialog } from "./ResolveCncConflictDialog";
import { updatePlanDateFinFab } from "@/server/staffing-resolve.functions";
import type { PlanResult, PlanStep, PlanAlert } from "@/lib/staffing/types";
import { METIER_KEY_BY_ID, H_HALF, DEMI_PER_DAY } from "@/lib/staffing/types";
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
    /** v0.36 — configs pré-paramétrage pour heatmap cible vs réel. */
    preParamConfigs?: ChantierMetierConfigRow[];
  }
>(function GanttInteractifInner({ planId, onDataLoaded, preParamConfigs }, ref) {
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
  const setStepSpanDemiStore = useEditStore((s) => s.setStepSpanDemi);
  const resetStepSpanDemiStore = useEditStore((s) => s.resetStepSpanDemi);
  const edits = useEditStore((s) => s.edits);

  /** v0.38.4 — Treetable expand/collapse par objet (persist localStorage) */
  const expandedKey = `objet-expanded-${planId}`;
  const [expandedObjets, setExpandedObjets] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem(expandedKey);
      if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch {
      /* noop */
    }
    return new Set();
  });
  const [expandedInit, setExpandedInit] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(expandedKey, JSON.stringify([...expandedObjets]));
    } catch {
      /* noop */
    }
  }, [expandedObjets, expandedKey]);
  const toggleObjet = useCallback((objId: string) => {
    setExpandedObjets((prev) => {
      const next = new Set(prev);
      if (next.has(objId)) next.delete(objId);
      else next.add(objId);
      return next;
    });
  }, []);

  /** Mesure dynamique de la largeur d'une colonne jour pour drag-to-shift */
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [dayWidthPx, setDayWidthPx] = useState(0);
  /** Ref miroir de data pour pouvoir tester "déjà chargé" sans re-render */
  const dataRef = useRef<PlanData | null>(null);
  useEffect(() => { dataRef.current = data; }, [data]);

  /** Ref miroir du callback onDataLoaded pour éviter de recréer reload à chaque
   * render parent (sinon useEffect [reload] re-fire en boucle infinie). */
  const onDataLoadedRef = useRef(onDataLoaded);
  useEffect(() => { onDataLoadedRef.current = onDataLoaded; }, [onDataLoaded]);

  const reload = useCallback(async () => {
    // v0.35.x — Préserve scroll + pas de spinner plein écran si data déjà là
    // (sinon l'unmount reset la position et l'utilisateur perd son repère).
    const hasData = dataRef.current !== null;
    const scrollY = typeof window !== "undefined" ? window.scrollY : 0;
    if (!hasData) setLoading(true);
    setError(null);
    try {
      // v0.39.0a BUG B — calculate() bumpe staffing_plan.updated_at côté serveur.
      // On DOIT lire updated_at APRÈS la fin de calculate, sinon baseUpdatedAt
      // est stale et le prochain flush déclenche un faux conflit "0 modif en attente".
      const r = (await calculate({ data: { planId } })) as PlanData;
      const planMeta = await supabase
        .from("staffing_plan")
        .select("updated_at")
        .eq("id", planId)
        .single();
      setData(r);
      onDataLoadedRef.current?.(r);
      if (planMeta.data?.updated_at) {
        initFromPlan(planId, planMeta.data.updated_at as string);
      }
      setImpactByStep({});
      // Restaure scroll après render (silent reload)
      if (hasData && typeof window !== "undefined") {
        requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: "auto" }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, [calculate, planId, initFromPlan]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** v0.38.4 — Auto-expand objets > 100h au premier chargement (si rien en localStorage) */
  useEffect(() => {
    if (!data || expandedInit) return;
    setExpandedInit(true);
    if (typeof window !== "undefined") {
      const raw = window.localStorage.getItem(expandedKey);
      if (raw && raw !== "[]") return; // état utilisateur déjà persisté
    }
    const big = new Set(
      data.objets.filter((o) => o.heures_total > 100).map((o) => o.id),
    );
    if (big.size > 0) setExpandedObjets(big);
  }, [data, expandedInit, expandedKey]);

  useImperativeHandle(ref, () => ({ reload }), [reload]);

  /** Observe la largeur réelle du header pour calculer dayWidthPx (drag-to-shift) */
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const measure = () => {
      // 1ère colonne = 220px (label objet), reste = 2*jours demi-journées
      const total = el.getBoundingClientRect().width;
      const dayCount = el.dataset.dayCount ? parseInt(el.dataset.dayCount, 10) : 0;
      if (dayCount > 0) {
        const w = (total - 220) / dayCount; // largeur d'un jour plein (= 2 demi-journées)
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
    // v0.39.0a BUG A — Étendre la fenêtre des deux côtés si un edit local décale un
    // step AVANT date_debut_fab (réduction pers / shift -) OU APRÈS date_fin_fab
    // (shift + qui pousse la fin au-delà). Sans extension à droite, stepSpanInHalves
    // clampe endCol → la barre paraît raccourcie au lieu d'être décalée.
    let minStart = data.result.date_debut_fab;
    let maxEnd = data.result.date_fin_fab;
    for (const s of mergedSteps) {
      if (s.start_date === "TBD") continue;
      if (s.start_date < minStart) minStart = s.start_date;
      const endISO = addWorkingDays(s.start_date, Math.max(1, s.span_days) - 1);
      if (endISO > maxEnd) maxEnd = endISO;
    }
    return workingDaysBetween(minStart, maxEnd);
  }, [data, mergedSteps]);

  const stats = useMemo(() => {
    if (!data) return null;
    let totalH = 0;
    let pic = 0;
    // v0.39.0b FIX — formule demi-journée (cohérente avec VolumeCard) :
    // pers × span_demi_jours × H_HALF (4h). L'ancienne `pers × 8 × span_days`
    // surévaluait car span_days = ceil(demi/2) (ex: 5 demi → 3j → 24h ≠ 20h).
    const breakdownByMetier: Record<string, { label: string; h: number; persDemi: number; steps: number }> = {};
    for (const s of mergedSteps) {
      const demi = s.span_demi_jours ?? s.span_days * DEMI_PER_DAY;
      const h = s.pers * demi * H_HALF;
      totalH += h;
      const key = METIER_KEY_BY_ID[s.metier_id] ?? `m${s.metier_id}`;
      const label = METIER_LABEL[key as keyof typeof METIER_LABEL] ?? key;
      if (!breakdownByMetier[key]) breakdownByMetier[key] = { label, h: 0, persDemi: 0, steps: 0 };
      breakdownByMetier[key].h += h;
      breakdownByMetier[key].persDemi += s.pers * demi;
      breakdownByMetier[key].steps += 1;
    }
    for (const v of Object.values(mergedDailyLoad)) if (v > pic) pic = v;
    // v0.39.0d FIX — "h devis" = somme des heures des OBJETS inclus dans CE plan
    // (et non toutes les heures du devis de l'affaire). Permet de comparer
    // h staffées vs h devis sur le périmètre réellement mis au planning.
    const hDevis = (data.objets ?? [])
      .filter((o) => o.included)
      .reduce((acc, o) => acc + (Number(o.heures_total) || 0), 0);
    const hasHard = data.result.alerts.some((a) => a.severity === "hard");
    const hasSoft = data.result.alerts.some((a) => a.severity === "soft");
    const statut = hasHard ? "Critique" : hasSoft ? "Attention" : "Conforme";
    const statutColor = hasHard
      ? "text-destructive"
      : hasSoft
        ? "text-amber-600 dark:text-amber-400"
        : "text-emerald-600 dark:text-emerald-400";
    const breakdown = Object.values(breakdownByMetier).sort((a, b) => b.h - a.h);
    return { totalH, pic, statut, statutColor, hDevis, breakdown };
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

  /**
   * v0.39.2 — Vue 2 : modifier la durée d'une étape avec cascade AVAL
   * (les étapes du même objet qui suivent sont décalées du même delta).
   * À pers constant : heures totales préservées (algo applyEdits côté serveur).
   */
  const handleSetSpanDemiCascade = useCallback(
    (step: PlanStep, newSpanDemi: number) => {
      const oldSpanDemi = step.span_demi_jours ?? step.span_days * 2;
      if (newSpanDemi === oldSpanDemi) return;
      const oldSpanDays = Math.max(1, Math.ceil(oldSpanDemi / 2));
      const newSpanDays = Math.max(1, Math.ceil(newSpanDemi / 2));
      setStepSpanDemiStore(step.id, newSpanDemi);
      // Cascade aval : décaler les steps suivants du MÊME objet du delta jours
      const cascade = computeCascadeForDurationChange(mergedSteps, step, oldSpanDays, newSpanDays);
      for (const c of cascade) {
        const baseShift = data?.step_overrides[c.stepId]?.manual_shift ?? 0;
        const currentShift = edits[c.stepId]?.manual_shift ?? baseShift;
        setStepShiftStore(c.stepId, currentShift + c.deltaDays);
      }
    },
    [mergedSteps, data, edits, setStepSpanDemiStore, setStepShiftStore],
  );

  /**
   * v0.39.2 — Vue 2 : décaler une étape avec cascade AVAL (les étapes suivantes
   * du même objet suivent le mouvement, l'amont reste collé).
   */
  const handleShiftCascade = useCallback(
    (step: PlanStep, delta: number) => {
      handleShift(step, delta);
      const cascade = computeCascadeForShift(mergedSteps, step, delta);
      for (const c of cascade) {
        const baseShift = data?.step_overrides[c.stepId]?.manual_shift ?? 0;
        const currentShift = edits[c.stepId]?.manual_shift ?? baseShift;
        setStepShiftStore(c.stepId, currentShift + c.deltaDays);
      }
    },
    [handleShift, mergedSteps, data, edits, setStepShiftStore],
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

  // v0.38.1b — Grid 2 colonnes par jour (AM | PM)
  const gridTemplate = `220px repeat(${days.length * 2}, minmax(22px, 1fr))`;

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
  // v0.39.0c — Garde-fou volume : alerte si |écart| ≥ 5% (soft) ou ≥ 15% (hard)
  const volumeAlerts: PlanAlert[] = [];
  if (stats.hDevis > 0) {
    const ecart = stats.totalH - stats.hDevis;
    const ratio = ecart / stats.hDevis;
    const absPct = Math.abs(ratio) * 100;
    if (absPct >= 5) {
      const sign = ecart >= 0 ? "+" : "";
      volumeAlerts.push({
        code: "VOLUME_ECART_DEVIS",
        severity: absPct >= 15 ? "hard" : "soft",
        message: `Écart volume vs devis : ${sign}${ecart.toFixed(0)} h (${sign}${(ratio * 100).toFixed(1)}%) — staffé ${stats.totalH.toFixed(0)} h / devis ${stats.hDevis.toFixed(0)} h`,
      });
    }
  }
  const allAlerts = [...data.result.alerts, ...previewAlerts, ...volumeAlerts];
  const hasCncConflict = allAlerts.some((a) => a.code === "NUM_CONFLIT_INSOLUBLE");

  return (
    <div className="space-y-4">
      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          icon={<Activity className="h-4 w-4" />}
          label="Heures staffées"
          value={
            stats.hDevis > 0
              ? `${stats.totalH.toFixed(0)} h / ${stats.hDevis.toFixed(0)} h devis`
              : `${stats.totalH.toFixed(0)} h`
          }
          badge={
            stats.hDevis > 0
              ? (() => {
                  const pct = ((stats.totalH - stats.hDevis) / stats.hDevis) * 100;
                  const abs = Math.abs(pct);
                  if (abs < 5) return null;
                  const sign = pct >= 0 ? "+" : "";
                  return {
                    label: `${sign}${pct.toFixed(1)}%`,
                    severity: abs >= 15 ? ("hard" as const) : ("soft" as const),
                  };
                })()
              : null
          }
          valueClassName={
            stats.hDevis > 0 && Math.abs((stats.totalH - stats.hDevis) / stats.hDevis) > 0.15
              ? "text-destructive"
              : stats.hDevis > 0 && Math.abs((stats.totalH - stats.hDevis) / stats.hDevis) > 0.05
                ? "text-amber-600 dark:text-amber-400"
                : "text-foreground"
          }
          detail={
            <div className="space-y-3 text-xs">
              <div>
                <div className="font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  Formule
                </div>
                <p className="text-foreground">
                  <span className="font-mono">heures = Σ (pers × ½‑journées × 4 h)</span>
                </p>
                <p className="text-muted-foreground mt-1">
                  Une demi‑journée = {H_HALF} h. Une journée = {DEMI_PER_DAY} demi‑journées.
                  Le total agrège toutes les étapes (tous métiers, tous objets) du plan courant.
                </p>
              </div>
              <div>
                <div className="font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  Décomposition par métier
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="font-medium pb-1">Métier</th>
                      <th className="font-medium pb-1 text-right">Étapes</th>
                      <th className="font-medium pb-1 text-right">pers·½j</th>
                      <th className="font-medium pb-1 text-right">Heures</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.breakdown.map((b) => (
                      <tr key={b.label} className="border-t border-border/50">
                        <td className="py-1">{b.label}</td>
                        <td className="py-1 text-right tabular-nums">{b.steps}</td>
                        <td className="py-1 text-right tabular-nums">{b.persDemi.toFixed(0)}</td>
                        <td className="py-1 text-right tabular-nums font-medium">
                          {b.h.toFixed(0)} h
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t border-border font-bold">
                      <td className="py-1">Total</td>
                      <td className="py-1 text-right tabular-nums">
                        {stats.breakdown.reduce((a, b) => a + b.steps, 0)}
                      </td>
                      <td className="py-1 text-right tabular-nums">
                        {stats.breakdown.reduce((a, b) => a + b.persDemi, 0).toFixed(0)}
                      </td>
                      <td className="py-1 text-right tabular-nums">
                        {stats.totalH.toFixed(0)} h
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {stats.hDevis > 0 && (
                <div className="pt-2 border-t border-border">
                  <div className="font-bold uppercase tracking-wider text-muted-foreground mb-1">
                    Comparaison devis (objets du plan)
                  </div>
                  <p className="text-muted-foreground">
                    Devis (objets inclus) :{" "}
                    <span className="font-medium text-foreground">{stats.hDevis.toFixed(0)} h</span>
                    {" · "}Écart :{" "}
                    <span className="font-medium text-foreground">
                      {(stats.totalH - stats.hDevis >= 0 ? "+" : "")}
                      {(stats.totalH - stats.hDevis).toFixed(0)} h
                      {" ("}
                      {(((stats.totalH - stats.hDevis) / stats.hDevis) * 100).toFixed(1)}%{")"}
                    </span>
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Heures devis = Σ heures prévues des objets fabrication inclus dans ce plan
                    (BE + Num + Bois + Métal + Peinture + Tap + Manut). Exclut les objets non
                    cochés et les objets non rattachés à ce plan.
                  </p>
                </div>
              )}
            </div>
          }
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

      {/* v0.39.0 — Section Charge par métier ÉDITABLE (stepper + chevrons date) */}
      <ChargeMetierSection
        planId={planId}
        steps={mergedSteps}
        days={days}
        objets={data.objets.map((o) => ({ objet_id: o.objet_id, reference: o.reference, nom: o.nom }))}
        preParamConfigs={preParamConfigs}
        editable
        getStepCtx={(objet_id, metierKey) => {
          const metierIdEntry = Object.entries(METIER_KEY_BY_ID).find(([, k]) => k === metierKey);
          if (!metierIdEntry) return null;
          const metier_id = Number(metierIdEntry[0]);
          const step = mergedSteps.find(
            (s) => s.objet_id === objet_id && s.metier_id === metier_id && s.start_date !== "TBD",
          );
          if (!step) return null;
          const baseShift = data.step_overrides[step.id]?.manual_shift ?? 0;
          const localShift = edits[step.id]?.manual_shift ?? baseShift;
          return {
            step,
            manualShift: localShift,
            hasLocalEdit:
              edits[step.id]?.pers !== undefined ||
              edits[step.id]?.manual_shift !== undefined,
            hasWarn: (impactByStep[step.id]?.length ?? 0) > 0,
          };
        }}
        onSetPers={(step, pers) => handleSetPers(step, pers)}
        onShift={(step, delta) => handleShift(step, delta)}
        onResetShift={(stepId) => handleResetShift(stepId)}
      />

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
              <div key={d} className="contents">
                <div className="border-l border-border/60 px-0.5 pt-2 pb-0.5 text-center font-mono text-[10px]">
                  <div className="text-muted-foreground">{formatDayName(d)}</div>
                  <div className="font-semibold">{formatShortDate(d)}</div>
                  <div className="mt-0.5 text-[8px] font-bold text-muted-foreground/70">AM</div>
                </div>
                <div className="border-l border-border/20 px-0.5 pt-2 pb-0.5 text-center font-mono text-[10px]">
                  <div className="text-muted-foreground opacity-0">.</div>
                  <div className="opacity-0">.</div>
                  <div className="mt-0.5 text-[8px] font-bold text-muted-foreground/70">PM</div>
                </div>
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
                  const demi = s.span_demi_jours ?? s.span_days * 2;
                  const halfStart = s.start_half_day ?? "AM";
                  const span = stepSpanInHalves(days, s.start_date, demi, halfStart);
                  const stepEnd = addWorkingDays(s.start_date, Math.max(1, s.span_days) - 1);
                  const overDL = stepEnd > dateLivraison;
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
                        <span className="ml-auto font-mono text-[10px] font-semibold text-muted-foreground">
                          {Math.round(s.pers * (s.span_demi_jours ?? s.span_days * 2) * 4)}h
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
            const isExpanded = expandedObjets.has(obj.id);
            return (
              <div key={obj.id} className="border-b border-border bg-background/20">
                {/* Header objet — treetable v0.38.4 : chevron + ref/nom + heures + nb étapes */}
                <div
                  className="grid items-start border-b border-border/30 py-2"
                  style={{ gridTemplateColumns: gridTemplate }}
                >
                  <div className="flex items-start gap-2 px-3">
                    <button
                      type="button"
                      onClick={() => toggleObjet(obj.id)}
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-muted/60"
                      aria-label={isExpanded ? "Replier" : "Déplier"}
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <div className="flex flex-col gap-0.5 pt-0.5">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-4 w-4"
                        disabled={idx === 0}
                        onClick={() => handleReorder(obj.id, -1)}
                      >
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-4 w-4"
                        disabled={idx === objets.length - 1}
                        onClick={() => handleReorder(obj.id, 1)}
                      >
                        <ArrowDown className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <button
                        type="button"
                        onClick={() => toggleObjet(obj.id)}
                        className="block w-full truncate text-left text-sm font-bold text-foreground hover:text-primary"
                      >
                        {obj.reference} — {obj.nom}
                      </button>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        {obj.heures_total.toFixed(0)} h · {objSteps.length} étape
                        {objSteps.length > 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Steps de l'objet — visibles uniquement si expanded (treetable v0.38.4) */}
                {isExpanded && objSteps.map((s) => {
                  const demi = s.span_demi_jours ?? s.span_days * 2;
                  const halfStart = s.start_half_day ?? "AM";
                  const span = stepSpanInHalves(days, s.start_date, demi, halfStart);
                  const stepEnd = addWorkingDays(s.start_date, Math.max(1, s.span_days) - 1);
                  const overDL = stepEnd > dateLivraison;
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
                      <div className="flex items-center gap-2 px-3 pl-12 text-xs">
                        <span className="inline-block h-3 w-px self-stretch bg-border" />
                        <span
                          className="inline-block h-2 w-2 rounded-sm"
                          style={{ backgroundColor: METIER_COLOR[k] }}
                        />
                        <span className="text-muted-foreground">{METIER_LABEL[k]}</span>
                        <span className="ml-auto flex items-center gap-1.5">
                          <PersStepper
                            value={s.pers}
                            metier={k}
                            hasWarn={hasImpact}
                            hasLocalEdit={
                              edits[s.id]?.pers !== undefined ||
                              edits[s.id]?.manual_shift !== undefined
                            }
                            onChange={(v) => handleSetPers(s, v)}
                          />
                          <DateShifter
                            manualShift={localShift}
                            onShift={(d) => handleShift(s, d)}
                            onReset={() => handleResetShift(s.id)}
                          />
                          <span className="font-mono text-[10px] font-semibold text-muted-foreground">
                            {Math.round(s.pers * (s.span_demi_jours ?? s.span_days * 2) * 4)}h
                          </span>
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
                            edits[s.id]?.manual_shift !== undefined ||
                            edits[s.id]?.manual_span_demi !== undefined
                          }
                          onShift={(d) => handleShiftCascade(s, d)}
                          onResetShift={() => handleResetShift(s.id)}
                        />
                      )}
                    </div>
                  );
                })}

                {isExpanded && objSteps.length === 0 && (
                  <div className="px-3 py-2 pl-12 text-xs italic text-muted-foreground">
                    Aucune étape (heures à 0)
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={reload} variant="outline" size="sm">
          <RefreshCw className="mr-1 h-3 w-3" /> Recalculer
        </Button>
      </div>
    </div>
  );
});

/** "12-15/05" : plage compacte du step (calendar days, dd-dd/MM ; dd/MM-dd/MM si mois différents) */
function stepDateRangeShort(startISO: string, spanDays: number): string {
  if (!startISO || startISO === "TBD" || spanDays <= 0) return "";
  const s = new Date(startISO + "T00:00:00Z");
  const e = new Date(s);
  e.setUTCDate(e.getUTCDate() + spanDays - 1);
  const dd = (d: Date) => String(d.getUTCDate()).padStart(2, "0");
  const mm = (d: Date) => String(d.getUTCMonth() + 1).padStart(2, "0");
  if (s.getUTCMonth() === e.getUTCMonth()) {
    return `${dd(s)}–${dd(e)}/${mm(s)}`;
  }
  return `${dd(s)}/${mm(s)}–${dd(e)}/${mm(e)}`;
}

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


function StatCard({
  icon,
  label,
  value,
  valueClassName,
  detail,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClassName?: string;
  detail?: React.ReactNode;
  badge?: { label: string; severity: "hard" | "soft" } | null;
}) {
  const badgeCls =
    badge?.severity === "hard"
      ? "bg-destructive/15 text-destructive border-destructive/30"
      : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
  const card = (
    <div
      className={`rounded-2xl border border-border bg-card p-4 ${detail ? "cursor-help transition hover:border-primary/40 hover:shadow-sm" : ""}`}
    >
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
        {detail && <Info className="ml-auto h-3.5 w-3.5 opacity-60" />}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <p className={`text-2xl font-bold ${valueClassName ?? "text-foreground"}`}>{value}</p>
        {badge && (
          <span
            className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${badgeCls}`}
            aria-label={`Écart vs devis ${badge.label}`}
          >
            {badge.label}
          </span>
        )}
      </div>
    </div>
  );
  if (!detail) return card;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="text-left">
          {card}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[420px] max-w-[92vw]">
        {detail}
      </PopoverContent>
    </Popover>
  );
}
