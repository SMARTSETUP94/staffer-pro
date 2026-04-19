import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileUp } from "lucide-react";

export const Route = createFileRoute("/_app/devis/import")({
  head: () => ({ meta: [{ title: "Import devis — Planning chantiers" }] }),
  component: () => (
    <div className="p-6">
      <div className="mb-6 flex items-center gap-3">
        <FileUp className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Import devis Excel</h1>
      </div>
      <Card>
        <CardHeader><CardTitle>Étape 3</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground">Parser Excel + preview/mapping métier à venir.</p></CardContent>
      </Card>
    </div>
  ),
});
