// v0.39.2 — Popover regroupant les contrôles d'édition d'une cellule de planning.
// Composé : DateShifter (décaler), DurationStepper (durée à pers constant), PersStepper (nb pers).
// Mode "Modifier cette étape" — fermable via Escape ou clic extérieur (Popover Radix).
import { ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DateShifter } from "./DateShifter";
import { DurationStepper } from "./DurationStepper";
import { PersStepper } from "./PersStepper";
import type { MetierKey } from "@/lib/staffing/types";

export interface CellEditPopoverProps {
  /** Élément qui ouvre le popover (généralement la barre Gantt ou la cellule treetable). */
  children: ReactNode;
  metier: MetierKey;
  pers: number;
  manualShift: number;
  spanDemi: number;
  hasShiftOverride: boolean;
  hasDurationOverride: boolean;
  hasPersWarn?: boolean;
  hasPersLocalEdit?: boolean;
  disabled?: boolean;
  onShift: (delta: number) => void;
  onResetShift: () => void;
  onSetPers: (pers: number) => void;
  /** Appelé en demi-journées. Cascade aval gérée par le caller (Vue 2). */
  onSetSpanDemi: (spanDemi: number) => void;
  onResetSpanDemi: () => void;
  /** Libellé affiché en haut du popover. */
  label?: string;
}

export function CellEditPopover({
  children,
  metier,
  pers,
  manualShift,
  spanDemi,
  hasShiftOverride,
  hasDurationOverride,
  hasPersWarn,
  hasPersLocalEdit,
  disabled,
  onShift,
  onResetShift,
  onSetPers,
  onSetSpanDemi,
  onResetSpanDemi,
  label = "Modifier cette étape",
}: CellEditPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side="top"
        align="center"
        className="w-auto p-3 space-y-2"
        data-testid="cell-edit-popover"
      >
        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-muted-foreground">Décaler dates</span>
            <DateShifter
              manualShift={manualShift}
              onShift={onShift}
              onReset={hasShiftOverride ? onResetShift : undefined}
              disabled={disabled}
              size="normal"
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-muted-foreground">Durée (heures const.)</span>
            <DurationStepper
              spanDemi={spanDemi}
              hasOverride={hasDurationOverride}
              onChange={onSetSpanDemi}
              onReset={onResetSpanDemi}
              disabled={disabled}
              size="normal"
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-muted-foreground">Nb personnes</span>
            <PersStepper
              value={pers}
              metier={metier}
              hasWarn={hasPersWarn}
              hasLocalEdit={hasPersLocalEdit}
              onChange={onSetPers}
              disabled={disabled}
              size="normal"
            />
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground/80 leading-snug pt-1 border-t border-border/40">
          Allonger la durée diminue le nb pers nécessaire (heures totales constantes).
        </p>
      </PopoverContent>
    </Popover>
  );
}
