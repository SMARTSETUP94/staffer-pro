import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { startOfWeek } from "date-fns";
import { Clock } from "lucide-react";
import { WeekPicker } from "@/components/planning/WeekPicker";
import { MesHeuresGrid } from "@/components/heures/MesHeuresGrid";
import { useResolvedEmploye } from "@/hooks/use-resolved-employe";
import { usePreview } from "@/lib/preview-context";
import { ScopeSelector, ScopeNotImplementedBanner, type UrlScope } from "@/components/scope/ScopeSelector";

export const Route = createFileRoute("/_app/mes-heures")({
  validateSearch: (s: Record<string, unknown>): { scope: UrlScope } => {
    const r = s.scope;
    return { scope: r === "team" || r === "all" ? r : "mine" };
  },
  head: () => ({ meta: [{ title: "Mes heures — Planning chantiers" }] }),
  component: MesHeuresPage,
});

function MesHeuresPage() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const { isEmployePreview, previewEmployeId } = usePreview();
  const { employeId } = useResolvedEmploye();
  const { scope } = Route.useSearch();
  const override = isEmployePreview ? (previewEmployeId ?? employeId) : null;

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Clock className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Mes heures</h1>
            <p className="text-sm text-muted-foreground">
              Saisissez vos heures réelles puis soumettez la semaine pour validation.
            </p>
          </div>
        </div>
        <WeekPicker weekStart={weekStart} onChange={setWeekStart} />
      </div>

      <div className="mb-4 space-y-2">
        <ScopeSelector capKey="mes_heures.view" routeId="/_app/mes-heures" />
        <ScopeNotImplementedBanner scope={scope} />
      </div>

      <MesHeuresGrid weekStart={weekStart} variant="desktop" employeIdOverride={override} />
    </div>
  );
}
