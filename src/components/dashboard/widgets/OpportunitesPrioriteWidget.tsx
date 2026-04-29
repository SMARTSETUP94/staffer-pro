/**
 * v0.26.0 — Widget "À traiter en priorité" (opportunités en tension).
 */
import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { useOpportunitesPipeline } from "@/hooks/use-opportunites-pipeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { daysSince } from "./commerce-shared";

export function OpportunitesPrioriteWidget() {
  const { filtered, chargesById } = useOpportunitesPipeline();

  const items = useMemo(() => {
    const aFaire = filtered.filter((o) => o.statut_opportunite === "a_faire");
    const envoyees = filtered.filter((o) => o.statut_opportunite === "envoye");
    type Item = { opp: typeof filtered[number]; severity: "rouge" | "orange" | "jaune"; ageDays: number; label: string };
    const arr: Item[] = [];
    aFaire.forEach((o) => {
      const age = daysSince(o.date_opportunite);
      if (age >= 2) arr.push({ opp: o, severity: "rouge", ageDays: age, label: "À traiter +48h" });
      else if (age >= 1) arr.push({ opp: o, severity: "orange", ageDays: age, label: "À traiter +24h" });
    });
    envoyees.forEach((o) => {
      const age = daysSince(o.date_opportunite);
      if (age >= 3) arr.push({ opp: o, severity: "jaune", ageDays: age, label: "Envoyée +3j" });
    });
    arr.sort((a, b) => b.ageDays - a.ageDays);
    return arr.slice(0, 8);
  }, [filtered]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" />
          À traiter en priorité
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Aucune opportunité en tension 🎉</p>
        ) : (
          <ul className="space-y-1.5">
            {items.map(({ opp, severity, ageDays, label }) => {
              const dot = severity === "rouge" ? "🔴" : severity === "orange" ? "🟠" : "🟡";
              const caName = opp.charge_affaires_id ? chargesById.get(opp.charge_affaires_id)?.name ?? "—" : "Non assigné";
              return (
                <li key={opp.id} className="flex items-center justify-between gap-2 rounded-md border border-border/50 px-2.5 py-1.5 hover:bg-muted/30">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="text-sm" aria-hidden>{dot}</span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">
                        <span className="font-mono text-primary">{opp.numero}</span>{" "}
                        <span className="text-muted-foreground">·</span>{" "}
                        {opp.client ?? opp.nom}
                      </p>
                      <p className="truncate text-[10px] text-muted-foreground">{label} · {caName}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[10px] tabular-nums">{ageDays}j</Badge>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
