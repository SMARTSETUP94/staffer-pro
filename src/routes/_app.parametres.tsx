import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2, Settings } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_app/parametres")({
  head: () => ({ meta: [{ title: "Paramètres — Planning chantiers" }] }),
  component: ParametresPage,
});

function ParametresPage() {
  const navigate = useNavigate();
  const { isAdmin, loading } = useAuth();

  useEffect(() => {
    if (!loading && !isAdmin) navigate({ to: "/planning" });
  }, [loading, isAdmin, navigate]);

  if (loading || !isAdmin) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center gap-3">
        <Settings className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Paramètres</h1>
      </div>
      <Card>
        <CardHeader><CardTitle>Administration</CardTitle></CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Gestion des utilisateurs, des rôles, des métiers et des seuils — accessible uniquement aux administrateurs.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
