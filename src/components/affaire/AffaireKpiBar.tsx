// v0.48 Bloc 5 — Sticky KPI bar fiche affaire 360°
import { useEffect, useState } from "react";
import { Loader2, TrendingUp, Users, Clock, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface Props {
  affaireId: string;
}

interface Kpis {
  heuresPrevues: number;
  heuresAssignees: number;
  heuresReelles: number;
  nbEmployes: number;
  pctConso: number; // réelles / prévues
  pctStaff: number; // assignées / prévues
}

export function AffaireKpiBar({ affaireId }: Props) {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: cons }, { data: team }] = await Promise.all([
        supabase
          .from("v_devis_consommation")
          .select("heures_prevues, heures_assignees, heures_reelles_validees")
          .eq("affaire_id", affaireId),
        supabase
          .from("affaire_equipe_historique")
          .select("employe_id", { count: "exact", head: false })
          .eq("affaire_id", affaireId),
      ]);
      if (cancelled) return;

      const heuresPrevues = (cons ?? []).reduce((s, r: any) => s + Number(r.heures_prevues ?? 0), 0);
      const heuresAssignees = (cons ?? []).reduce((s, r: any) => s + Number(r.heures_assignees ?? 0), 0);
      const heuresReelles = (cons ?? []).reduce((s, r: any) => s + Number(r.heures_reelles_validees ?? 0), 0);
      const nbEmployes = new Set((team ?? []).map((r: any) => r.employe_id)).size;

      setKpis({
        heuresPrevues,
        heuresAssignees,
        heuresReelles,
        nbEmployes,
        pctConso: heuresPrevues > 0 ? Math.round((heuresReelles / heuresPrevues) * 100) : 0,
        pctStaff: heuresPrevues > 0 ? Math.round((heuresAssignees / heuresPrevues) * 100) : 0,
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [affaireId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-border bg-muted/30 px-4 py-3">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!kpis) return null;

  const ecartStaff = kpis.pctStaff - 100;
  const staffWarn = Math.abs(ecartStaff) >= 15;
  const staffSoft = !staffWarn && Math.abs(ecartStaff) >= 5;
  const overConso = kpis.pctConso > 100;

  return (
    <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-card px-3 py-2.5 sm:grid-cols-4">
      <Kpi
        icon={<Clock className="h-3.5 w-3.5" />}
        label="Heures prévues"
        value={fmt(kpis.heuresPrevues) + " h"}
      />
      <Kpi
        icon={<TrendingUp className="h-3.5 w-3.5" />}
        label="Staffées"
        value={`${fmt(kpis.heuresAssignees)} h`}
        sub={`${kpis.pctStaff}%`}
        tone={staffWarn ? "danger" : staffSoft ? "warn" : "ok"}
      />
      <Kpi
        icon={<AlertTriangle className="h-3.5 w-3.5" />}
        label="Consommé"
        value={`${fmt(kpis.heuresReelles)} h`}
        sub={`${kpis.pctConso}%`}
        tone={overConso ? "danger" : kpis.pctConso > 80 ? "warn" : "ok"}
      />
      <Kpi
        icon={<Users className="h-3.5 w-3.5" />}
        label="Équipe"
        value={`${kpis.nbEmployes}`}
        sub={kpis.nbEmployes > 1 ? "personnes" : "personne"}
      />
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "ok" | "warn" | "danger";
}) {
  const toneCls =
    tone === "danger"
      ? "text-destructive"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "ok"
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-foreground";
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span className={cn("text-base font-bold tabular-nums", toneCls)}>{value}</span>
        {sub && <span className={cn("text-xs font-semibold tabular-nums", toneCls)}>{sub}</span>}
      </div>
    </div>
  );
}

function fmt(n: number) {
  return Math.round(n).toLocaleString("fr-FR");
}
