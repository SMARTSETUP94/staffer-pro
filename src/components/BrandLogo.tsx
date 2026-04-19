import { cn } from "@/lib/utils";

interface BrandLogoProps {
  className?: string;
  /** Premier mot (en noir / cream selon contexte) */
  word1?: string;
  /** Second mot (en indigo) */
  word2?: string;
  /** Forcer la couleur du premier mot */
  tone?: "ink" | "cream";
}

/**
 * Logo Setup Paris — pattern : • PROJECT SHIFT
 * Le mot 2 est toujours en indigo, point décoratif indigo à gauche.
 */
export function BrandLogo({
  className,
  word1 = "PROJECT",
  word2 = "SHIFT",
  tone = "ink",
}: BrandLogoProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-sm font-extrabold uppercase tracking-[0.14em]",
        className,
      )}
    >
      <span className="brand-dot" aria-hidden />
      <span className={tone === "cream" ? "text-[var(--cream)]" : "text-foreground"}>
        {word1}
      </span>
      <span className="text-primary">{word2}</span>
    </span>
  );
}
