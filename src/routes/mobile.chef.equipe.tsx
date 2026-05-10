import { createFileRoute, Link } from "@tanstack/react-router";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { ChefMobileHeader } from "@/components/mobile-chef/ChefMobileHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Hammer, Clock, CalendarOff } from "lucide-react";

export const Route = createFileRoute("/mobile/chef/equipe")({
  head: () => ({ meta: [{ title: "Hub chef — Mon équipe" }] }),
  component: () => (
    <RoleGuard required="chef_or_admin">
      <ChefEquipePlaceholder />
    </RoleGuard>
  ),
});

function ChefEquipePlaceholder() {
  return (
    <>
      <ChefMobileHeader title="Mon équipe" />
      <div className="mx-auto max-w-xl space-y-3 p-4">
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Clock className="h-4 w-4" /> Validation des heures équipe
            </div>
            <p className="text-xs text-muted-foreground">
              Disponible au Tour 2 — pour l'instant, utilise <Link to="/audit-heures" className="underline">l'audit heures desktop</Link>.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <CalendarOff className="h-4 w-4" /> Absences à valider
            </div>
            <p className="text-xs text-muted-foreground">Tour 2.</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <Link to="/mobile/chef/fabrication" className="flex items-center gap-2 text-sm font-semibold">
              <Hammer className="h-4 w-4" /> Suivi fabrication →
            </Link>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
