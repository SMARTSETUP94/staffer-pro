import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ArrowLeftRight, Loader2, Plus } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { PreviewBanner } from "@/components/PreviewBanner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SwapsList } from "@/components/swaps/SwapsList";
import { CreateSwapDialog } from "@/components/swaps/CreateSwapDialog";
import {
  SWAP_IN_PROGRESS_STATUSES,
  useMesSwaps,
  type SwapStatus,
} from "@/hooks/use-mes-swaps";

export const Route = createFileRoute("/mobile/swaps")({
  head: () => ({ meta: [{ title: "Mes échanges — Setup Paris" }] }),
  component: MobileSwaps,
});

interface MyAssignation {
  id: string;
  date: string;
  demi_journee: string;
  heures: number;
  metier_id: number;
  affaire: { numero: string; nom: string } | null;
  metier: { libelle: string; couleur: string } | null;
}

type Tab = "en_cours" | "historique";

function MobileSwaps() {
  const { user } = useAuth();
  const [employeId, setEmployeId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("en_cours");
  const [createOpen, setCreateOpen] = useState(false);
  const [myAssignations, setMyAssignations] = useState<MyAssignation[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("employes")
      .select("id")
      .eq("profile_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setEmployeId(data.id);
      });
  }, [user]);

  useEffect(() => {
    if (!employeId) return;
    const today = format(new Date(), "yyyy-MM-dd");
    supabase
      .from("assignations")
      .select(
        "id, date, demi_journee, heures, metier_id, affaire:affaires(numero, nom), metier:metiers(libelle, couleur)",
      )
      .eq("employe_id", employeId)
      .gte("date", today)
      .order("date")
      .limit(60)
      .then(({ data }) => {
        setMyAssignations((data ?? []) as unknown as MyAssignation[]);
      });
  }, [employeId, createOpen]);

  const statuts: SwapStatus[] = useMemo(
    () =>
      tab === "en_cours"
        ? SWAP_IN_PROGRESS_STATUSES
        : ["validee_chef", "rejetee_chef", "refusee_collegue", "appliquee", "annulee"],
    [tab],
  );

  const { rows, loading, refresh } = useMesSwaps({
    employeId: employeId ?? undefined,
    statuts: employeId ? statuts : [],
  });

  return (
    <div className="min-h-screen bg-background pb-20">
      <PreviewBanner />

      <header className="border-b border-border bg-card px-4 py-4">
        <div className="mx-auto flex max-w-md items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="overline">— Mes échanges</p>
            <h1 className="mt-1 text-lg font-bold tracking-tight">Swaps de créneaux</h1>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1" disabled={!employeId}>
            <Plus className="h-3.5 w-3.5" /> Proposer
          </Button>
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
                <TabsTrigger value="en_cours" className="flex-1 gap-1">
                  <ArrowLeftRight className="h-3.5 w-3.5" /> En cours
                </TabsTrigger>
                <TabsTrigger value="historique" className="flex-1">Historique</TabsTrigger>
              </TabsList>
            </Tabs>

            {loading ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Chargement…
              </div>
            ) : (
              <SwapsList
                rows={rows}
                currentEmployeId={employeId}
                chefMode={false}
                onChanged={refresh}
                emptyMessage={
                  tab === "en_cours"
                    ? "Aucun échange en cours."
                    : "Aucun échange dans l'historique."
                }
              />
            )}
          </>
        )}
      </main>

      {employeId && (
        <CreateSwapDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          myAssignations={myAssignations}
          currentEmployeId={employeId}
          onCreated={refresh}
        />
      )}

      <MobileBottomNav />
    </div>
  );
}
