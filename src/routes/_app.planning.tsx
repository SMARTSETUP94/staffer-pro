import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "lucide-react";

export const Route = createFileRoute("/_app/planning")({
  head: () => ({
    meta: [
      { title: "Planning — Planning chantiers" },
      { name: "description", content: "Vue planning hebdomadaire des équipes sur les chantiers." },
    ],
  }),
  component: PlanningPage,
});

function PlanningPage() {
  return (
    <div className="p-6">
      <div className="mb-6 flex items-center gap-3">
        <Calendar className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Planning hebdomadaire</h1>
      </div>
      <Card>
        <CardHeader><CardTitle>Bientôt disponible</CardTitle></CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Le module Planning sera développé à l'étape 4 :
            grille employés × jours, drag & drop, sidebar « Heures restantes » par affaire,
            alertes de dépassement.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
