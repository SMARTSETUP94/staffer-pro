import { AlertTriangle, CheckCircle2, PanelRightClose, PanelRightOpen } from "lucide-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Affaire, DevisConsommation } from "@/hooks/use-planning-data";

interface Props {
  affaires: Affaire[];
  consommation: DevisConsommation[];
  filterAffaireIds?: Set<string>;
}

interface AffaireRecap {
  affaire: Affaire;
  prevues: number;
  assignees: number;
  restantes: number;
  pct: number;
}

export function HeuresRestantesSidebar({ affaires, consommation, filterAffaireIds }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  const recap: AffaireRecap[] = affaires
    .filter((a) => !filterAffaireIds || filterAffaireIds.size === 0 || filterAffaireIds.has(a.id))
    .map((affaire) => {
      const lignes = consommation.filter((c) => c.affaire_id === affaire.id);
      const prevues = lignes.reduce((s, l) => s + Number(l.heures_prevues || 0), 0);
      const assignees = lignes.reduce((s, l) => s + Number(l.heures_assignees || 0), 0);
      const restantes = prevues - assignees;
      const pct = prevues > 0 ? (assignees / prevues) * 100 : 0;
      return { affaire, prevues, assignees, restantes, pct };
    })
    .filter((r) => r.prevues > 0 || r.assignees > 0)
    .sort((a, b) => b.pct - a.pct);

  if (collapsed) {
    return (
      <div className="sticky top-4 flex justify-end">
        <Button
          size="icon"
          variant="outline"
          onClick={() => setCollapsed(false)}
          aria-label="Ouvrir la sidebar heures restantes"
        >
          <PanelRightOpen className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <Card className="sticky top-4">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3 space-y-0">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Heures restantes par affaire
        </CardTitle>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={() => setCollapsed(true)}
          aria-label="Réduire la sidebar"
        >
          <PanelRightClose className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {recap.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            Aucune affaire avec heures budgétées.
          </p>
        ) : (
          recap.map(({ affaire, prevues, assignees, restantes, pct }) => {
            const depasse = pct > 100;
            const proche = pct >= 80 && pct <= 100;
            return (
              <div key={affaire.id} className="space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold truncate">{affaire.numero}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{affaire.nom}</p>
                  </div>
                  {depasse ? (
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                  ) : proche ? (
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
                  )}
                </div>
                <Progress
                  value={Math.min(pct, 100)}
                  className={cn(
                    "h-1.5",
                    depasse && "[&>div]:bg-destructive",
                    proche && !depasse && "[&>div]:bg-warning",
                  )}
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>
                    {assignees.toFixed(0)}h / {prevues.toFixed(0)}h
                  </span>
                  <span className={cn("font-semibold", depasse && "text-destructive")}>
                    {depasse ? `+${(assignees - prevues).toFixed(0)}h` : `${restantes.toFixed(0)}h restantes`}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
