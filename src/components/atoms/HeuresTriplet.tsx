import { cn } from "@/lib/utils";

interface HeuresTripletProps {
  prevues?: number | null;
  staffees?: number | null;
  realisees?: number | null;
  className?: string;
  size?: "sm" | "md";
  /** Affiche les libellés Pré / Staf / Réa au-dessus */
  showLabels?: boolean;
}

const fmt = (n: number | null | undefined) => {
  if (n === null || n === undefined) return "—";
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(1).replace(/\.0$/, "");
};

const ratioColor = (a?: number | null, b?: number | null): string => {
  if (!a || !b) return "text-foreground";
  const pct = a / b;
  if (pct > 1.15) return "text-red-600 dark:text-red-400";
  if (pct > 1.05) return "text-amber-600 dark:text-amber-400";
  return "text-foreground";
};

/**
 * Triplet d'heures Prévu / Staffé / Réalisé — atome utilisé partout
 * dès Sprint B (KPI casting, ligne assignation, fiche objet…).
 */
export function HeuresTriplet({
  prevues,
  staffees,
  realisees,
  className,
  size = "sm",
  showLabels = false,
}: HeuresTripletProps) {
  const txt = size === "sm" ? "text-xs" : "text-sm";
  const colorRea = ratioColor(realisees, prevues);
  const colorStf = ratioColor(staffees, prevues);

  return (
    <div className={cn("inline-flex items-center gap-1", txt, className)}>
      {showLabels ? (
        <div className="flex items-center gap-2 font-mono">
          <Item label="Pré" value={fmt(prevues)} />
          <Sep />
          <Item label="Stf" value={fmt(staffees)} className={colorStf} />
          <Sep />
          <Item label="Réa" value={fmt(realisees)} className={colorRea} />
        </div>
      ) : (
        <span className="font-mono tabular-nums text-muted-foreground" title="Prévu / Staffé / Réalisé">
          <span>{fmt(prevues)}</span>
          <span className="mx-1 text-muted-foreground/40">·</span>
          <span className={colorStf}>{fmt(staffees)}</span>
          <span className="mx-1 text-muted-foreground/40">·</span>
          <span className={colorRea}>{fmt(realisees)}</span>
        </span>
      )}
    </div>
  );
}

function Sep() {
  return <span className="text-muted-foreground/30">·</span>;
}
function Item({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <span className="inline-flex items-baseline gap-0.5">
      <span className="text-[9px] uppercase text-muted-foreground/60">{label}</span>
      <span className={cn("tabular-nums font-medium", className)}>{value}</span>
    </span>
  );
}
