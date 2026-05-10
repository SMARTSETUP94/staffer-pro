/**
 * v0.43.0 Sprint 1 — Planning hebdo Hub chef mobile.
 * Scope = mes_affaires_chef. Filtre affaire + métier (multi-select simple).
 * Tap sur jour : ouvre détail journée (équipe prévue + affaires).
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, addWeeks, format, startOfWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { ChefMobileHeader } from "@/components/mobile-chef/ChefMobileHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useMesAffairesChef } from "@/hooks/use-mes-affaires-chef";

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
  employe_metier: number | null;
  affaire_id: string;
  affaire_numero: string;
  affaire_nom: string;
}

function ChefPlanning() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [filterAffaire, setFilterAffaire] = useState<string>("__all__");
  const [filterMetier, setFilterMetier] = useState<string>("__all__");
  const [openDay, setOpenDay] = useState<string | null>(null);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const dStart = format(weekStart, "yyyy-MM-dd");
  const dEnd = format(addDays(weekStart, 6), "yyyy-MM-dd");

  const { data: affaires } = useMesAffairesChef();
  const affaireIds = useMemo(() => (affaires ?? []).map((a) => a.id), [affaires]);

  const metiersQ = useQuery({
    queryKey: ["metiers-list"],
    queryFn: async () => {
      const { data } = await supabase.from("metiers").select("id, libelle").order("libelle");
      return data ?? [];
    },
  });

  const q = useQuery<AssigRow[]>({
    queryKey: ["chef-planning", dStart, dEnd, affaireIds.length],
    enabled: affaireIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignations")
        .select(`
          id, date, demi_journee, employe_id, affaire_id,
          employes:employe_id (prenom, nom, metier_principal_id),
          affaires:affaire_id (numero, nom)
        `)
        .in("affaire_id", affaireIds)
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
        employe_metier: r.employes?.metier_principal_id ?? null,
        affaire_id: r.affaire_id,
        affaire_numero: r.affaires?.numero ?? "",
        affaire_nom: r.affaires?.nom ?? "",
      }));
    },
  });

  const filtered = useMemo(() => {
    let list = q.data ?? [];
    if (filterAffaire !== "__all__") list = list.filter((r) => r.affaire_id === filterAffaire);
    if (filterMetier !== "__all__") {
      const mid = Number(filterMetier);
      list = list.filter((r) => r.employe_metier === mid);
    }
    return list;
  }, [q.data, filterAffaire, filterMetier]);

  const byDay = useMemo(() => {
    const m = new Map<string, AssigRow[]>();
    for (const r of filtered) {
      if (!m.has(r.date)) m.set(r.date, []);
      m.get(r.date)!.push(r);
    }
    return m;
  }, [filtered]);

  const activeFilters = (filterAffaire !== "__all__" ? 1 : 0) + (filterMetier !== "__all__" ? 1 : 0);

  return (
    <>
      <ChefMobileHeader title="Planning équipe" />
      <div className="mx-auto max-w-xl space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
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

        {/* Filtres */}
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="w-full justify-between">
              <span className="flex items-center gap-2">
                <Filter className="h-3.5 w-3.5" /> Filtres
              </span>
              {activeFilters > 0 && <Badge variant="secondary">{activeFilters}</Badge>}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="space-y-4">
            <SheetHeader><SheetTitle>Filtres</SheetTitle></SheetHeader>
            <div className="space-y-2">
              <label className="text-xs font-semibold">Affaire</label>
              <Select value={filterAffaire} onValueChange={setFilterAffaire}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Toutes mes affaires</SelectItem>
                  {(affaires ?? []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.numero} · {a.nom}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold">Métier</label>
              <Select value={filterMetier} onValueChange={setFilterMetier}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Tous métiers</SelectItem>
                  {(metiersQ.data ?? []).map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>{m.libelle}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {activeFilters > 0 && (
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => { setFilterAffaire("__all__"); setFilterMetier("__all__"); }}
              >
                Réinitialiser les filtres
              </Button>
            )}
          </SheetContent>
        </Sheet>

        {affaireIds.length === 0 && !q.isLoading ? (
          <Card><CardContent className="p-4 text-sm text-muted-foreground">
            Vous n'êtes chef sur aucune affaire pour le moment.
          </CardContent></Card>
        ) : q.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          days.map((d) => {
            const k = format(d, "yyyy-MM-dd");
            const rows = byDay.get(k) ?? [];
            return (
              <button
                key={k}
                type="button"
                onClick={() => rows.length > 0 && setOpenDay(k)}
                className="w-full text-left"
              >
                <Card className={rows.length > 0 ? "hover:bg-accent transition-colors" : ""}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                      <span>{format(d, "EEEE d MMMM", { locale: fr })}</span>
                      <span className="tabular-nums">{rows.length}</span>
                    </div>
                    {rows.length === 0 ? (
                      <p className="text-xs text-muted-foreground">—</p>
                    ) : (
                      <ul className="space-y-1">
                        {rows.slice(0, 5).map((r) => (
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
                        {rows.length > 5 && (
                          <li className="text-[11px] text-muted-foreground text-center">
                            + {rows.length - 5} autre{rows.length - 5 > 1 ? "s" : ""}…
                          </li>
                        )}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </button>
            );
          })
        )}
      </div>

      {/* Détail journée */}
      <Sheet open={!!openDay} onOpenChange={(o) => !o && setOpenDay(null)}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {openDay ? format(new Date(openDay + "T00:00"), "EEEE d MMMM", { locale: fr }) : ""}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-3 space-y-2">
            {openDay && (byDay.get(openDay) ?? []).map((r) => (
              <Link
                key={r.id}
                to="/affaires/$affaireId"
                params={{ affaireId: r.affaire_id }}
                className="flex items-start justify-between gap-2 rounded-md border p-2 hover:bg-accent"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{r.employe_nom}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    <span className="font-mono">{r.affaire_numero}</span> · {r.affaire_nom}
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {r.demi_journee === "JOURNEE" ? "Journée" : r.demi_journee}
                </Badge>
              </Link>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
