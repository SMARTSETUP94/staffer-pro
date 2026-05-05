// v0.39.2b2.1 Tour 2 — Sprint 2b2.1 : extrait depuis GanttInteractif.tsx.
// Responsabilités :
//  1) Header dates AM|PM (grid 220px + 2*days)
//  2) Section "Phases globales chantier" (Manut FIN + ressources partagées CNC)
// Pure presentational : aucun état interne, aucun appel serveur.
// Toute la logique d'édition/cascade reste dans GanttInteractif (Tour 3 sortira RowInteractif).
import { forwardRef } from "react";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { GanttBar } from "../GanttBar";
import {
  formatDayName,
  formatShortDate,
  stepSpanInHalves,
  METIER_COLOR,
  METIER_LABEL,
} from "../gantt-helpers";
import { addWorkingDays } from "@/lib/staffing/date-utils";
import type { PlanStep } from "@/lib/staffing/types";
import { METIER_KEY_BY_ID } from "@/lib/staffing/types";
import type { SliderImpact } from "@/lib/staffing/slider-impact";
import type { PlanData } from "../GanttInteractif";

export interface DayGridProps {
  days: string[];
  gridTemplate: string;
  /** Tous les steps mergés (filtrage `objet_id === null` interne pour les phases globales). */
  mergedSteps: PlanStep[];
  dateLivraison: string;
  dayWidthPx: number;
  stepOverrides: PlanData["step_overrides"];
  edits: Record<string, { pers?: number; manual_shift?: number; manual_span_demi?: number | null }>;
  impactByStep: Record<string, SliderImpact[]>;
  onShift: (step: PlanStep, delta: number) => void;
  onResetShift: (stepId: string) => void;
}

/**
 * DayGrid — Header dates + steps globaux.
 * Le ref est exposé sur le header (utilisé par GanttInteractif pour mesurer dayWidthPx).
 */
export const DayGrid = forwardRef<HTMLDivElement, DayGridProps>(function DayGrid(
  {
    days,
    gridTemplate,
    mergedSteps,
    dateLivraison,
    dayWidthPx,
    stepOverrides,
    edits,
    impactByStep,
    onShift,
    onResetShift,
  },
  ref,
) {
  const globalSteps = mergedSteps.filter(
    (s) => s.objet_id === null && s.start_date !== "TBD",
  );

  return (
    <>
      {/* Header dates */}
      <div
        ref={ref}
        data-day-count={days.length}
        data-testid="day-grid-header"
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

      {/* Steps globaux affaire (Manut FIN + Num CNC partagée) */}
      {globalSteps.length > 0 && (
        <div className="bg-muted/20" data-testid="day-grid-global-steps">
          <div
            className="grid items-center border-b border-border/30 px-3 py-1"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Phases globales chantier — Manutention FIN (50 %) + ressources partagées (CNC)
            </div>
          </div>
          {globalSteps.map((s) => {
            const demi = s.span_demi_jours ?? s.span_days * 2;
            const halfStart = s.start_half_day ?? "AM";
            const span = stepSpanInHalves(days, s.start_date, demi, halfStart);
            const stepEnd = addWorkingDays(s.start_date, Math.max(1, s.span_days) - 1);
            const overDL = stepEnd > dateLivraison;
            const k = METIER_KEY_BY_ID[s.metier_id] ?? "Manut";
            const baseShift = stepOverrides[s.id]?.manual_shift ?? 0;
            const localShift = edits[s.id]?.manual_shift ?? baseShift;
            const hasImpact = (impactByStep[s.id]?.length ?? 0) > 0;
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
                    onShift={(d) => onShift(s, d)}
                    onResetShift={() => onResetShift(s.id)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
});

DayGrid.displayName = "DayGrid";

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
