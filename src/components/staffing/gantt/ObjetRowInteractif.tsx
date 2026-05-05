// v0.39.2b2.1 Tour 3 — RowInteractif extrait depuis GanttInteractif.
// Affiche une ligne objet (header + steps) avec tous les contrôles d'édition
// (CellEditPopover, GanttBar, ImpactBadge, ArrowUp/Down reorder).
import { ArrowUp, ArrowDown, AlertTriangle, ChevronRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GanttBar } from "../GanttBar";
import { ObjetRefLabel } from "../ObjetRefLabel";
import { CellEditPopover } from "../CellEditPopover";
import { addWorkingDays } from "@/lib/staffing/date-utils";
import {
  stepSpanInHalves,
  METIER_COLOR,
  METIER_LABEL,
} from "../gantt-helpers";
import { METIER_KEY_BY_ID } from "@/lib/staffing/types";
import type { PlanStep } from "@/lib/staffing/types";
import type { EditEntry } from "@/lib/staffing/edit-store";
import type { SliderImpact } from "@/lib/staffing/slider-impact";

export interface ObjetRowInteractifProps {
  obj: {
    id: string;
    objet_id: string;
    reference: string;
    nom: string;
    heures_total: number;
  };
  idx: number;
  totalObjets: number;
  isExpanded: boolean;
  objSteps: PlanStep[];
  days: string[];
  gridTemplate: string;
  dateLivraison: string;
  dayWidthPx: number;
  stepOverrides: Record<string, { manual_shift: number; manual_pers: boolean }>;
  edits: Record<string, EditEntry>;
  impactByStep: Record<string, SliderImpact[]>;
  onToggle: (id: string) => void;
  onReorder: (id: string, dir: -1 | 1) => void;
  onShiftCascade: (step: PlanStep, delta: number) => void;
  onResetShift: (stepId: string) => void;
  onSetPers: (step: PlanStep, pers: number) => void;
  onSetSpanDemiCascade: (step: PlanStep, spanDemi: number) => void;
  onResetSpanDemi: (stepId: string) => void;
}

export function ObjetRowInteractif({
  obj,
  idx,
  totalObjets,
  isExpanded,
  objSteps,
  days,
  gridTemplate,
  dateLivraison,
  dayWidthPx,
  stepOverrides,
  edits,
  impactByStep,
  onToggle,
  onReorder,
  onShiftCascade,
  onResetShift,
  onSetPers,
  onSetSpanDemiCascade,
  onResetSpanDemi,
}: ObjetRowInteractifProps) {
  return (
    <div className="border-b border-border bg-background/20">
      {/* Header objet — treetable v0.38.4 : chevron + ref/nom + heures + nb étapes */}
      <div
        className="grid items-start border-b border-border/30 py-2"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        <div className="flex items-start gap-2 px-3">
          <button
            type="button"
            onClick={() => onToggle(obj.id)}
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
              onClick={() => onReorder(obj.id, -1)}
            >
              <ArrowUp className="h-3 w-3" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-4 w-4"
              disabled={idx === totalObjets - 1}
              onClick={() => onReorder(obj.id, 1)}
            >
              <ArrowDown className="h-3 w-3" />
            </Button>
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <button
              type="button"
              onClick={() => onToggle(obj.id)}
              className="block w-full truncate text-left text-sm font-bold text-foreground hover:text-primary"
              data-testid="gantt-objet-header-label"
            >
              <ObjetRefLabel reference={obj.reference} nom={obj.nom} size="sm" truncate={false} />
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
        const baseShift = stepOverrides[s.id]?.manual_shift ?? 0;
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
                <CellEditPopover
                  metier={k}
                  pers={s.pers}
                  manualShift={localShift}
                  spanDemi={demi}
                  hasShiftOverride={localShift !== 0}
                  hasDurationOverride={edits[s.id]?.manual_span_demi != null}
                  hasPersWarn={hasImpact}
                  hasPersLocalEdit={
                    edits[s.id]?.pers !== undefined ||
                    edits[s.id]?.manual_shift !== undefined ||
                    edits[s.id]?.manual_span_demi !== undefined
                  }
                  onShift={(d) => onShiftCascade(s, d)}
                  onResetShift={() => onResetShift(s.id)}
                  onSetPers={(v) => onSetPers(s, v)}
                  onSetSpanDemi={(v) => onSetSpanDemiCascade(s, v)}
                  onResetSpanDemi={() => onResetSpanDemi(s.id)}
                  label="Modifier cette étape (cascade aval)"
                >
                  <button
                    type="button"
                    className="inline-flex h-6 items-center gap-1 rounded-md border border-border/60 bg-background px-2 text-[10px] font-semibold hover:bg-muted"
                    data-testid="cell-edit-trigger"
                    title="Modifier dates / durée / nb pers"
                  >
                    {s.pers}p · {demi % 2 === 0 ? `${demi / 2}j` : `${Math.floor(demi / 2)}½j`}
                  </button>
                </CellEditPopover>
                <span className="font-mono text-[10px] font-semibold text-muted-foreground">
                  {Math.round(s.pers * demi * 4)}h
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
                onShift={(d) => onShiftCascade(s, d)}
                onResetShift={() => onResetShift(s.id)}
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
}

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
