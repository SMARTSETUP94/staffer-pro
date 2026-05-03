// v0.39.0 — Chevrons ±1j pour décaler start_date d'une barre métier.
// Réutilise edit-store.manual_shift (déjà branché côté serveur via flush).
// Cumulatif : delta vient s'ajouter au manual_shift courant.
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  manualShift: number;
  disabled?: boolean;
  onShift: (delta: number) => void;
  onReset?: () => void;
  size?: "compact" | "normal";
}

export function DateShifter({ manualShift, disabled, onShift, onReset, size = "compact" }: Props) {
  const btn = size === "compact" ? "h-5 w-5" : "h-6 w-6";
  const label =
    manualShift === 0 ? null : `${manualShift > 0 ? "+" : ""}${manualShift}j`;
  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border border-border/60 bg-background px-0.5 py-0.5">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={`${btn} shrink-0 hover:bg-muted`}
        onClick={() => onShift(-1)}
        disabled={disabled}
        aria-label="Décaler -1 jour"
        title="-1 j"
      >
        <ChevronLeft className="h-3 w-3" />
      </Button>
      {label && (
        <span className="min-w-[28px] text-center font-mono text-[10px] font-bold text-amber-700 dark:text-amber-400 tabular-nums">
          {label}
        </span>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={`${btn} shrink-0 hover:bg-muted`}
        onClick={() => onShift(1)}
        disabled={disabled}
        aria-label="Décaler +1 jour"
        title="+1 j"
      >
        <ChevronRight className="h-3 w-3" />
      </Button>
      {onReset && manualShift !== 0 && !disabled && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={`${btn} shrink-0 hover:bg-muted`}
          onClick={onReset}
          aria-label="Annuler décalage"
          title="Annuler décalage"
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
