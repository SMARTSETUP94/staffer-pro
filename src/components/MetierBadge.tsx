import { cn } from "@/lib/utils";

interface MetierBadgeProps {
  libelle: string;
  couleur: string; // hex, ex "#0EA5E9"
  className?: string;
  size?: "sm" | "md";
}

/**
 * Badge couleur métier — la SEULE couleur vive autorisée hors indigo.
 * Fond pâle teinté + texte/bordure dans la couleur métier.
 */
export function MetierBadge({ libelle, couleur, className, size = "sm" }: MetierBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-semibold uppercase tracking-wider",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
        className,
      )}
      style={{
        color: couleur,
        borderColor: `${couleur}40`,
        backgroundColor: `${couleur}14`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: couleur }} />
      {libelle}
    </span>
  );
}
