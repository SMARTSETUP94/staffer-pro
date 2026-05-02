// v0.35.2 / Sprint 2.1 — GanttBar (barre individuelle d'une étape métier)
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { METIER_COLOR } from "./gantt-helpers";
import type { PlanStep } from "@/lib/staffing/types";
import { METIER_KEY_BY_ID } from "@/lib/staffing/types";

interface Props {
  step: PlanStep;
  startCol: number;
  endCol: number;
  isOverDeadline?: boolean;
  manualShift?: number;
  /** Indique un risque pré-vol détecté (toast déjà affiché) — entoure d'un ring orange */
  hasWarning?: boolean;
  onShift?: (delta: number) => void;
  onResetShift?: () => void;
  disableShift?: boolean;
}

export function GanttBar({
  step,
  startCol,
  endCol,
  isOverDeadline,
  manualShift = 0,
  hasWarning,
  onShift,
  onResetShift,
  disableShift,
}: Props) {
  const metierKey = METIER_KEY_BY_ID[step.metier_id] ?? "Manut";
  const bg = isOverDeadline ? "#dc2626" : METIER_COLOR[metierKey];
  const warnRing = hasWarning && !isOverDeadline ? "ring-2 ring-amber-500/80 ring-offset-1 ring-offset-background" : "";
  const shiftLabel = manualShift !== 0 ? `${manualShift > 0 ? "+" : ""}${manualShift}j` : null;
  return (
    <div
      className="group relative flex h-7 items-center rounded-md px-2 text-[11px] font-mono text-white shadow-sm"
      style={{
        gridColumnStart: startCol,
        gridColumnEnd: endCol,
        backgroundColor: bg,
      }}
      title={`${metierKey} · ${step.pers}p × ${step.span_days}j × ${step.h_par_jour}h${shiftLabel ? ` (décalé ${shiftLabel})` : ""}`}
    >
      {onShift && !disableShift && (
        <Button
          size="icon"
          variant="ghost"
          className="h-5 w-5 shrink-0 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white/20"
          onClick={(e) => {
            e.stopPropagation();
            onShift(-1);
          }}
        >
          <ChevronLeft className="h-3 w-3" />
        </Button>
      )}
      <span className="flex-1 truncate text-center">
        {step.pers}p × {step.span_days}j
        {shiftLabel && <span className="ml-1 rounded bg-white/25 px-1 text-[9px] font-bold">{shiftLabel}</span>}
        {isOverDeadline && <span className="ml-1 font-bold">OUT</span>}
      </span>
      {onResetShift && manualShift !== 0 && !disableShift && (
        <Button
          size="icon"
          variant="ghost"
          className="h-5 w-5 shrink-0 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white/20"
          onClick={(e) => {
            e.stopPropagation();
            onResetShift();
          }}
          title="Annuler décalage manuel"
        >
          <X className="h-3 w-3" />
        </Button>
      )}
      {onShift && !disableShift && (
        <Button
          size="icon"
          variant="ghost"
          className="h-5 w-5 shrink-0 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white/20"
          onClick={(e) => {
            e.stopPropagation();
            onShift(1);
          }}
        >
          <ChevronRight className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
