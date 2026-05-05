import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/PageHeader";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { ConnexionsTab } from "@/components/audit-auth/ConnexionsTab";
import { InvitationsTab } from "@/components/audit-auth/InvitationsTab";
import { EvenementsTab } from "@/components/audit-auth/EvenementsTab";
import { IncidentsTab } from "@/components/audit-auth/IncidentsTab";

const TAB_VALUES = ["connexions", "invitations", "evenements", "incidents"] as const;
type AuditAuthTab = (typeof TAB_VALUES)[number];

const auditAuthSearchSchema = z.object({
  tab: fallback(z.enum(TAB_VALUES), "connexions").default("connexions"),
});

export const Route = createFileRoute("/_app/audit-auth")({
  validateSearch: zodValidator(auditAuthSearchSchema),
  component: AuditAuthPage,
});

function AuditAuthPage() {
  const { isAdmin, rolesLoaded } = useAuth();
  const navigate = useNavigate({ from: "/audit-auth" });
  const { tab } = Route.useSearch();

  useEffect(() => {
    if (rolesLoaded && !isAdmin) {
      navigate({ to: "/dashboard" });
    }
  }, [rolesLoaded, isAdmin, navigate]);

  if (!rolesLoaded || !isAdmin) return null;

  const setTab = (next: string) => {
    navigate({ search: { tab: next as AuditAuthTab }, replace: true });
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        title="Audit Auth"
        description="Registre des inscriptions, connexions, invitations, événements et incidents auth"
      />

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList>
          <TabsTrigger value="connexions">Connexions</TabsTrigger>
          <TabsTrigger value="invitations">Invitations</TabsTrigger>
          <TabsTrigger value="evenements">Événements</TabsTrigger>
          <TabsTrigger value="incidents">Incidents (24h)</TabsTrigger>
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
        <TabsContent value="incidents" className="mt-6">
          <IncidentsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
