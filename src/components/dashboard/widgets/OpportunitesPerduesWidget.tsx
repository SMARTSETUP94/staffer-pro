/**
 * v0.26.0 — Widget "Opportunités perdues".
 */
import { useMemo } from "react";
import { XCircle } from "lucide-react";
import { useOpportunitesPipeline } from "@/hooks/use-opportunites-pipeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { STATUT_LABEL } from "@/lib/opportunites";
import { fmtShort } from "./commerce-shared";

export function OpportunitesPerduesWidget() {
  const { filtered, chargesById } = useOpportunitesPipeline();

  const items = useMemo(() => filtered
    .filter((o) => o.statut_opportunite === "perdu")
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 5),
  [filtered]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <XCircle className="h-4 w-4 text-rose-600" />
          Opportunités perdues
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Aucune opportunité perdue</p>
        ) : (
          <ul className="divide-y">
            {items.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">
                    <span className="font-mono text-muted-foreground">{o.numero}</span>{" "}
                    <span className="text-muted-foreground">·</span> {o.client ?? o.nom}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {o.charge_affaires_id ? chargesById.get(o.charge_affaires_id)?.name ?? "—" : "Non assigné"}
                    {" · "}{STATUT_LABEL[o.statut_opportunite ?? "perdu"]}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0 text-[10px]">{fmtShort(o.updated_at)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
