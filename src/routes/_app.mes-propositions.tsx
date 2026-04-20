import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useResolvedEmploye } from "@/hooks/use-resolved-employe";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMesPropositions, type ConfirmationStatus } from "@/hooks/use-mes-propositions";
import { PropositionsList } from "@/components/propositions/PropositionsList";

export const Route = createFileRoute("/_app/mes-propositions")({
  head: () => ({ meta: [{ title: "Mes propositions — Setup Paris" }] }),
  component: MesPropositionsPage,
});

type Tab = "en_attente" | "confirmees" | "refusees";

function MesPropositionsPage() {
  const { user } = useAuth();
  const { employeId } = useResolvedEmploye();
  const [tab, setTab] = useState<Tab>("en_attente");

  const { rows, loading, refresh } = useMesPropositions(employeId);

  const filtered = useMemo(() => {
    const map: Record<Tab, ConfirmationStatus> = {
      en_attente: "en_attente",
      confirmees: "confirmee",
      refusees: "refusee",
    };
    return rows.filter((r) => r.statut_confirmation === map[tab]);
  }, [rows, tab]);

  const counts = useMemo(() => {
    const c = { en_attente: 0, confirmee: 0, refusee: 0 };
    rows.forEach((r) => {
      if (r.statut_confirmation in c) c[r.statut_confirmation as keyof typeof c]++;
    });
    return c;
  }, [rows]);

  if (!user) return null;

  if (!employeId) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Ton compte n'est pas lié à une fiche employé. Contacte un administrateur.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-6">
      <PageHeader
        number="07"
        eyebrow="Espace employé / Propositions"
        title="Mes propositions de mission"
        description="Confirme ou refuse les créneaux que le chef te propose. Tant que tu n'as pas répondu, le créneau reste 'en attente'."
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="en_attente">À répondre ({counts.en_attente})</TabsTrigger>
          <TabsTrigger value="confirmees">Confirmées ({counts.confirmee})</TabsTrigger>
          <TabsTrigger value="refusees">Refusées ({counts.refusee})</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Chargement…
        </div>
      ) : (
        <PropositionsList
          rows={filtered}
          onChanged={refresh}
          emptyMessage={
            tab === "en_attente"
              ? "Aucune mission en attente de confirmation."
              : tab === "confirmees"
                ? "Aucune mission confirmée."
                : "Aucune mission refusée."
          }
        />
      )}
    </div>
  );
}
