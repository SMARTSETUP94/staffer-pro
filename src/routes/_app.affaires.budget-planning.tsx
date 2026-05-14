import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { startOfWeek, addDays } from "date-fns";
import { Calendar, Loader2 } from "lucide-react";
import { usePlanningData } from "@/hooks/use-planning-data";
import { WeekPicker } from "@/components/planning/WeekPicker";
import { PlanningSynthese } from "@/components/planning/PlanningSynthese";
import { PageBreadcrumbs } from "@/components/PageBreadcrumbs";

export const Route = createFileRoute("/_app/affaires/budget-planning")({
  head: () => ({
    meta: [
      { title: "Budget chantier — Planning" },
      { name: "description", content: "Synthèse budget-vs-staffing par chantier sur la semaine." },
    ],
  }),
  component: BudgetPlanningPage,
});

function BudgetPlanningPage() {
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const weekEnd = addDays(weekStart, 6);
  const { metiers, employes, affaires, assignations, consommation, chefsById, loading, error } =
    usePlanningData(weekStart, weekEnd);

  return (
    <div className="h-full overflow-y-auto p-3 sm:p-6">
      <PageBreadcrumbs
        steps={[{ label: "Chantiers", to: "/affaires" }, { label: "Budget chantier" }]}
        className="mb-3"
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 sm:gap-3">
          <Calendar className="h-5 w-5 shrink-0 text-primary sm:h-6 sm:w-6" />
          <h1 className="text-lg font-bold sm:text-2xl">Budget chantier</h1>
        </div>
        <WeekPicker weekStart={weekStart} onChange={setWeekStart} />
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
        <PlanningSynthese
          weekStart={weekStart}
          affaires={affaires}
          employes={employes}
          metiers={metiers}
          assignations={assignations}
          consommation={consommation}
          chefsById={chefsById}
        />
      )}
    </div>
  );
}
