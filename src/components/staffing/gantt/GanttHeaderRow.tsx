// v0.39.2b2.1 — Sprint 2b2 Tour 1 : extrait depuis GanttInteractif.tsx.
// Bandeau de 5 KPI cards (Heures staffées / Livraison / Pic / Statut / Manut).
// Pure presentational : input = stats + manut_summary + dateLivraison.
import { Activity, Calendar, Users } from "lucide-react";
import { StatCard } from "./StatCard";
import { ManutStatCard } from "../ManutStatCard";
import { formatShortDate } from "../gantt-helpers";
import { H_HALF, DEMI_PER_DAY } from "@/lib/staffing/types";
import type { PlanData } from "../GanttInteractif";

export interface GanttStats {
  totalH: number;
  pic: number;
  statut: string;
  statutColor: string;
  hDevis: number;
  breakdown: Array<{ label: string; h: number; persDemi: number; steps: number }>;
}

export interface GanttHeaderRowProps {
  stats: GanttStats;
  manutSummary: PlanData["manut_summary"];
  dateLivraison: string;
}

export function GanttHeaderRow({ stats, manutSummary, dateLivraison }: GanttHeaderRowProps) {
  const ratioPct = stats.hDevis > 0 ? ((stats.totalH - stats.hDevis) / stats.hDevis) * 100 : 0;
  const absPct = Math.abs(ratioPct);
  const valueClassName =
    stats.hDevis > 0 && absPct > 15
      ? "text-destructive"
      : stats.hDevis > 0 && absPct > 5
        ? "text-amber-600 dark:text-amber-400"
        : "text-foreground";
  const heuresBadge =
    stats.hDevis > 0 && absPct >= 5
      ? {
          label: `${ratioPct >= 0 ? "+" : ""}${ratioPct.toFixed(1)}%`,
          severity: absPct >= 15 ? ("hard" as const) : ("soft" as const),
        }
      : null;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      <StatCard
        icon={<Activity className="h-4 w-4" />}
        label="Heures staffées"
        value={
          stats.hDevis > 0
            ? `${stats.totalH.toFixed(0)} h / ${stats.hDevis.toFixed(0)} h devis`
            : `${stats.totalH.toFixed(0)} h`
        }
        badge={heuresBadge}
        valueClassName={valueClassName}
        detail={
          <div className="space-y-3 text-xs">
            <div>
              <div className="font-bold uppercase tracking-wider text-muted-foreground mb-1">
                Formule
              </div>
              <p className="text-foreground">
                <span className="font-mono">heures = Σ (pers × ½‑journées × 4 h)</span>
              </p>
              <p className="text-muted-foreground mt-1">
                Une demi‑journée = {H_HALF} h. Une journée = {DEMI_PER_DAY} demi‑journées. Le total
                agrège toutes les étapes (tous métiers, tous objets) du plan courant.
              </p>
            </div>
            <div>
              <div className="font-bold uppercase tracking-wider text-muted-foreground mb-1">
                Décomposition par métier
              </div>
              <table className="w-full">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="font-medium pb-1">Métier</th>
                    <th className="font-medium pb-1 text-right">Étapes</th>
                    <th className="font-medium pb-1 text-right">pers·½j</th>
                    <th className="font-medium pb-1 text-right">Heures</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.breakdown.map((b) => (
                    <tr key={b.label} className="border-t border-border/50">
                      <td className="py-1">{b.label}</td>
                      <td className="py-1 text-right tabular-nums">{b.steps}</td>
                      <td className="py-1 text-right tabular-nums">{b.persDemi.toFixed(0)}</td>
                      <td className="py-1 text-right tabular-nums font-medium">
                        {b.h.toFixed(0)} h
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-border font-bold">
                    <td className="py-1">Total</td>
                    <td className="py-1 text-right tabular-nums">
                      {stats.breakdown.reduce((a, b) => a + b.steps, 0)}
                    </td>
                    <td className="py-1 text-right tabular-nums">
                      {stats.breakdown.reduce((a, b) => a + b.persDemi, 0).toFixed(0)}
                    </td>
                    <td className="py-1 text-right tabular-nums">{stats.totalH.toFixed(0)} h</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {stats.hDevis > 0 && (
              <div className="pt-2 border-t border-border">
                <div className="font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  Comparaison devis (objets du plan)
                </div>
                <p className="text-muted-foreground">
                  Devis (objets inclus) :{" "}
                  <span className="font-medium text-foreground">{stats.hDevis.toFixed(0)} h</span>
                  {" · "}Écart :{" "}
                  <span className="font-medium text-foreground">
                    {stats.totalH - stats.hDevis >= 0 ? "+" : ""}
                    {(stats.totalH - stats.hDevis).toFixed(0)} h ({ratioPct.toFixed(1)}%)
                  </span>
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Heures devis = Σ heures prévues des objets fabrication inclus dans ce plan (BE +
                  Num + Bois + Métal + Peinture + Tap + Manut). Exclut les objets non cochés et les
                  objets non rattachés à ce plan.
                </p>
              </div>
            )}
          </div>
        }
      />
      <StatCard
        icon={<Calendar className="h-4 w-4" />}
        label="Livraison HARD"
        value={formatShortDate(dateLivraison)}
      />
      <StatCard icon={<Users className="h-4 w-4" />} label="Pic atelier" value={`${stats.pic} pers`} />
      <StatCard
        icon={<Activity className="h-4 w-4" />}
        label="Statut"
        value={stats.statut}
        valueClassName={stats.statutColor}
      />
      <ManutStatCard summary={manutSummary} />
    </div>
  );
}
