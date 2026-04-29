import { cn } from "@/lib/utils";
import {
  type AffaireTypologie,
  AFFAIRE_TYPOLOGIE_LABELS,
  AFFAIRE_TYPOLOGIE_SHORT_LABELS,
  AFFAIRE_TYPOLOGIE_COLORS,
} from "@/lib/affaire-typologie";

interface TypologieBadgeProps {
  typologie: AffaireTypologie | null | undefined;
  size?: "sm" | "md";
  short?: boolean;
  className?: string;
}

/**
 * Badge typologie chantier — utilise les tokens --typologie-* dédiés.
 * Pattern aligné avec MetierBadge mais via tokens (pas hex direct).
 */
export function TypologieBadge({
  typologie,
  size = "sm",
  short = false,
  className,
}: TypologieBadgeProps) {
  if (!typologie) return null;
  const colors = AFFAIRE_TYPOLOGIE_COLORS[typologie];
  const label = short
    ? AFFAIRE_TYPOLOGIE_SHORT_LABELS[typologie]
    : AFFAIRE_TYPOLOGIE_LABELS[typologie];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-semibold uppercase tracking-wider",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
        className,
      )}
      style={{
        backgroundColor: colors.bg,
        color: colors.fg,
        borderColor: colors.fg,
        borderWidth: "1px",
        borderStyle: "solid",
      }}
      title={AFFAIRE_TYPOLOGIE_LABELS[typologie]}
    >
      {label}
    </span>
  );
}
