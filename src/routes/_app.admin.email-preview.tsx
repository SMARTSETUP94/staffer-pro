import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Mail, Eye, Code2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/PageHeader";
import { useAuth, type AppRole } from "@/lib/auth-context";
import { buildInvitationEmailHtml } from "@/lib/email-templates/invitation";
import { requireCapability } from "@/lib/capability-guard";

export const Route = createFileRoute("/_app/admin/email-preview")({
  beforeLoad: () => requireCapability("admin.email_preview.view"),
  head: () => ({ meta: [{ title: "Preview Emails — Admin" }] }),
  component: EmailPreviewPage,
});

function EmailPreviewPage() {
  const navigate = useNavigate();
  const { isAdmin, loading } = useAuth();

  const [fullName, setFullName] = useState("Jean Dupont");
  const [role, setRole] = useState<AppRole>("chef_chantier");
  const [inviteLink, setInviteLink] = useState(
    "https://staffer-pro.lovable.app/auth/accept-invite?token=preview-token-123",
  );

  useEffect(() => {
    if (!loading && !isAdmin) navigate({ to: "/dashboard" });
  }, [loading, isAdmin, navigate]);

  const html = useMemo(
    () =>
      buildInvitationEmailHtml({
        fullName: fullName.trim() || undefined,
        roles: [role],
        inviteLink: inviteLink.trim() || "https://example.com",
      }),
    [fullName, role, inviteLink],
  );

  if (loading || !isAdmin) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Preview emails transactionnels"
        description="Visualisez le rendu des emails envoyés (invitation, etc.) sans les déclencher."
      />

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Controls */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="h-4 w-4 text-primary" />
              Variables du template
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="prev-name">Nom complet</Label>
              <Input
                id="prev-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="(vide → « Bonjour, »)"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prev-role">Rôle</Label>
              <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
                <SelectTrigger id="prev-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrateur</SelectItem>
                  <SelectItem value="chef_chantier">Chef de Chantier</SelectItem>
                  <SelectItem value="employe">Employé</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prev-link">Lien magique</Label>
              <Input
                id="prev-link"
                value={inviteLink}
                onChange={(e) => setInviteLink(e.target.value)}
              />
            </div>

            <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
              <strong className="block text-foreground">Sender :</strong>
              <code className="break-all">onboarding@setup.paris</code>
              <br />
              <strong className="mt-2 block text-foreground">Reply-To :</strong>
              <code className="break-all">smart@setup.paris</code>
              <br />
              <strong className="mt-2 block text-foreground">Subject :</strong>
              Invitation — Staffing by Setup.Paris
            </div>
          </CardContent>
        </Card>

        {/* Preview */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Rendu</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="visual">
              <TabsList>
                <TabsTrigger value="visual" className="gap-1.5">
                  <Eye className="h-3.5 w-3.5" /> Visuel
                </TabsTrigger>
                <TabsTrigger value="html" className="gap-1.5">
                  <Code2 className="h-3.5 w-3.5" /> HTML source
                </TabsTrigger>
              </TabsList>
              <TabsContent value="visual" className="mt-3">
                <div className="overflow-hidden rounded-lg border bg-white">
                  <iframe
                    title="Email preview"
                    srcDoc={html}
                    className="h-[820px] w-full border-0"
                    sandbox=""
                  />
                </div>
              </TabsContent>
              <TabsContent value="html" className="mt-3">
                <pre className="max-h-[820px] overflow-auto rounded-lg border bg-muted p-3 text-[11px] leading-relaxed">
                  <code>{html}</code>
                </pre>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
