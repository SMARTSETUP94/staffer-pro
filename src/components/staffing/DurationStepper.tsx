// v0.39.2 — Stepper +/- 1 jour pour modifier la durée d'un step (à pers constant).
// Écrit dans useEditStore.setStepSpanDemi (manual_span_demi en demi-journées).
import { Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  /** Durée actuelle en demi-journées (effective = override ou serveur). */
  spanDemi: number;
  /** True si une override locale est active (manual_span_demi != null). */
  hasOverride?: boolean;
  disabled?: boolean;
  /** Reçoit la nouvelle valeur en DEMI-JOURNÉES. */
  onChange: (spanDemi: number) => void;
  onReset?: () => void;
  size?: "compact" | "normal";
  /** Pas en demi-journées (2 = 1j entier, 1 = ½j). Défaut 2. */
  step?: number;
  min?: number;
  max?: number;
}

export function DurationStepper({
  spanDemi,
  hasOverride,
  disabled,
  onChange,
  onReset,
  size = "compact",
  step = 2,
  min = 1,
  max = 200,
}: Props) {
  const btn = size === "compact" ? "h-5 w-5" : "h-6 w-6";
  const dec = () => onChange(Math.max(min, spanDemi - step));
  const inc = () => onChange(Math.min(max, spanDemi + step));
  const fullDays = Math.floor(spanDemi / 2);
  const halfDay = spanDemi % 2;
  const label = halfDay ? `${fullDays}½j` : `${fullDays}j`;
  return (
    <div
      className={`inline-flex items-center gap-0.5 rounded-md border border-border/60 bg-background px-0.5 py-0.5 ${
        hasOverride ? "border-amber-500/60 outline-dashed outline-1 outline-amber-500/60" : ""
      }`}
      data-testid="duration-stepper"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={`${btn} shrink-0 hover:bg-muted`}
        onClick={dec}
        disabled={disabled || spanDemi <= min}
        aria-label="Réduire durée -1j"
        title="-1j (à pers constant)"
      >
        <Minus className="h-3 w-3" />
      </Button>
      <span
        className={`min-w-[28px] text-center font-mono text-[10px] font-bold tabular-nums ${
          hasOverride ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"
        }`}
      >
        {label}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={`${btn} shrink-0 hover:bg-muted`}
        onClick={inc}
        disabled={disabled || spanDemi >= max}
        aria-label="Allonger durée +1j"
        title="+1j (à pers constant — heures totales préservées)"
      >
        <Plus className="h-3 w-3" />
      </Button>
      {onReset && hasOverride && !disabled && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={`${btn} shrink-0 hover:bg-muted`}
          onClick={onReset}
          aria-label="Annuler override durée"
          title="Annuler override durée (retour calcul auto)"
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
