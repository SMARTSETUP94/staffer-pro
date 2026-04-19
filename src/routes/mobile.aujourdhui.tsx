import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Smartphone } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/mobile/aujourdhui")({
  head: () => ({ meta: [{ title: "Mes assignations — Planning chantiers" }] }),
  component: MobileAujourdhui,
});

function MobileAujourdhui() {
  const { user, signOut } = useAuth();
  return (
    <div className="min-h-screen bg-background p-4">
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold">Mes assignations</h1>
          </div>
          <Button variant="outline" size="sm" onClick={() => signOut()}>Déconnexion</Button>
        </div>
        <p className="text-sm text-muted-foreground">{user?.email}</p>
        <Card>
          <CardHeader><CardTitle>Étape 6 (basse priorité)</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              L'écran mobile employé (assignations du jour, saisie d'heures) sera développé après le module Planning et l'export Excel.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
