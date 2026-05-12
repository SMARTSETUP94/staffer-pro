import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { usePreview } from "@/lib/preview-context";
import { useResolvedEmploye } from "@/hooks/use-resolved-employe";
import { PreviewBanner } from "@/components/PreviewBanner";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { LogoutConfirmButton } from "@/components/mobile/LogoutConfirmButton";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/mobile/aujourdhui")({
  head: () => ({ meta: [{ title: "Ma semaine — Setup Paris" }] }),
  component: MobileSemaine,
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
  objets: { reference: string; nom: string }[];
}

function MobileSemaine() {
  const { user, signOut } = useAuth();
  const { isPreviewing, setPreviewRole } = usePreview();
  const { employe, employeId, resolved: employeResolved } = useResolvedEmploye();
  const employeNom = employe ? `${employe.prenom} ${employe.nom}` : "";
  const navigate = useNavigate();

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [assignations, setAssignations] = useState<AssignationLite[]>([]);
  const [loading, setLoading] = useState(true);

  const weekEnd = useMemo(() => endOfWeek(weekStart, { weekStartsOn: 1 }), [weekStart]);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  // Si résolution terminée sans employé : on arrête le loading
  useEffect(() => {
    if (employeResolved && !employeId) setLoading(false);
  }, [employeResolved, employeId]);

  // Charger les assignations de la semaine
  useEffect(() => {
    if (!employeId) return;
    setLoading(true);
    const startStr = format(weekStart, "yyyy-MM-dd");
    const endStr = format(weekEnd, "yyyy-MM-dd");
    supabase
      .from("assignations")
      .select(
        "id, date, demi_journee, heures, notes, metier_id, affaire:affaires(numero, nom, lieu), metier:metiers(libelle, couleur), assignation_objets(objet:fabrication_objets(reference, nom))",
      )
      .eq("employe_id", employeId)
      .gte("date", startStr)
      .lte("date", endStr)
      .order("date")
      .then(({ data }) => {
        const rows = (data ?? []).map((a) => {
          const links = (a as unknown as { assignation_objets?: { objet: { reference: string; nom: string } | null }[] })
            .assignation_objets ?? [];
          return {
            ...(a as unknown as AssignationLite),
            objets: links
              .map((l) => l.objet)
              .filter((o): o is { reference: string; nom: string } => o !== null),
          };
        });
        setAssignations(rows);
        setLoading(false);
      });
  }, [employeId, weekStart, weekEnd]);

  const handleQuitPreview = () => {
    setPreviewRole(null);
    navigate({ to: "/planning" });
  };

  const totalHeuresSemaine = assignations.reduce((acc, a) => acc + Number(a.heures || 0), 0);

  return (
    <div className="min-h-screen bg-background pb-20">
      <PreviewBanner />

      <header className="border-b border-border bg-card px-4 py-4">
        <div className="mx-auto flex max-w-md items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="overline">— Ma semaine</p>
            <h1 className="mt-1 text-xl font-bold tracking-tight text-foreground">
              {employeNom || user?.email}
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {totalHeuresSemaine}h planifiées cette semaine
            </p>
          </div>
          {isPreviewing ? (
            <Button size="sm" variant="outline" onClick={handleQuitPreview}>
              Quitter
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => signOut()}>
              Déconnexion
            </Button>
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
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Chargement…
          </div>
        ) : assignations.length === 0 ? (
          <section className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Inbox className="h-6 w-6 text-muted-foreground" />
            </div>
            <h2 className="text-base font-semibold text-foreground">
              Aucune assignation cette semaine
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Vos affectations chantier apparaîtront ici dès qu'un chef d'équipe vous aura planifié.
            </p>
          </section>
        ) : (
          <ul className="space-y-3">
            {days.map((day) => {
              const dayAssigns = assignations.filter((a) => isSameDay(new Date(a.date), day));
              const today = isToday(day);
              return (
                <li
                  key={day.toISOString()}
                  className={cn(
                    "rounded-2xl border bg-card p-3",
                    today ? "border-primary/40 ring-1 ring-primary/20" : "border-border",
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
                        {format(day, "EEEE", { locale: fr })}
                      </span>
                      <span className="text-sm font-bold capitalize text-foreground">
                        {format(day, "d MMM", { locale: fr })}
                      </span>
                      {today && (
                        <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
                          Aujourd'hui
                        </span>
                      )}
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
                            {a.objets.length > 0 && (
                              <ul className="mt-1 space-y-0.5 rounded-md border border-border/40 bg-muted/30 p-1.5">
                                {a.objets.map((o, i) => (
                                  <li key={i} className="flex items-baseline gap-1.5 text-[10px]">
                                    <span className="font-mono font-semibold text-foreground">
                                      {o.reference}
                                    </span>
                                    <span className="truncate text-muted-foreground">
                                      {o.nom}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
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
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-6 flex items-center justify-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
          <CalendarDays className="h-3 w-3" />
          MVP — saisie d'heures à venir
        </p>
      </main>

      <MobileBottomNav />
    </div>
  );
}
