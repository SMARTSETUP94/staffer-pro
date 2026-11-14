import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { requireCapability } from "@/lib/capability-guard";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { PlanningPrevisionnel, type PlanningData } from "@/components/opportunites/planning/PlanningPrevisionnel";

export const Route = createFileRoute("/_app/planning-opportunites")({
  beforeLoad: () => requireCapability("opportunites.planning.view"),
  head: () => ({
    meta: [
      { title: "Planning des opportunités — Setup Paris" },
      { name: "description", content: "Planning prévisionnel des opportunités ouvertes, séparé de la charge réelle." },
      { property: "og:title", content: "Planning des opportunités — Setup Paris" },
      { property: "og:description", content: "Échantillons, fabrication estimée, période client et matériaux à commander." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlanningOpportunitesPage,
});

function aujourdhuiParis(): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
}

function PlanningOpportunitesPage() {
  const q = useQuery({
    queryKey: ["opportunites-planning"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("opportunites_planning_lire");
      if (error) throw error;
      return data as unknown as PlanningData;
    },
  });
  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4 sm:p-6">
      <PageHeader
        number="03"
        eyebrow="Chantiers / Opportunités"
        title="Planning des opportunités"
        description="Planning probable, en lecture seule, calculé à rebours depuis la date de montage."
        actions={<Link to="/opportunites" className="text-xs font-semibold text-muted-foreground hover:text-primary hover:underline">← Pipeline</Link>}
      />
      {q.isLoading ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        : q.error ? <p className="text-sm text-destructive">Lecture impossible : {(q.error as Error).message}</p>
        : q.data && <PlanningPrevisionnel data={q.data} aujourdhui={aujourdhuiParis()} />}
    </div>
  );
}
