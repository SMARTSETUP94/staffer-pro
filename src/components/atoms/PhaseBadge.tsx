import { cn } from "@/lib/utils";

export type AffairePhase = "commercial_etude" | "fabrication" | "montage" | "demontage";

const PHASE_META: Record<AffairePhase, { label: string; color: string; bg: string; border: string }> = {
  commercial_etude: { label: "Commercial / Étude", color: "#6366f1", bg: "#6366f114", border: "#6366f140" },
  fabrication:      { label: "Fabrication",         color: "#0ea5e9", bg: "#0ea5e914", border: "#0ea5e940" },
  montage:          { label: "Montage",             color: "#f59e0b", bg: "#f59e0b14", border: "#f59e0b40" },
  demontage:        { label: "Démontage",           color: "#ef4444", bg: "#ef444414", border: "#ef444440" },
};

interface PhaseBadgeProps {
  phase: AffairePhase;
  size?: "sm" | "md";
  className?: string;
  withDot?: boolean;
}

/**
 * Badge phase — utilisé partout dès Sprint B (RoleSwitcher, casting,
 * pickers personne, journal équipe, etc.). Atome design system.
 */
export function PhaseBadge({ phase, size = "sm", className, withDot = true }: PhaseBadgeProps) {
  const meta = PHASE_META[phase];
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
      {meta.label}
    </span>
  );
}

export function phaseLabel(phase: AffairePhase): string {
  return PHASE_META[phase].label;
}
export function phaseColor(phase: AffairePhase): string {
  return PHASE_META[phase].color;
}
