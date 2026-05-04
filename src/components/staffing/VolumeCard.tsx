// v0.38.1 — Card "Volume staffé / capa allouée"
// v0.39.0d — "h devis" = somme des heures des objets INCLUS dans ce plan
// (et non du devis complet). Permet de comparer staffing vs périmètre planifié.
import { useMemo } from "react";
import { Activity } from "lucide-react";
import { H_HALF, DEMI_PER_DAY, type PlanStep } from "@/lib/staffing/types";

interface PlanObjetLite {
  objet_id: string;
  included: boolean;
  heures_total: number;
}

interface Props {
  steps: PlanStep[];
  /** v0.39.0d — objets du plan (avec included + heures_total). Source de vérité pour h devis. */
  objets?: PlanObjetLite[] | null;
}

export function VolumeCard({ steps, objets }: Props) {
  const { hReels, hCapa, deltaPct } = useMemo(() => {
    const hCapa = steps.reduce((s, st) => {
      const demi = st.span_demi_jours ?? st.span_days * DEMI_PER_DAY;
      return s + st.pers * demi * H_HALF;
    }, 0);
    const hReels = (objets ?? [])
      .filter((o) => o.included)
      .reduce((s, o) => s + (Number(o.heures_total) || 0), 0);
    const deltaPct = hReels > 0 ? ((hCapa - hReels) / hReels) * 100 : 0;
    return { hReels, hCapa, deltaPct };
  }, [steps, objets]);

  const colorClass =
    Math.abs(deltaPct) < 5
      ? "text-emerald-600 dark:text-emerald-400"
      : Math.abs(deltaPct) < 15
        ? "text-amber-600 dark:text-amber-400"
        : "text-destructive";

  return (
    <section
      data-testid="volume-card"
      className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3"
    >
      <Activity className="h-5 w-5 text-muted-foreground" />
      <div className="flex-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Volume
        </span>
        <span className="font-mono text-sm">
          <strong className="text-foreground">{Math.round(hCapa)} h</strong>
          <span className="text-muted-foreground"> staffées</span>
        </span>
        <span className="text-muted-foreground text-xs">/</span>
        <span className="font-mono text-sm">
          <strong className="text-foreground">{Math.round(hReels)} h</strong>
          <span className="text-muted-foreground"> devis</span>
        </span>
        {hReels > 0 && (
          <span className={`font-mono text-sm font-bold ${colorClass}`}>
            ({deltaPct > 0 ? "+" : ""}{deltaPct.toFixed(1)} %)
          </span>
        )}
      </div>
      <span className="text-[10px] text-muted-foreground hidden md:block">
        granularité ½ j (4 h)
      </span>
    </section>
  );
}
