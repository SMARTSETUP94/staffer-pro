/**
 * Tour 2 — /mobile/contrats : onglet employé "Mes contrats" (vue mobile).
 * Liste les contrats de l'utilisateur courant + bouton signer si statut a_signer_employe.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, FileText, Download, FileSignature } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useResolvedEmploye } from "@/hooks/use-resolved-employe";
import { SignContractDialog } from "@/components/contrats/SignContractDialog";
import { openContratPdf } from "@/lib/contrats-pdf-proxy";
import { toast } from "sonner";

export const Route = createFileRoute("/mobile/contrats")({
  component: MesContrats,
});

interface Row {
  id: string;
  date_debut: string;
  date_fin: string;
  heures_estimees: number | null;
  statut: "a_signer_employe" | "a_signer_employeur" | "signe" | "annule";
  pdf_v1_url: string | null;
  pdf_v2_url: string | null;
  pdf_v3_url: string | null;
  affaires: { numero: string; nom: string } | null;
}

const LABEL: Record<Row["statut"], string> = {
  a_signer_employe: "À signer",
  a_signer_employeur: "En attente employeur",
  signe: "Signé",
  annule: "Annulé",
};

function MesContrats() {
  const { employeId } = useResolvedEmploye();
  const [sign, setSign] = useState<{ id: string; pdfUrl: string | null } | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["mes-contrats", employeId],
    enabled: !!employeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contrats_intermittents")
        .select(`
          id, date_debut, date_fin, heures_estimees, statut,
          pdf_v1_url, pdf_v2_url, pdf_v3_url,
          affaires:chantier_id ( numero, nom )
        `)
        .eq("employee_id", employeId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Row[];
    },
  });

  return (
    <div className="p-4 space-y-3 pb-24">
      <h1 className="text-xl font-bold">Mes contrats</h1>

      {isLoading && <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>}

      {(data ?? []).map((r) => {
        const pdf = r.pdf_v3_url ?? r.pdf_v2_url ?? r.pdf_v1_url;
        return (
          <Card key={r.id}>
            <CardContent className="pt-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-mono text-xs text-muted-foreground">{r.affaires?.numero}</div>
                  <div className="font-semibold">{r.affaires?.nom}</div>
                </div>
                <Badge variant={r.statut === "signe" ? "default" : r.statut === "a_signer_employe" ? "destructive" : "secondary"}>
                  {LABEL[r.statut]}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                {new Date(r.date_debut).toLocaleDateString("fr-FR")} → {new Date(r.date_fin).toLocaleDateString("fr-FR")}
                {r.heures_estimees != null && ` · ${r.heures_estimees}h`}
              </div>
              <div className="flex items-center gap-2 pt-1">
                {pdf && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => openContratPdf(r.id).catch((e) => toast.error(e.message))}
                  >
                    <Download className="h-3.5 w-3.5" />Lire
                  </Button>
                )}
                {r.statut === "a_signer_employe" && (
                  <Button size="sm" onClick={() => setSign({ id: r.id, pdfUrl: r.pdf_v1_url })} className="flex-1">
                    <FileSignature className="h-3.5 w-3.5" />Signer
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {!isLoading && (data?.length ?? 0) === 0 && (
        <div className="text-center text-muted-foreground py-12">
          <FileText className="mx-auto h-8 w-8 opacity-30 mb-2" />
          Aucun contrat
        </div>
      )}

      {sign && (
        <SignContractDialog
          open={!!sign}
          onOpenChange={(o) => !o && setSign(null)}
          contratId={sign.id}
          role="employe"
          pdfUrl={sign.pdfUrl}
          onSigned={() => { setSign(null); refetch(); }}
        />
      )}
    </div>
  );
}
