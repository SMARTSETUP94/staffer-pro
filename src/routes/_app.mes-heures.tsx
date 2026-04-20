import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { startOfWeek } from "date-fns";
import { Clock } from "lucide-react";
import { WeekPicker } from "@/components/planning/WeekPicker";
import { MesHeuresGrid } from "@/components/heures/MesHeuresGrid";

export const Route = createFileRoute("/_app/mes-heures")({
  head: () => ({ meta: [{ title: "Mes heures — Planning chantiers" }] }),
  component: MesHeuresPage,
});

function MesHeuresPage() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));

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

      <MesHeuresGrid weekStart={weekStart} variant="desktop" />
    </div>
  );
}
