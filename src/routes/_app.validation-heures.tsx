import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardCheck } from "lucide-react";

export const Route = createFileRoute("/_app/validation-heures")({
  head: () => ({ meta: [{ title: "Validation heures — Planning chantiers" }] }),
  component: () => (
    <div className="p-6">
      <div className="mb-6 flex items-center gap-3">
        <ClipboardCheck className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Validation des heures</h1>
      </div>
      <Card>
        <CardHeader><CardTitle>Étape 6</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground">Validation des saisies employé à venir.</p></CardContent>
      </Card>
    </div>
  ),
});
