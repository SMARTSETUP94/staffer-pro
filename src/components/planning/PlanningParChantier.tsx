import { useMemo } from "react";
import { addDays, format } from "date-fns";
import { fr } from "date-fns/locale";
import { Briefcase, MapPin, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  Affaire,
  Assignation,
  DevisConsommation,
  Employe,
  Metier,
} from "@/hooks/use-planning-data";

interface Props {
  weekStart: Date;
  affaires: Affaire[];
  employes: Employe[];
  metiers: Metier[];
  assignations: Assignation[];
  consommation: DevisConsommation[];
  showWeekend?: boolean;
  filterAffaireIds?: Set<string>;
  filterMetierIds?: Set<number>;
  onSelectAffaire?: (affaireId: string) => void;
}

/** Vue planning pivotée : lignes = chantiers actifs cette semaine, colonnes = jours,
 *  cellules = chips employés affectés ce jour-là sur ce chantier. */
export function PlanningParChantier({
  weekStart,
  affaires,
  employes,
  metiers,
  assignations,
  consommation,
  showWeekend = false,
  filterAffaireIds,
  filterMetierIds,
  onSelectAffaire,
}: Props) {
  const days = useMemo(
    () => Array.from({ length: showWeekend ? 7 : 5 }, (_, i) => addDays(weekStart, i)),
    [weekStart.getTime(), showWeekend],
  );

  const employesById = useMemo(
    () => new Map(employes.map((e) => [e.id, e])),
    [employes],
  );
  const metiersById = useMemo(
    () => new Map(metiers.map((m) => [m.id, m])),
    [metiers],
  );

  // Affaires actives = celles avec assignations dans la semaine OU heures budgétées
  const affairesActives = useMemo(() => {
    const ids = new Set<string>();
    assignations.forEach((a) => ids.add(a.affaire_id));
    consommation.forEach((c) => ids.add(c.affaire_id));
    let list = affaires.filter((a) => ids.has(a.id));
    if (filterAffaireIds && filterAffaireIds.size > 0) {
      list = list.filter((a) => filterAffaireIds.has(a.id));
    }
    return list.sort((a, b) => a.numero.localeCompare(b.numero));
  }, [affaires, assignations, consommation, filterAffaireIds]);

  // Index des assignations par (affaire_id, date)
  const assignByCell = useMemo(() => {
    const map = new Map<string, Assignation[]>();
    assignations.forEach((a) => {
      if (filterMetierIds && filterMetierIds.size > 0 && !filterMetierIds.has(a.metier_id)) {
        return;
      }
      const k = `${a.affaire_id}::${a.date}`;
      const arr = map.get(k) ?? [];
      arr.push(a);
      map.set(k, arr);
    });
    return map;
  }, [assignations, filterMetierIds]);

  // Total personnes uniques par affaire sur la semaine
  const totalPersonnesByAffaire = useMemo(() => {
    const map = new Map<string, number>();
    affairesActives.forEach((af) => {
      const set = new Set<string>();
      days.forEach((d) => {
        const dayStr = format(d, "yyyy-MM-dd");
        const arr = assignByCell.get(`${af.id}::${dayStr}`) ?? [];
        arr.forEach((a) => set.add(a.employe_id));
      });
      map.set(af.id, set.size);
    });
    return map;
  }, [affairesActives, assignByCell, days]);

  if (affairesActives.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Aucun chantier actif cette semaine.
        </p>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[900px] border-collapse text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="sticky left-0 z-10 w-[260px] border-b bg-muted/50 p-2 text-left font-semibold">
                Chantier
              </th>
              {days.map((d) => (
                <th
                  key={d.toISOString()}
                  className="border-b border-l p-2 text-center font-semibold"
                >
                  <div className="text-[11px] uppercase">
                    {format(d, "EEE", { locale: fr })}
                  </div>
                  <div className="text-[10px] font-normal text-muted-foreground">
                    {format(d, "dd/MM")}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {affairesActives.map((af) => {
              const totalPers = totalPersonnesByAffaire.get(af.id) ?? 0;
              return (
                <tr key={af.id} className="hover:bg-muted/30">
                  <td className="sticky left-0 z-10 border-b bg-card p-2 align-top hover:bg-muted/30">
                    <button
                      type="button"
                      className={cn(
                        "block w-full text-left",
                        onSelectAffaire && "cursor-pointer",
                      )}
                      onClick={() => onSelectAffaire?.(af.id)}
                      title={
                        onSelectAffaire
                          ? "Filtrer le planning par cette affaire"
                          : undefined
                      }
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-bold">
                          {af.numero}
                        </span>
                        <span
                          className="ml-auto inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary"
                          title={`${totalPers} personne${totalPers > 1 ? "s" : ""} sur la semaine`}
                        >
                          <Users className="h-2.5 w-2.5" /> {totalPers}
                        </span>
                      </div>
                      <div className="mt-1 truncate text-xs font-semibold leading-tight">
                        {af.nom}
                      </div>
                      {(af.client || af.lieu) && (
                        <div className="mt-0.5 flex flex-col gap-0.5 text-[10px] text-muted-foreground">
                          {af.client && (
                            <div className="flex items-center gap-1 truncate">
                              <Briefcase className="h-2.5 w-2.5 shrink-0" />
                              <span className="truncate">{af.client}</span>
                            </div>
                          )}
                          {af.lieu && (
                            <div className="flex items-center gap-1 truncate">
                              <MapPin className="h-2.5 w-2.5 shrink-0" />
                              <span className="truncate">{af.lieu}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </button>
                  </td>
                  {days.map((d) => {
                    const dayStr = format(d, "yyyy-MM-dd");
                    const cellAssigns = assignByCell.get(`${af.id}::${dayStr}`) ?? [];
                    // Group par employé pour fusionner AM/PM
                    const byEmploye = new Map<string, Assignation[]>();
                    cellAssigns.forEach((a) => {
                      const arr = byEmploye.get(a.employe_id) ?? [];
                      arr.push(a);
                      byEmploye.set(a.employe_id, arr);
                    });
                    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                    return (
                      <td
                        key={d.toISOString()}
                        className={cn(
                          "border-b border-l align-top",
                          isWeekend && "bg-muted/20",
                        )}
                      >
                        <div className="flex flex-wrap gap-1 p-1">
                          {Array.from(byEmploye.entries()).map(([empId, arr]) => {
                            const emp = employesById.get(empId);
                            if (!emp) return null;
                            const slots = new Set(arr.map((a) => a.demi_journee));
                            let slotLabel = "";
                            if (slots.has("JOURNEE") || (slots.has("AM") && slots.has("PM"))) {
                              slotLabel = "J";
                            } else if (slots.has("AM")) slotLabel = "AM";
                            else slotLabel = "PM";
                            const metier = metiersById.get(arr[0].metier_id);
                            const heures = arr.reduce(
                              (s, a) => s + Number(a.heures || 0),
                              0,
                            );
                            return (
                              <Tooltip key={empId}>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center gap-1 rounded-full border bg-card px-1.5 py-0.5 text-[10px] font-medium shadow-sm hover:bg-muted">
                                    <span
                                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                                      style={{
                                        backgroundColor: metier?.couleur ?? "#94a3b8",
                                      }}
                                      aria-hidden
                                    />
                                    <span className="truncate max-w-[110px]">
                                      {emp.prenom} {emp.nom.charAt(0)}.
                                    </span>
                                    <span className="rounded bg-muted px-1 text-[9px] font-bold">
                                      {slotLabel}
                                    </span>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent
                                  side="top"
                                  className="border bg-white p-2 text-xs text-gray-900 shadow-lg"
                                >
                                  <div className="font-semibold">
                                    {emp.prenom} {emp.nom}
                                  </div>
                                  <div className="text-gray-600">
                                    {metier?.libelle ?? "—"} · {heures}h ·{" "}
                                    {slotLabel === "J" ? "Journée" : slotLabel}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            );
                          })}
                          {byEmploye.size === 0 && (
                            <div className="min-h-[24px] w-full" />
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </TooltipProvider>
  );
}
