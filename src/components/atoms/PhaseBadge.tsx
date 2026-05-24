import { cn } from "@/lib/utils";

export type AffairePhase = "commercial_etude" | "fabrication" | "montage" | "demontage";

const PHASE_META: Record<
  AffairePhase,
  { label: string; short: string; color: string; bg: string; border: string }
> = {
  commercial_etude: { label: "Commercial / Étude", short: "C&E",  color: "#6366f1", bg: "#6366f114", border: "#6366f140" },
  fabrication:      { label: "Fabrication",         short: "Fab",  color: "#0ea5e9", bg: "#0ea5e914", border: "#0ea5e940" },
  montage:          { label: "Montage",             short: "Mont", color: "#f59e0b", bg: "#f59e0b14", border: "#f59e0b40" },
  demontage:        { label: "Démontage",           short: "Dém",  color: "#ef4444", bg: "#ef444414", border: "#ef444440" },
};

interface PhaseBadgeProps {
  phase: AffairePhase;
  size?: "sm" | "md";
  className?: string;
  withDot?: boolean;
  /**
   * Sprint B atomes enrichis :
   *  - "outline" (défaut historique) : fond pastel + bordure colorée
   *  - "solid" : fond plein coloré, texte blanc
   *  - "pastille" : juste un point coloré + label texte (sans pastille de fond)
   */
  variant?: "outline" | "solid" | "pastille";
  /** Affiche le label court (Fab, Mont…) au lieu du label complet */
  compact?: boolean;
}

/**
 * Badge phase. Sprint B : 3 variantes (outline / solid / pastille) + label compact.
 */
export function PhaseBadge({
  phase,
  size = "sm",
  className,
  withDot = true,
  variant = "outline",
  compact = false,
}: PhaseBadgeProps) {
  const meta = PHASE_META[phase];
  const label = compact ? meta.short : meta.label;

  if (variant === "pastille") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 font-semibold",
          size === "sm" ? "text-[11px]" : "text-xs",
          className,
        )}
        style={{ color: meta.color }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
        {label}
      </span>
    );
  }

  if (variant === "solid") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full font-semibold uppercase tracking-wider text-white",
          size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
          className,
        )}
        style={{ backgroundColor: meta.color }}
      >
        {withDot && <span className="h-1.5 w-1.5 rounded-full bg-white/90" />}
        {label}
      </span>
    );
  }

  // outline (défaut)
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-semibold uppercase tracking-wider",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
        className,
      )}
      style={{ color: meta.color, backgroundColor: meta.bg, borderColor: meta.border }}
    >
      {withDot && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.color }} />}
      {label}
    </span>
  );
}

export function phaseLabel(phase: AffairePhase): string {
  return PHASE_META[phase].label;
}
export function phaseColor(phase: AffairePhase): string {
  return PHASE_META[phase].color;
}
