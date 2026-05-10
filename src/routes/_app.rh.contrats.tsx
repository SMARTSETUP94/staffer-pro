/**
 * Tour 2 — /rh/contrats : page admin contrats intermittents (4 onglets + filtres + stats).
 * Squelette livré ; raffinements UI/filtres avancés en Tour 3.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, FileText, Download, FileSignature, X } from "lucide-react";
import { toast } from "sonner";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { SignContractDialog } from "@/components/contrats/SignContractDialog";
import { openContratPdf } from "@/lib/contrats-pdf-proxy";

export const Route = createFileRoute("/_app/rh/contrats")({
  component: () => (
    <RoleGuard required="admin">
      <RhContrats />
    </RoleGuard>
  ),
});

interface ContratRow {
  id: string;
  date_debut: string;
  date_fin: string;
  taux_horaire_brut: number | null;
  forfait: boolean;
  heures_estimees: number | null;
  statut: "a_signer_employe" | "a_signer_employeur" | "signe" | "annule";
  pdf_v1_url: string | null;
  pdf_v2_url: string | null;
  pdf_v3_url: string | null;
  created_at: string;
  employes: { nom: string; prenom: string; statut_contrat: string | null } | null;
  affaires: { numero: string; nom: string } | null;
  contrats_signatures?: { role_signature: "employe" | "employeur"; signed_at: string }[] | null;
}

const STATUT_LABELS: Record<ContratRow["statut"], string> = {
  a_signer_employe: "À signer (employé)",
  a_signer_employeur: "À contre-signer",
  signe: "Signé",
  annule: "Annulé",
};

function RhContrats() {
  const [tab, setTab] = useState<"a_creer" | "signes" | "archives" | "tous">("a_creer");
  const [search, setSearch] = useState("");
  const [signDialog, setSignDialog] = useState<{ id: string; pdfUrl: string | null } | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["rh-contrats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contrats_intermittents")
        .select(`
          id, date_debut, date_fin, taux_horaire_brut, forfait, heures_estimees,
          statut, pdf_v1_url, pdf_v2_url, pdf_v3_url, created_at,
          employes:employee_id ( nom, prenom, statut_contrat ),
          affaires:chantier_id ( numero, nom ),
          contrats_signatures ( role_signature, signed_at )
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as ContratRow[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("rh-contrats-signatures")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "contrats_signatures" },
        (payload) => {
          if ((payload.new as { role_signature?: string }).role_signature === "employe") {
            toast.success("Contrat signé par l’employé — contre-signature RH à traiter");
            refetch();
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refetch]);

  const stats = useMemo(() => {
    const rows = data ?? [];
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const aSigner = rows.filter((r) => r.statut !== "signe" && r.statut !== "annule" && r.created_at >= monthStart).length;
    const totalFacturable = rows
      .filter((r) => r.statut === "signe")
      .reduce((s, r) => s + (r.taux_horaire_brut ?? 0) * (r.heures_estimees ?? 0), 0);
    return { aSigner, totalFacturable };
  }, [data]);

  const handleAnnuler = async (id: string) => {
    if (!confirm("Annuler ce contrat ? Les assignations déjà créées ne seront pas supprimées.")) return;
    const { error } = await supabase.rpc("annuler_contrat_intermittent", { p_contrat_id: id, p_motif: undefined });
    if (error) toast.error(error.message);
    else { toast.success("Contrat annulé"); refetch(); }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <PageHeader title="Contrats intermittents" description="Gestion RH — signatures, suivi, archive" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card><CardContent className="pt-6">
          <div className="text-sm text-muted-foreground">À signer ce mois</div>
          <div className="text-3xl font-bold">{stats.aSigner}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <div className="text-sm text-muted-foreground">Facturable signé (estim.)</div>
          <div className="text-3xl font-bold">{stats.totalFacturable.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</div>
        </CardContent></Card>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="a_creer">À traiter</TabsTrigger>
          <TabsTrigger value="signes">Signés</TabsTrigger>
          <TabsTrigger value="archives">Archivés</TabsTrigger>
          <TabsTrigger value="tous">Tous</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Employé</TableHead>
                  <TableHead>Chantier</TableHead>
                  <TableHead>Période</TableHead>
                  <TableHead>Heures</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {(data ?? []).map((r) => {
                    const currentPdf = r.pdf_v3_url ?? r.pdf_v2_url ?? r.pdf_v1_url;
                    return (
                      <TableRow key={r.id}>
                        <TableCell>
                          <div className="font-medium">{r.employes?.prenom} {r.employes?.nom}</div>
                          <div className="text-xs text-muted-foreground">{r.employes?.statut_contrat}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-mono text-xs">{r.affaires?.numero}</div>
                          <div className="text-sm">{r.affaires?.nom}</div>
                        </TableCell>
                        <TableCell className="text-xs">
                          {new Date(r.date_debut).toLocaleDateString("fr-FR")} → {new Date(r.date_fin).toLocaleDateString("fr-FR")}
                        </TableCell>
                        <TableCell>{r.heures_estimees ?? "—"} h</TableCell>
                        <TableCell>
                          <Badge variant={r.statut === "signe" ? "default" : r.statut === "annule" ? "outline" : "secondary"}>
                            {STATUT_LABELS[r.statut]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          {currentPdf && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openContratPdf(r.id).catch((e) => toast.error(e.message))}
                            >
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {r.statut === "a_signer_employeur" && (
                            <Button size="sm" variant="default" onClick={() => setSignDialog({ id: r.id, pdfUrl: r.pdf_v2_url })}>
                              <FileSignature className="h-3.5 w-3.5" />Contre-signer
                            </Button>
                          )}
                          {r.statut !== "signe" && r.statut !== "annule" && (
                            <Button size="sm" variant="ghost" onClick={() => handleAnnuler(r.id)}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {(data?.length ?? 0) === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      <FileText className="mx-auto h-8 w-8 opacity-30 mb-2" />
                      Aucun contrat
                    </TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent></Card>
          )}
        </TabsContent>
      </Tabs>

      {signDialog && (
        <SignContractDialog
          open={!!signDialog}
          onOpenChange={(o) => !o && setSignDialog(null)}
          contratId={signDialog.id}
          role="employeur"
          pdfUrl={signDialog.pdfUrl}
          onSigned={() => { setSignDialog(null); refetch(); }}
        />
      )}
    </div>
  );
}
