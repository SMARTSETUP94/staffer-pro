// v0.39.0 — Stepper inline +/- compact pour éditer le nb de personnes (pers)
// sur les sous-lignes objet (Vue 1) et étape (Vue 2). Respecte les binômes
// (step 2 pour Bois/Peint/Tap/Manut). Source unique : useEditStore.
import { Minus, Plus, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MetierKey } from "@/lib/staffing/types";

const BINOME_METIERS: MetierKey[] = ["Bois", "Peint", "Tap", "Manut"];

interface Props {
  value: number;
  metier: MetierKey;
  min?: number;
  max?: number;
  hasWarn?: boolean;
  hasLocalEdit?: boolean;
  disabled?: boolean;
  onChange: (v: number) => void;
  /** Compact = ~64px (treetable cellule), normal = ~80px (header objet) */
  size?: "compact" | "normal";
}

export function PersStepper({
  value,
  metier,
  min,
  max = 12,
  hasWarn,
  hasLocalEdit,
  disabled,
  onChange,
  size = "compact",
}: Props) {
  const step = BINOME_METIERS.includes(metier) ? 2 : 1;
  const lo = min ?? step;
  const dec = () => onChange(Math.max(lo, value - step));
  const inc = () => onChange(Math.min(max, value + step));
  const btnSize = size === "compact" ? "h-5 w-5" : "h-6 w-6";
  const numSize = size === "compact" ? "w-7 text-[11px]" : "w-8 text-xs";
  return (
    <div
      className={`inline-flex items-center gap-0.5 rounded-md border border-border/60 bg-background px-0.5 py-0.5 ${
        hasWarn
          ? "border-amber-500/70 ring-1 ring-amber-500/30"
          : hasLocalEdit
            ? "border-amber-500/60 outline-dashed outline-1 outline-offset-0 outline-amber-500/60"
            : ""
      }`}
      data-testid={`pers-stepper-${metier}`}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={`${btnSize} shrink-0 hover:bg-muted`}
        onClick={dec}
        disabled={disabled || value <= lo}
        aria-label="Diminuer"
        title={`−${step}`}
      >
        <Minus className="h-3 w-3" />
      </Button>
      <span
        className={`${numSize} text-center font-mono font-bold tabular-nums ${
          hasWarn ? "text-amber-700 dark:text-amber-400" : ""
        }`}
      >
        {value}p
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={`${btnSize} shrink-0 hover:bg-muted`}
        onClick={inc}
        disabled={disabled || value >= max}
        aria-label="Augmenter"
        title={`+${step}`}
      >
        <Plus className="h-3 w-3" />
      </Button>
      {hasWarn && <AlertTriangle className="ml-0.5 h-3 w-3 text-amber-500" />}
    </div>
  );
}
