/**
 * v0.26.0 — Widget "Tuiles KPI commerce" (À traiter / Envoyées / Gagnées ce mois).
 */
import { useMemo } from "react";
import { AlertTriangle, Send, Trophy, ArrowUpRight, ArrowDownRight, Loader2, type LucideIcon } from "lucide-react";
import { useOpportunitesPipeline } from "@/hooks/use-opportunites-pipeline";
import { Card, CardContent } from "@/components/ui/card";
import { daysSince, getConversionsStats } from "./commerce-shared";

export function KpiTopWidget() {
  const { filtered, loading } = useOpportunitesPipeline();

  const stats = useMemo(() => {
    const aFaire = filtered.filter((o) => o.statut_opportunite === "a_faire");
    const envoyees = filtered.filter((o) => o.statut_opportunite === "envoye");
    const aFaireTension = aFaire.filter((o) => daysSince(o.date_opportunite) >= 1);
    const envoyeesRelance = envoyees.filter((o) => daysSince(o.date_opportunite) >= 3);
    return {
      aFaire: aFaire.length,
      envoyees: envoyees.length,
      aFaireTension: aFaireTension.length,
      envoyeesRelance: envoyeesRelance.length,
      conv: getConversionsStats(filtered),
    };
  }, [filtered]);

  if (loading) {
    return (
      <Card><CardContent className="flex items-center justify-center p-8">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </CardContent></Card>
    );
  }

  const deltaSign = stats.conv.delta > 0 ? "+" : "";

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Tile icon={AlertTriangle} label="À traiter" value={stats.aFaire}
        sub={stats.aFaireTension > 0 ? `${stats.aFaireTension} en tension` : "Aucune en tension"}
        tone={stats.aFaireTension > 0 ? "warning" : "default"} />
      <Tile icon={Send} label="Envoyées" value={stats.envoyees}
        sub={stats.envoyeesRelance > 0 ? `${stats.envoyeesRelance} à relancer` : "Aucune à relancer"}
        tone={stats.envoyeesRelance > 0 ? "warning" : "default"} />
      <Tile icon={Trophy} label="Gagnées ce mois" value={stats.conv.mois}
        sub={stats.conv.prev === 0 && stats.conv.mois === 0 ? "Aucune signature" : `${deltaSign}${stats.conv.delta} vs mois précédent`}
        tone={stats.conv.delta >= 0 ? "success" : "warning"}
        deltaIcon={stats.conv.delta > 0 ? ArrowUpRight : stats.conv.delta < 0 ? ArrowDownRight : undefined} />
    </div>
  );
}

function Tile({ icon: Icon, label, value, sub, tone = "default", deltaIcon: DeltaIcon }: {
  icon: LucideIcon; label: string; value: number; sub: string;
  tone?: "default" | "warning" | "success"; deltaIcon?: LucideIcon;
}) {
  const toneCls = tone === "warning" ? "border-warning/40 bg-warning/5"
    : tone === "success" ? "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-900/10"
    : "border-border";
  const subCls = tone === "warning" ? "text-warning"
    : tone === "success" ? "text-emerald-700 dark:text-emerald-400"
    : "text-muted-foreground";
  return (
    <div className={`rounded-2xl border bg-card p-4 ${toneCls}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </div>
      <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight">{value}</p>
      <p className={`mt-0.5 text-[11px] ${subCls} flex items-center gap-1`}>
        {DeltaIcon && <DeltaIcon className="h-3 w-3" aria-hidden />}{sub}
      </p>
    </div>
  );
}
