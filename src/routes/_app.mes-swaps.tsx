import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ArrowLeftRight, Loader2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useResolvedEmploye } from "@/hooks/use-resolved-employe";
import { PageHeader } from "@/components/PageHeader";
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

import { ScopeSelector, ScopeNotImplementedBanner, type UrlScope } from "@/components/scope/ScopeSelector";

export const Route = createFileRoute("/_app/mes-swaps")({
  validateSearch: (s: Record<string, unknown>): { scope: UrlScope } => {
    const r = s.scope;
    return { scope: r === "team" || r === "all" ? r : "mine" };
  },
  head: () => ({ meta: [{ title: "Mes échanges — Setup Paris" }] }),
  component: MesSwapsPage,
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

function MesSwapsPage() {
  const { user } = useAuth();
  const { employeId } = useResolvedEmploye();
  const [tab, setTab] = useState<Tab>("en_cours");
  const [createOpen, setCreateOpen] = useState(false);
  const [myAssignations, setMyAssignations] = useState<MyAssignation[]>([]);

  // Charger mes assignations futures (pour CreateSwapDialog)
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
        number="06"
        eyebrow="Espace employé / Échanges"
        title="Mes échanges de créneaux"
        description="Propose à un collègue de prendre ton créneau ou échange un créneau bidirectionnel."
        actions={
          <Button onClick={() => setCreateOpen(true)} className="gap-1">
            <Plus className="h-4 w-4" /> Proposer un échange
          </Button>
        }
      />

      <div className="flex items-center justify-between gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList>
            <TabsTrigger value="en_cours" className="gap-1">
              <ArrowLeftRight className="h-3.5 w-3.5" /> En cours
            </TabsTrigger>
            <TabsTrigger value="historique">Historique</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
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
              ? "Aucun échange en cours. Propose-en un avec le bouton ci-dessus."
              : "Aucun échange dans l'historique."
          }
        />
      )}

      <CreateSwapDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        myAssignations={myAssignations}
        currentEmployeId={employeId}
        onCreated={refresh}
      />
    </div>
  );
}
