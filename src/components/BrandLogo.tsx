import { cn } from "@/lib/utils";

interface BrandLogoProps {
  className?: string;
  tone?: "ink" | "cream";
}

/**
 * Logo Staffing by SETUP.PARIS — affiché sur 2 lignes :
 *   • Staffing
 *     by SETUP.PARIS
 */
export function BrandLogo({ className, tone = "ink" }: BrandLogoProps) {
  const primaryToneClass = tone === "cream" ? "text-[var(--cream)]" : "text-foreground";
  const secondaryToneClass =
    tone === "cream" ? "text-[var(--cream)]/60" : "text-foreground/60";

  return (
    <span
      className={cn(
        "inline-flex items-start gap-2 text-sm font-extrabold uppercase tracking-[0.14em] leading-tight",
        className,
      )}
    >
      <span className="brand-dot mt-1.5 shrink-0" aria-hidden />
      <span className="flex flex-col">
        <span className={primaryToneClass}>Staffing</span>
        <span>
          <span className={cn("font-semibold", secondaryToneClass)}>by</span>{" "}
          <span className="text-primary">SETUP.PARIS</span>
        </span>
      </span>
    </span>
  );
}
