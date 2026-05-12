import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { addDays, format, startOfWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { usePreview } from "@/lib/preview-context";
import { useResolvedEmploye } from "@/hooks/use-resolved-employe";
import { PreviewBanner } from "@/components/PreviewBanner";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { Button } from "@/components/ui/button";
import { LogoutConfirmButton } from "@/components/mobile/LogoutConfirmButton";
import { MesHeuresGrid } from "@/components/heures/MesHeuresGrid";

export const Route = createFileRoute("/mobile/heures")({
  head: () => ({ meta: [{ title: "Mes heures — Setup Paris" }] }),
  component: MobileHeures,
});

function MobileHeures() {
  const { user } = useAuth();
  const { isPreviewing, setPreviewRole, isEmployePreview, previewEmployeId } = usePreview();
  const { employeId } = useResolvedEmploye();
  const override = isEmployePreview ? (previewEmployeId ?? employeId) : null;
  const navigate = useNavigate();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);

  const handleQuitPreview = () => {
    setPreviewRole(null);
    navigate({ to: "/planning" });
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <PreviewBanner />

      <header className="border-b border-border bg-card px-4 py-4">
        <div className="mx-auto flex max-w-md items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="overline">— Mes heures</p>
            <h1 className="mt-1 text-xl font-bold tracking-tight text-foreground">
              Saisie & soumission
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
          {isPreviewing ? (
            <Button size="sm" variant="outline" onClick={handleQuitPreview}>
              Quitter
            </Button>
          ) : (
            <LogoutConfirmButton />
          )}
        </div>
      </header>

      {/* Sélecteur semaine */}
      <div className="border-b border-border bg-card/50 px-4 py-2">
        <div className="mx-auto flex max-w-md items-center justify-between gap-2">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setWeekStart((d) => addDays(d, -7))}
            aria-label="Semaine précédente"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex flex-1 flex-col items-center">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Semaine {format(weekStart, "I", { locale: fr })}
            </span>
            <span className="text-sm font-semibold capitalize">
              {format(weekStart, "d MMM", { locale: fr })} –{" "}
              {format(weekEnd, "d MMM yyyy", { locale: fr })}
            </span>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setWeekStart((d) => addDays(d, 7))}
            aria-label="Semaine suivante"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="mx-auto mt-1 flex max-w-md justify-center">
          <button
            type="button"
            onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
            className="text-[10px] font-medium uppercase tracking-wider text-primary hover:underline"
          >
            Aujourd'hui
          </button>
        </div>
      </div>

      <main className="mx-auto max-w-md px-4 py-4">
        <MesHeuresGrid weekStart={weekStart} variant="mobile" employeIdOverride={override} />
      </main>

      <MobileBottomNav />
    </div>
  );
}
