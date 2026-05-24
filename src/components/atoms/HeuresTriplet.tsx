import { cn } from "@/lib/utils";

interface HeuresTripletProps {
  prevues?: number | null;
  staffees?: number | null;
  realisees?: number | null;
  className?: string;
  size?: "sm" | "md";
  /** Affiche les libellés Pré / Stf / Réa au-dessus */
  showLabels?: boolean;
  /**
   * Sprint B atomes enrichis :
   *   - "row" (défaut historique) : Pré · Stf · Réa sur une ligne
   *   - "compact" : un seul chiffre principal (Stf si présent, sinon Pré)
   *     avec tooltip détail
   *   - "card" : grille 3 cellules avec libellé au-dessus de chaque chiffre
   */
  mode?: "row" | "compact" | "card";
  /**
   * Bascule entre affichage par personne (défaut) et total cumulé.
   * Le multiplicateur est appliqué côté appelant — ce prop sert juste
   * à afficher le suffixe ("/p" ou "tot.").
   */
  unit?: "per_person" | "total";
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
 * Triplet d'heures Prévu / Staffé / Réalisé — atome partagé.
 * Sprint B : 3 modes (row/compact/card) + bascule unit (per_person/total).
 */
export function HeuresTriplet({
  prevues,
  staffees,
  realisees,
  className,
  size = "sm",
  showLabels = false,
  mode = "row",
  unit = "per_person",
}: HeuresTripletProps) {
  const txt = size === "sm" ? "text-xs" : "text-sm";
  const colorRea = ratioColor(realisees, prevues);
  const colorStf = ratioColor(staffees, prevues);
  const unitSuffix = unit === "total" ? " tot." : "";
  const tooltip = `Prévu / Staffé / Réalisé${unit === "total" ? " (totaux cumulés)" : " (par personne)"}`;

  if (mode === "compact") {
    const principal = staffees ?? prevues;
    return (
      <span
        className={cn("inline-flex items-baseline gap-0.5 font-mono tabular-nums", txt, className)}
        title={`${tooltip} — ${fmt(prevues)} / ${fmt(staffees)} / ${fmt(realisees)}`}
      >
        <span className={cn("font-semibold", colorStf)}>{fmt(principal)}</span>
        <span className="text-[9px] text-muted-foreground">h{unitSuffix}</span>
      </span>
    );
  }

  if (mode === "card") {
    return (
      <div className={cn("grid grid-cols-3 gap-2 rounded-md border border-border bg-card/50 p-2", txt, className)} title={tooltip}>
        <Cell label={`Prévu${unitSuffix}`} value={fmt(prevues)} />
        <Cell label={`Staffé${unitSuffix}`} value={fmt(staffees)} className={colorStf} />
        <Cell label={`Réalisé${unitSuffix}`} value={fmt(realisees)} className={colorRea} />
      </div>
    );
  }

  // mode "row" (défaut)
  return (
    <div className={cn("inline-flex items-center gap-1", txt, className)} title={tooltip}>
      {showLabels ? (
        <div className="flex items-center gap-2 font-mono">
          <Item label="Pré" value={fmt(prevues)} />
          <Sep />
          <Item label="Stf" value={fmt(staffees)} className={colorStf} />
          <Sep />
          <Item label="Réa" value={fmt(realisees)} className={colorRea} />
        </div>
      ) : (
        <span className="font-mono tabular-nums text-muted-foreground">
          <span>{fmt(prevues)}</span>
          <span className="mx-1 text-muted-foreground/40">·</span>
          <span className={colorStf}>{fmt(staffees)}</span>
          <span className="mx-1 text-muted-foreground/40">·</span>
          <span className={colorRea}>{fmt(realisees)}</span>
          {unit === "total" && <span className="ml-1 text-[9px] text-muted-foreground/70">tot.</span>}
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
function Cell({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={cn("font-mono text-base font-semibold tabular-nums", className)}>{value}</span>
    </div>
  );
}
