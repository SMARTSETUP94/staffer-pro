/**
 * v0.26.0 — Widget "Conversions récentes".
 */
import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { useOpportunitesPipeline } from "@/hooks/use-opportunites-pipeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtShort } from "./commerce-shared";

export function ConversionsRecentesWidget() {
  const { filtered, chargesById } = useOpportunitesPipeline();

  const items = useMemo(() => filtered
    .filter((o) => !!o.signed_at && !!o.code_opportunite)
    .sort((a, b) => (b.signed_at ?? "").localeCompare(a.signed_at ?? ""))
    .slice(0, 5),
  [filtered]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          Conversions récentes
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Aucune conversion récente</p>
        ) : (
          <ul className="divide-y">
            {items.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <Link to="/affaires/$affaireId" params={{ affaireId: o.id }} className="truncate text-xs font-medium hover:text-primary block">
                    <span className="font-mono text-muted-foreground line-through mr-1">{o.code_opportunite}</span>
                    → <span className="font-mono text-primary">{o.numero}</span>{" "}
                    <span className="text-muted-foreground">·</span> {o.client ?? o.nom}
                  </Link>
                  <p className="text-[10px] text-muted-foreground">
                    {o.charge_affaires_id ? chargesById.get(o.charge_affaires_id)?.name ?? "—" : "Non assigné"}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0 text-[10px]">{fmtShort(o.signed_at)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
