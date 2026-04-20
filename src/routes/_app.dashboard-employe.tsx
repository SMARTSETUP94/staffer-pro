import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  addDays,
  endOfWeek,
  format,
  isSameDay,
  isToday,
  startOfWeek,
} from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight, Inbox, Loader2, MapPin } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useResolvedEmploye } from "@/hooks/use-resolved-employe";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/dashboard-employe")({
  head: () => ({ meta: [{ title: "Ma semaine — Setup Paris" }] }),
  component: DashboardEmployePage,
});

interface AssignationLite {
  id: string;
  date: string;
  demi_journee: "AM" | "PM" | "JOURNEE";
  heures: number;
  notes: string | null;
  metier_id: number;
  affaire: { numero: string; nom: string; lieu: string | null } | null;
  metier: { libelle: string; couleur: string } | null;
}

function DashboardEmployePage() {
  const { user } = useAuth();
  const { employe, employeId, resolved: employeResolved } = useResolvedEmploye();
  const employeNom = employe ? `${employe.prenom} ${employe.nom}` : "";
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [assignations, setAssignations] = useState<AssignationLite[]>([]);
  const [loading, setLoading] = useState(true);

  const weekEnd = useMemo(() => endOfWeek(weekStart, { weekStartsOn: 1 }), [weekStart]);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  // Si la résolution employé est terminée mais aucun employé trouvé, on stoppe le loading.
  useEffect(() => {
    if (employeResolved && !employeId) setLoading(false);
  }, [employeResolved, employeId]);

  useEffect(() => {
    if (!employeId) return;
    setLoading(true);
    const startStr = format(weekStart, "yyyy-MM-dd");
    const endStr = format(weekEnd, "yyyy-MM-dd");
    supabase
      .from("assignations")
      .select(
        "id, date, demi_journee, heures, notes, metier_id, affaire:affaires(numero, nom, lieu), metier:metiers(libelle, couleur)",
      )
      .eq("employe_id", employeId)
      .gte("date", startStr)
      .lte("date", endStr)
      .order("date")
      .then(({ data }) => {
        setAssignations((data ?? []) as unknown as AssignationLite[]);
        setLoading(false);
      });
  }, [employeId, weekStart, weekEnd]);

  const totalHeuresSemaine = assignations.reduce((acc, a) => acc + Number(a.heures || 0), 0);

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        eyebrow="Espace employé"
        title={employeNom || user?.email || "Mon planning"}
        description={`${totalHeuresSemaine}h planifiées cette semaine`}
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="outline"
              onClick={() => setWeekStart((d) => addDays(d, -7))}
              aria-label="Semaine précédente"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex flex-col items-center px-3 min-w-[180px]">
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
              variant="outline"
              onClick={() => setWeekStart((d) => addDays(d, 7))}
              aria-label="Semaine suivante"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
            >
              Aujourd'hui
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Chargement…
        </div>
      ) : assignations.length === 0 ? (
        <Card className="border-dashed p-12 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Inbox className="h-6 w-6 text-muted-foreground" />
          </div>
          <h2 className="text-base font-semibold text-foreground">
            Aucune assignation cette semaine
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Vos affectations chantier apparaîtront ici dès qu'un chef d'équipe vous aura planifié.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-7">
          {days.map((day) => {
            const dayAssigns = assignations.filter((a) => isSameDay(new Date(a.date), day));
            const today = isToday(day);
            return (
              <Card
                key={day.toISOString()}
                className={cn(
                  "p-3",
                  today ? "border-primary/40 ring-1 ring-primary/20" : "",
                )}
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-baseline gap-2">
                    <span
                      className={cn(
                        "text-xs font-semibold uppercase tracking-wider",
                        today ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      {format(day, "EEE", { locale: fr })}
                    </span>
                    <span className="text-sm font-bold capitalize text-foreground">
                      {format(day, "d MMM", { locale: fr })}
                    </span>
                  </div>
                  {dayAssigns.length > 0 && (
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {dayAssigns.reduce((acc, a) => acc + Number(a.heures), 0)}h
                    </span>
                  )}
                </div>
                {dayAssigns.length === 0 ? (
                  <p className="text-xs text-muted-foreground">—</p>
                ) : (
                  <div className="space-y-1.5">
                    {dayAssigns.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-start gap-2 rounded-lg border border-border/60 bg-background p-2"
                      >
                        <span
                          className="mt-1 inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
                          style={{ backgroundColor: a.metier?.couleur ?? "#94a3b8" }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-mono text-xs font-bold">
                              {a.affaire?.numero ?? "—"}
                            </span>
                            <span className="text-[11px] font-semibold text-muted-foreground">
                              {a.demi_journee === "JOURNEE" ? "Journée" : a.demi_journee} ·{" "}
                              {a.heures}h
                            </span>
                          </div>
                          <p className="truncate text-xs text-foreground">
                            {a.affaire?.nom ?? ""}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {a.metier?.libelle}
                            {a.affaire?.lieu && (
                              <span className="ml-2 inline-flex items-center gap-0.5">
                                <MapPin className="h-2.5 w-2.5" />
                                {a.affaire.lieu}
                              </span>
                            )}
                          </p>
                          {a.notes && (
                            <p className="mt-1 text-[11px] italic text-muted-foreground">
                              {a.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <p className="flex items-center justify-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
        <CalendarDays className="h-3 w-3" />
        Mes heures et propositions sont accessibles depuis la sidebar
      </p>
    </div>
  );
}
