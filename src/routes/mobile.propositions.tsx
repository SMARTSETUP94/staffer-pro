import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useResolvedEmploye } from "@/hooks/use-resolved-employe";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { PreviewBanner } from "@/components/PreviewBanner";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMesPropositions, type ConfirmationStatus } from "@/hooks/use-mes-propositions";
import { PropositionsList } from "@/components/propositions/PropositionsList";

export const Route = createFileRoute("/mobile/propositions")({
  head: () => ({ meta: [{ title: "Mes propositions — Setup Paris" }] }),
  component: MobilePropositions,
});

type Tab = "en_attente" | "confirmees" | "refusees";

function MobilePropositions() {
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

  return (
    <div className="min-h-screen bg-background pb-20">
      <PreviewBanner />

      <header className="border-b border-border bg-card px-4 py-4">
        <div className="mx-auto max-w-md">
          <p className="overline">— Mes propositions</p>
          <h1 className="mt-1 text-lg font-bold tracking-tight">Missions à confirmer</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {counts.en_attente > 0
              ? `${counts.en_attente} mission${counts.en_attente > 1 ? "s" : ""} en attente de ta réponse`
              : "Tu es à jour 🎉"}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-3 px-4 py-4">
        {!employeId ? (
          <Card>
            <CardContent className="py-8 text-center text-xs text-muted-foreground">
              Ton compte n'est pas lié à une fiche employé.
            </CardContent>
          </Card>
        ) : (
          <>
            <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
              <TabsList className="w-full">
                <TabsTrigger value="en_attente" className="flex-1">
                  À répondre ({counts.en_attente})
                </TabsTrigger>
                <TabsTrigger value="confirmees" className="flex-1">
                  ✓ ({counts.confirmee})
                </TabsTrigger>
                <TabsTrigger value="refusees" className="flex-1">
                  ✕ ({counts.refusee})
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {loading ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Chargement…
              </div>
            ) : (
              <PropositionsList
                rows={filtered}
                onChanged={refresh}
                compact
                emptyMessage={
                  tab === "en_attente"
                    ? "Aucune mission en attente."
                    : tab === "confirmees"
                      ? "Aucune mission confirmée."
                      : "Aucune mission refusée."
                }
              />
            )}
          </>
        )}
      </main>

      <MobileBottomNav />
    </div>
  );
}
