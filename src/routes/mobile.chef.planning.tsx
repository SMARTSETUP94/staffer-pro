import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, addWeeks, format, startOfWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { ChefMobileHeader } from "@/components/mobile-chef/ChefMobileHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/mobile/chef/planning")({
  head: () => ({ meta: [{ title: "Hub chef — Planning" }] }),
  component: () => (
    <RoleGuard required="chef_or_admin">
      <ChefPlanning />
    </RoleGuard>
  ),
});

interface AssigRow {
  id: string;
  date: string;
  demi_journee: "AM" | "PM" | "JOURNEE";
  employe_id: string;
  employe_nom: string;
  affaire_numero: string;
  affaire_nom: string;
}

function ChefPlanning() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const dStart = format(weekStart, "yyyy-MM-dd");
  const dEnd = format(addDays(weekStart, 6), "yyyy-MM-dd");

  const q = useQuery<AssigRow[]>({
    queryKey: ["chef-planning", dStart, dEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignations")
        .select(`
          id, date, demi_journee, employe_id,
          employes:employe_id (prenom, nom),
          affaires:affaire_id (numero, nom)
        `)
        .gte("date", dStart)
        .lte("date", dEnd)
        .order("date");
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({
        id: r.id,
        date: r.date,
        demi_journee: r.demi_journee,
        employe_id: r.employe_id,
        employe_nom: r.employes ? `${r.employes.prenom ?? ""} ${r.employes.nom ?? ""}`.trim() : "?",
        affaire_numero: r.affaires?.numero ?? "",
        affaire_nom: r.affaires?.nom ?? "",
      }));
    },
  });

  const byDay = useMemo(() => {
    const m = new Map<string, AssigRow[]>();
    for (const r of q.data ?? []) {
      const k = r.date;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return m;
  }, [q.data]);

  return (
    <>
      <ChefMobileHeader title="Mon planning équipe" />
      <div className="mx-auto max-w-xl space-y-3 p-4">
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={() => setWeekStart((w) => addWeeks(w, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold">
            Sem. {format(weekStart, "w", { locale: fr })} · {format(weekStart, "d MMM", { locale: fr })}
            {" → "}
            {format(addDays(weekStart, 6), "d MMM", { locale: fr })}
          </span>
          <Button variant="outline" size="sm" onClick={() => setWeekStart((w) => addWeeks(w, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {q.isLoading
          ? <Skeleton className="h-64 w-full" />
          : days.map((d) => {
              const k = format(d, "yyyy-MM-dd");
              const rows = byDay.get(k) ?? [];
              return (
                <Card key={k}>
                  <CardContent className="p-3">
                    <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                      {format(d, "EEEE d MMMM", { locale: fr })}
                    </div>
                    {rows.length === 0 ? (
                      <p className="text-xs text-muted-foreground">—</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {rows.map((r) => (
                          <li key={r.id} className="flex items-start justify-between gap-2 text-sm">
                            <div className="min-w-0">
                              <div className="font-semibold truncate">{r.employe_nom}</div>
                              <div className="text-xs text-muted-foreground truncate">
                                <span className="font-mono">{r.affaire_numero}</span> · {r.affaire_nom}
                              </div>
                            </div>
                            <span className="text-[10px] font-semibold rounded bg-muted px-1.5 py-0.5 shrink-0">
                              {r.demi_journee === "JOURNEE" ? "J" : r.demi_journee}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              );
            })}
      </div>
    </>
  );
}
