import { Fragment as FragmentGroup, useMemo } from "react";
import { addDays, format } from "date-fns";
import { fr } from "date-fns/locale";
import type { Affaire, Assignation, Employe, Metier } from "@/hooks/use-planning-data";
import { AssignationCell } from "./AssignationCell";
import { cn } from "@/lib/utils";

interface Props {
  weekStart: Date;
  employes: Employe[];
  metiers: Metier[];
  affaires: Affaire[];
  assignations: Assignation[];
  /** Filtre IDs employés à afficher (déjà filtrés par contrat dans le parent) */
  filterAffaireIds?: Set<string>;
  filterMetierIds?: Set<number>;
  /** Empty state title selon contrat */
  emptyMessage: string;
}

export function PlanningGrid({
  weekStart,
  employes,
  metiers,
  affaires,
  assignations,
  filterAffaireIds,
  filterMetierIds,
  emptyMessage,
}: Props) {
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart.getTime()],
  );

  const metiersById = useMemo(() => new Map(metiers.map((m) => [m.id, m])), [metiers]);
  const affairesById = useMemo(() => new Map(affaires.map((a) => [a.id, a])), [affaires]);

  // Filtrage des assignations selon les filtres globaux
  const filteredAssignations = useMemo(() => {
    return assignations.filter((a) => {
      if (filterAffaireIds && filterAffaireIds.size > 0 && !filterAffaireIds.has(a.affaire_id)) return false;
      if (filterMetierIds && filterMetierIds.size > 0 && !filterMetierIds.has(a.metier_id)) return false;
      return true;
    });
  }, [assignations, filterAffaireIds, filterMetierIds]);

  // Regroupement employés par métier principal
  const grouped = useMemo(() => {
    const groups = new Map<number, Employe[]>();
    employes.forEach((e) => {
      const arr = groups.get(e.metier_principal_id) ?? [];
      arr.push(e);
      groups.set(e.metier_principal_id, arr);
    });
    // Ordre métiers
    return metiers
      .filter((m) => groups.has(m.id))
      .map((m) => ({ metier: m, employes: groups.get(m.id) ?? [] }));
  }, [employes, metiers]);

  if (employes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full min-w-[900px] border-collapse text-xs">
        <thead className="bg-muted/50">
          <tr>
            <th className="sticky left-0 z-10 w-[200px] border-b bg-muted/50 p-2 text-left font-semibold">
              Employé
            </th>
            {days.map((d) => (
              <th key={d.toISOString()} className="border-b border-l p-2 text-center font-semibold">
                <div className="text-[11px] uppercase">{format(d, "EEE", { locale: fr })}</div>
                <div className="text-[10px] font-normal text-muted-foreground">{format(d, "dd/MM")}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grouped.map(({ metier, employes: emps }) => (
            <FragmentGroup key={metier.id}>
              <tr>
                <td
                  colSpan={8}
                  className="border-b border-t bg-muted/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: metier.couleur }}
                >
                  <span
                    className="mr-2 inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: metier.couleur }}
                  />
                  {metier.libelle} ({emps.length})
                </td>
              </tr>
              {emps.map((emp) => (
                <tr key={emp.id} className="hover:bg-muted/30">
                  <td className="sticky left-0 z-10 border-b bg-card p-2 hover:bg-muted/30">
                    <div className="font-semibold">
                      {emp.prenom} {emp.nom}
                    </div>
                    {emp.type_contrat !== "CDI" && (
                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                        {emp.sous_type_contrat || emp.type_contrat}
                        {emp.agence_interim && ` · ${emp.agence_interim}`}
                      </div>
                    )}
                  </td>
                  {days.map((d) => {
                    const dayStr = format(d, "yyyy-MM-dd");
                    const dayAssigns = filteredAssignations.filter(
                      (a) => a.employe_id === emp.id && a.date === dayStr,
                    );
                    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                    return (
                      <td
                        key={d.toISOString()}
                        className={cn(
                          "border-b border-l align-top",
                          isWeekend && "bg-muted/20",
                        )}
                      >
                        <AssignationCell
                          assignations={dayAssigns}
                          metiersById={metiersById}
                          affairesById={affairesById}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </FragmentGroup>
          ))}
        </tbody>
      </table>
    </div>
  );
}
