import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/lib/auth-context";
import { ConnexionsTab } from "@/components/audit-auth/ConnexionsTab";
import { InvitationsTab } from "@/components/audit-auth/InvitationsTab";
import { EvenementsTab } from "@/components/audit-auth/EvenementsTab";

export const Route = createFileRoute("/_app/audit-auth")({
  component: AuditAuthPage,
});

function AuditAuthPage() {
  const { isAdmin, rolesLoaded } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (rolesLoaded && !isAdmin) {
      navigate({ to: "/dashboard" });
    }
  }, [rolesLoaded, isAdmin, navigate]);

  if (!rolesLoaded || !isAdmin) return null;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        title="Audit Auth"
        subtitle="Registre des inscriptions, connexions et invitations"
      />

      <Tabs defaultValue="connexions" className="w-full">
        <TabsList>
          <TabsTrigger value="connexions">Connexions</TabsTrigger>
          <TabsTrigger value="invitations">Invitations</TabsTrigger>
          <TabsTrigger value="evenements">Événements</TabsTrigger>
        </TabsList>
        <TabsContent value="connexions" className="mt-6">
          <ConnexionsTab />
        </TabsContent>
        <TabsContent value="invitations" className="mt-6">
          <InvitationsTab />
        </TabsContent>
        <TabsContent value="evenements" className="mt-6">
          <EvenementsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
