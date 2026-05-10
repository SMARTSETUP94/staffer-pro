import { createFileRoute, Link } from "@tanstack/react-router";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { ChefMobileHeader } from "@/components/mobile-chef/ChefMobileHeader";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/mobile/chef/fabrication")({
  head: () => ({ meta: [{ title: "Hub chef — Fabrication" }] }),
  component: () => (
    <RoleGuard required="chef_or_admin">
      <>
        <ChefMobileHeader title="Suivi fabrication" />
        <div className="mx-auto max-w-xl p-4">
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground space-y-2">
              <p>Module disponible au <strong>Tour 2</strong>.</p>
              <p className="text-xs">Le socle DB est posé : statut chef, photos, bucket Storage. UI à venir.</p>
              <Link to="/mobile/chef/dashboard" className="text-primary underline text-xs">← Retour au hub</Link>
            </CardContent>
          </Card>
        </div>
      </>
    </RoleGuard>
  ),
});
