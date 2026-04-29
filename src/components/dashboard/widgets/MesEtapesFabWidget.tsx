/**
 * v0.26.0 — Widget "Mes étapes fab" (étapes assignées à l'utilisateur).
 */
import { Link } from "@tanstack/react-router";
import { ListChecks } from "lucide-react";
import { useMesEtapesFabrication } from "@/hooks/use-fabrication-dashboard";
import { ETAPE_LABELS } from "@/hooks/use-fabrication";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function MesEtapesFabWidget() {
  const { etapes, loading } = useMesEtapesFabrication();

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-primary" />
          Mes étapes fab
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Chargement…</p>
        ) : etapes.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Aucune étape assignée 🎉</p>
        ) : (
          <ul className="divide-y">
            {etapes.slice(0, 8).map((e) => (
              <li key={e.etape_id} className="flex items-center justify-between gap-2 py-2">
                <Link to="/affaires/$affaireId/fabrication" params={{ affaireId: e.affaire_id }} className="min-w-0 flex-1 hover:text-primary">
                  <p className="truncate text-xs font-medium">
                    <span className="font-mono text-[10px] text-muted-foreground">{e.objet_ref}</span> — {e.objet_nom}
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {ETAPE_LABELS[e.type_etape]} · {e.affaire_numero}
                  </p>
                </Link>
                {e.date_demontage && (
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {new Date(e.date_demontage).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
