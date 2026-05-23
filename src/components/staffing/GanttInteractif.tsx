// v0.35.2 / Sprint 2.1 — GanttInteractif : composant principal Auto-staffing Fabrication 5XXX
// v0.35.x — Pré-vol risque (toast + slider warning + badge inline) avant commit.
// v0.35.x BATCH — sliders + shifts écrivent dans useEditStore (pas de round-trip serveur).
//                 Reorder objet reste save-immédiat (rare, pas de cumul).
import { useEffect, useMemo, useState, useCallback, useImperativeHandle, useRef, forwardRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, RefreshCw, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
// v0.39.2b2.1 — Popover/StatCard/ManutStatCard déplacés vers ./gantt/GanttHeaderRow
import { GanttHeaderRow } from "./gantt/GanttHeaderRow";
// v0.39.2b2.1 Tour 2 — Header dates + steps globaux extraits vers ./gantt/DayGrid
import { DayGrid } from "./gantt/DayGrid";
// v0.39.2b2.1 Tour 3 — Ligne objet + steps interactifs extraits vers ./gantt/ObjetRowInteractif
import { ObjetRowInteractif } from "./gantt/ObjetRowInteractif";
// v0.48 — Bandes grises absences validées au-dessus des objets
import { AbsencesBand } from "./gantt/AbsencesBand";
import {
  calculateStaffingPlan,
  updatePlanObject,
} from "@/server/staffing.functions";
import { useEditStore, applyEdits } from "@/lib/staffing/edit-store";
import { addWorkingDays } from "@/lib/staffing/date-utils";
import {
  workingDaysBetween,
  METIER_LABEL,
} from "./gantt-helpers";
import { BulkPersByMetierBar } from "./BulkPersByMetierBar";
import { ChargeMetierSection } from "./ChargeMetierSection";
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
  manut_summary?: {
    is_absorbed: boolean;
    manut_total_h: number;
    fin_total_h: number;
    absorbable_total_h: number;
    absorbed_bois_h: number;
    absorbed_peint_h: number;
    absorbed_tap_h: number;
    fallback_objets: number;
  };
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
      <div className="space-y-3 py-4" aria-busy="true" aria-label="Chargement du plan">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
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
      {/* Stats cards (extracted v0.39.2b2.1) */}
      <GanttHeaderRow
        stats={stats}
        manutSummary={data.manut_summary}
        dateLivraison={dateLivraison}
      />

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
          {/* Header dates + Steps globaux (Manut FIN + CNC partagée) — extraits Tour 2 */}
          <DayGrid
            ref={gridRef}
            days={days}
            gridTemplate={gridTemplate}
            mergedSteps={mergedSteps}
            dateLivraison={dateLivraison}
            dayWidthPx={dayWidthPx}
            stepOverrides={data.step_overrides}
            edits={edits}
            impactByStep={impactByStep}
            onShift={handleShift}
            onResetShift={handleResetShift}
          />

          {/* v0.48 — Absences validées : bandes grises pour expliquer pourquoi
              certaines personnes ne sont pas staffables ce jour-là */}
          <AbsencesBand days={days} gridTemplate={gridTemplate} />

          {/* Par objet — chaque objet affiche : entête + steps métiers (incl. quote-part BE/Num) */}
          {objets.map((obj, idx) => {
            const objSteps = mergedSteps.filter(
              (s) => s.objet_id === obj.objet_id && s.start_date !== "TBD",
            );
            return (
              <ObjetRowInteractif
                key={obj.id}
                obj={obj}
                idx={idx}
                totalObjets={objets.length}
                isExpanded={expandedObjets.has(obj.id)}
                objSteps={objSteps}
                days={days}
                gridTemplate={gridTemplate}
                dateLivraison={dateLivraison}
                dayWidthPx={dayWidthPx}
                stepOverrides={data.step_overrides}
                edits={edits}
                impactByStep={impactByStep}
                onToggle={toggleObjet}
                onReorder={handleReorder}
                onShiftCascade={handleShiftCascade}
                onResetShift={handleResetShift}
                onSetPers={handleSetPers}
                onSetSpanDemiCascade={handleSetSpanDemiCascade}
                onResetSpanDemi={resetStepSpanDemiStore}
              />
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

GanttInteractif.displayName = "GanttInteractif";


