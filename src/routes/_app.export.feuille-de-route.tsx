import { createFileRoute } from "@tanstack/react-router";
import { startOfWeek, addDays } from "date-fns";
import { ClipboardList, Loader2 } from "lucide-react";
import { useState } from "react";
import { usePlanningData } from "@/hooks/use-planning-data";
import { useVehicules } from "@/hooks/use-vehicules";
import { FeuilleRouteTableurView } from "@/components/planning/FeuilleRouteTableurView";
import { PageBreadcrumbs } from "@/components/PageBreadcrumbs";
import { requireCapability } from "@/lib/capability-guard";

export const Route = createFileRoute("/_app/export/feuille-de-route")({
  beforeLoad: () => requireCapability("section.admin"),
  head: () => ({
    meta: [
      { title: "Feuille de route — Planning" },
      { name: "description", content: "Vue tableur feuille de route — planning consolidé personnes × jours." },
    ],
  }),
  component: FeuilleRoutePage,
});

function FeuilleRoutePage() {
  const [weekStart] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const weekEnd = addDays(weekStart, 6);
  const { employes, loading, error } = usePlanningData(weekStart, weekEnd);
  const { vehicules } = useVehicules();

  return (
    <div className="h-full overflow-y-auto p-3 sm:p-6">
      <PageBreadcrumbs
        steps={[{ label: "Outils" }, { label: "Feuille de route" }]}
        className="mb-3"
      />
      <div className="mb-4 flex items-center gap-2 sm:gap-3">
        <ClipboardList className="h-5 w-5 shrink-0 text-primary sm:h-6 sm:w-6" />
        <h1 className="text-lg font-bold sm:text-2xl">Feuille de route</h1>
      </div>

      {error && (
        <div className="mb-3 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          Erreur de chargement : {error}
        </div>
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <FeuilleRouteTableurView employes={employes} vehicules={vehicules} />
      )}
    </div>
  );
}
