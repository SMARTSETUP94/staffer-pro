import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";

export const Route = createFileRoute("/_app/employes")({
  head: () => ({ meta: [{ title: "Employés — Planning chantiers" }] }),
  component: () => (
    <div className="p-6">
      <div className="mb-6 flex items-center gap-3">
        <Users className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Employés</h1>
      </div>
      <Card>
        <CardHeader><CardTitle>Étape 2</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground">Gestion CDI / Intérim avec compétences secondaires à venir.</p></CardContent>
      </Card>
    </div>
  ),
});
