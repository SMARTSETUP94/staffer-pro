import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2 } from "lucide-react";

export const Route = createFileRoute("/_app/affaires")({
  head: () => ({ meta: [{ title: "Affaires — Planning chantiers" }] }),
  component: () => (
    <div className="p-6">
      <div className="mb-6 flex items-center gap-3">
        <Building2 className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Affaires</h1>
      </div>
      <Card>
        <CardHeader><CardTitle>Étape 2</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground">CRUD affaires + devis manuel à venir.</p></CardContent>
      </Card>
    </div>
  ),
});
