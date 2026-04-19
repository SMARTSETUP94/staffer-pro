import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileDown } from "lucide-react";

export const Route = createFileRoute("/_app/export")({
  head: () => ({ meta: [{ title: "Export planning — Planning chantiers" }] }),
  component: () => (
    <div className="p-6">
      <div className="mb-6 flex items-center gap-3">
        <FileDown className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Export planning Excel</h1>
      </div>
      <Card>
        <CardHeader><CardTitle>Étape 5</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground">Export matriciel hebdo (3 feuilles) à venir.</p></CardContent>
      </Card>
    </div>
  ),
});
