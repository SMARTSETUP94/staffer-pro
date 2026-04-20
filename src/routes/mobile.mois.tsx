import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { PreviewBanner } from "@/components/PreviewBanner";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/mobile/mois")({
  head: () => ({ meta: [{ title: "Mon mois — Setup Paris" }] }),
  component: MobileMois,
});

interface AssignLite {
  date: string;
  heures: number;
  affaire_id: string;
  affaire: { numero: string; nom: string; lieu: string | null } | null;
  metier: { libelle: string; couleur: string } | null;
}

function MobileMois() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [employeId, setEmployeId] = useState<string | null>(null);
  const [monthAnchor, setMonthAnchor] = useState(() => startOfMonth(new Date()));
  const [assignations, setAssignations] = useState<AssignLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<Date | null>(new Date());

  const monthStart = useMemo(() => startOfMonth(monthAnchor), [monthAnchor]);
  const monthEnd = useMemo(() => endOfMonth(monthAnchor), [monthAnchor]);
  // Grille calendrier (semaines complètes)
  const gridStart = useMemo(() => startOfWeek(monthStart, { weekStartsOn: 1 }), [monthStart]);
  const gridEnd = useMemo(() => endOfWeek(monthEnd, { weekStartsOn: 1 }), [monthEnd]);
  const days = useMemo(
    () => eachDayOfInterval({ start: gridStart, end: gridEnd }),
    [gridStart, gridEnd],
  );

  useEffect(() => {
    if (!user) return;
    supabase
      .from("employes")
      .select("id")
      .eq("profile_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setEmployeId(data.id);
        else setLoading(false);
      });
  }, [user]);

  useEffect(() => {
    if (!employeId) return;
    setLoading(true);
    supabase
      .from("assignations")
      .select(
        "date, heures, affaire_id, affaire:affaires(numero, nom, lieu), metier:metiers(libelle, couleur)",
      )
      .eq("employe_id", employeId)
      .gte("date", format(gridStart, "yyyy-MM-dd"))
      .lte("date", format(gridEnd, "yyyy-MM-dd"))
      .then(({ data }) => {
        setAssignations((data ?? []) as unknown as AssignLite[]);
        setLoading(false);
      });
  }, [employeId, gridStart, gridEnd]);

  const heuresParJour = useMemo(() => {
    const map = new Map<string, number>();
    assignations.forEach((a) => {
      map.set(a.date, (map.get(a.date) ?? 0) + Number(a.heures));
    });
    return map;
  }, [assignations]);

  const couleursParJour = useMemo(() => {
    const map = new Map<string, string[]>();
    assignations.forEach((a) => {
      const arr = map.get(a.date) ?? [];
      const c = a.metier?.couleur ?? "#94a3b8";
      if (!arr.includes(c)) arr.push(c);
      map.set(a.date, arr);
    });
    return map;
  }, [assignations]);

  const totalMois = useMemo(
    () =>
      assignations
        .filter((a) => isSameMonth(new Date(a.date), monthStart))
        .reduce((acc, a) => acc + Number(a.heures), 0),
    [assignations, monthStart],
  );

  const dayDetails = useMemo(() => {
    if (!selectedDay) return [];
    return assignations.filter((a) => isSameDay(new Date(a.date), selectedDay));
  }, [assignations, selectedDay]);

  return (
    <div className="min-h-screen bg-background pb-20">
      <PreviewBanner />

      <header className="border-b border-border bg-card px-4 py-4">
        <div className="mx-auto flex max-w-md items-center justify-between gap-2">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setMonthAnchor((d) => addMonths(d, -1))}
            aria-label="Mois précédent"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex flex-col items-center">
            <p className="overline">— Mon mois</p>
            <h1 className="text-lg font-bold tracking-tight text-foreground capitalize">
              {format(monthAnchor, "MMMM yyyy", { locale: fr })}
            </h1>
            <p className="text-[11px] text-muted-foreground">{totalMois}h planifiées</p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setMonthAnchor((d) => addMonths(d, 1))}
            aria-label="Mois suivant"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-md px-3 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Chargement…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
                <div key={i} className="py-1">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {days.map((day) => {
                const dateStr = format(day, "yyyy-MM-dd");
                const heures = heuresParJour.get(dateStr) ?? 0;
                const couleurs = couleursParJour.get(dateStr) ?? [];
                const inMonth = isSameMonth(day, monthStart);
                const today = isToday(day);
                const selected = selectedDay && isSameDay(day, selectedDay);
                return (
                  <button
                    key={dateStr}
                    type="button"
                    onClick={() => setSelectedDay(day)}
                    className={cn(
                      "flex aspect-square flex-col items-center justify-start rounded-lg border p-1 text-xs transition-colors",
                      inMonth ? "bg-card text-foreground" : "bg-muted/30 text-muted-foreground",
                      today && "border-primary",
                      selected ? "ring-2 ring-primary" : "border-border",
                    )}
                  >
                    <span className={cn("font-semibold", today && "text-primary")}>
                      {format(day, "d")}
                    </span>
                    {heures > 0 && (
                      <>
                        <span className="mt-0.5 text-[9px] font-bold text-muted-foreground">
                          {heures}h
                        </span>
                        <div className="mt-auto flex gap-0.5">
                          {couleurs.slice(0, 3).map((c, i) => (
                            <span
                              key={i}
                              className="h-1 w-1 rounded-full"
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Détail du jour sélectionné */}
            {selectedDay && (
              <section className="mt-4 rounded-2xl border border-border bg-card p-3">
                <h2 className="mb-2 text-sm font-semibold capitalize">
                  {format(selectedDay, "EEEE d MMMM", { locale: fr })}
                </h2>
                {dayDetails.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Aucune assignation ce jour.</p>
                ) : (
                  <div className="space-y-1.5">
                    {dayDetails.map((a, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 rounded-lg border border-border/60 bg-background p-2"
                      >
                        <span
                          className="mt-1 inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
                          style={{ backgroundColor: a.metier?.couleur ?? "#94a3b8" }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-mono text-xs font-bold">
                              {a.affaire?.numero}
                            </span>
                            <span className="text-[11px] text-muted-foreground">{a.heures}h</span>
                          </div>
                          <p className="truncate text-xs">{a.affaire?.nom}</p>
                          <p className="text-[11px] text-muted-foreground">{a.metier?.libelle}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>

      <MobileBottomNav />
    </div>
  );
}
