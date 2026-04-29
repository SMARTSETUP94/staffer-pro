/**
 * v0.26.0 — Widget "Charge atelier par pôle" (5 étapes fab).
 */
import { Hammer, Pencil, Cog, Wrench, Brush, Box } from "lucide-react";
import { ETAPE_LABELS, ETAPES_ORDER, type FabricationEtapeType } from "@/hooks/use-fabrication";
import { useFabricationDashboard, computeChargeByAssignee } from "@/hooks/use-fabrication-dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const ICONS: Record<FabricationEtapeType, typeof Hammer> = {
  be: Pencil, usinage: Cog, respo_fab: Wrench, finition: Brush, manutention: Box,
};

export function ChargeAtelierWidget() {
  const { objets, loading } = useFabricationDashboard();
  if (loading) {
    return <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">Chargement…</CardContent></Card>;
  }
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Hammer className="h-4 w-4 text-primary" />
          Charge atelier par pôle
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
          {ETAPES_ORDER.map((t) => {
            const Icon = ICONS[t];
            const charge = computeChargeByAssignee(objets, t);
            return (
              <div key={t} className="rounded-lg border p-2">
                <p className="flex items-center gap-1.5 text-xs font-semibold">
                  <Icon className="h-3.5 w-3.5 text-primary" />{ETAPE_LABELS[t]}
                </p>
                {charge.length === 0 ? (
                  <p className="mt-1 text-[10px] text-muted-foreground">Aucune charge</p>
                ) : (
                  <ul className="mt-1 space-y-0.5">
                    {charge.slice(0, 4).map((c) => (
                      <li key={c.assignee_id} className="flex items-center justify-between text-[11px]">
                        <span className="truncate">{c.assignee_name}</span>
                        <Badge variant="outline" className="ml-1 text-[10px]">{c.count}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
