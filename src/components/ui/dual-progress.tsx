/**
 * v0.18.1 — DualProgress : double barre superposée pour distinguer
 * heures STAFFÉES (planning, gris clair en fond) et heures RÉALISÉES
 * (validées, couleur pleine au-dessus). Largeur calée sur le budget commun.
 *
 * - Si staffées > budget → barre staffées en couleur warning.
 * - Si réalisées > staffées → la barre réalisées dépasse visuellement.
 * - Tout ce qui dépasse 100 % est clampé visuellement à 100 % mais le label
 *   le précise textuellement.
 */
import { cn } from "@/lib/utils";

interface Props {
  staffees: number;
  realisees: number;
  budget: number;
  /** Affiche les chiffres "Xh staffées · Yh réalisées · Zh budget" sous la barre. */
  showLabel?: boolean;
  /** Hauteur de la barre. Defaults to "md". */
  size?: "sm" | "md" | "lg";
  className?: string;
}

const HEIGHT: Record<NonNullable<Props["size"]>, string> = {
  sm: "h-1",
  md: "h-2",
  lg: "h-3",
};

export function DualProgress({
  staffees,
  realisees,
  budget,
  showLabel = true,
  size = "md",
  className,
}: Props) {
  const safeBudget = Math.max(budget, 0);
  const pctStaff = safeBudget > 0 ? Math.min((staffees / safeBudget) * 100, 100) : 0;
  const pctReal = safeBudget > 0 ? Math.min((realisees / safeBudget) * 100, 100) : 0;
  const staffOver = staffees > safeBudget && safeBudget > 0;
  const realOverStaff = realisees > staffees && staffees > 0;
  const realOverBudget = realisees > safeBudget && safeBudget > 0;
  const h = HEIGHT[size];

  return (
    <div className={cn("space-y-1", className)}>
      <div
        className={cn("relative w-full overflow-hidden rounded-full bg-muted", h)}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={Math.max(safeBudget, 1)}
        aria-valuenow={realisees}
        aria-label={`Avancement : ${realisees} h réalisées sur ${safeBudget} h budgétées (${staffees} h staffées)`}
      >
        {/* Barre 1 : staffées (fond gris-bleu un peu plus marqué que le track) */}
        <div
          className={cn(
            "absolute inset-y-0 left-0 transition-all",
            staffOver ? "bg-warning/60" : "bg-muted-foreground/30",
          )}
          style={{ width: `${pctStaff}%` }}
        />
        {/* Barre 2 : réalisées (couleur pleine, par-dessus) */}
        <div
          className={cn(
            "absolute inset-y-0 left-0 transition-all",
            realOverBudget ? "bg-destructive" : realOverStaff ? "bg-warning" : "bg-success",
          )}
          style={{ width: `${pctReal}%` }}
        />
      </div>
      {showLabel && (
        <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
          <span>
            <span className={cn("font-semibold", staffOver && "text-warning")}>
              {Math.round(staffees)}h
            </span>{" "}
            staffées · <span className={cn("font-semibold", realOverBudget && "text-destructive")}>
              {Math.round(realisees)}h
            </span>{" "}
            réalisées
          </span>
          <span>{Math.round(safeBudget)}h budget</span>
        </div>
      )}
    </div>
  );
}
