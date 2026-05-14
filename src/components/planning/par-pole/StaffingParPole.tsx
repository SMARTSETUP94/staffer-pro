import { useMemo } from "react";
import { addDays, format } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { usePlanningParPole, type PoleJourRow, type PolePersonne } from "@/hooks/use-planning-par-pole";

interface Props {
  weekStart: Date;
  weekEnd: Date;
  showWeekend?: boolean;
  inclureOpportunites: boolean;
  filtresMetierIds?: number[];
  filtresStatut?: string[];
}

/**
 * v0.48 — Vue "Par pôle" simplifiée.
 * Lignes = métiers (ordre `metiers.ordre`).
 * Colonnes = jours de la semaine (lun→ven, +sam/dim si toggle).
 * Cellules = badge nb personnes ; hover = popover vignettes (chantier en dessous).
 * Personnes staffées sur 9XXX → badge "PRÉV" ambré sur la vignette.
 */
export function StaffingParPole({
  weekStart,
  weekEnd,
  showWeekend = false,
  inclureOpportunites,
  filtresMetierIds,
  filtresStatut,
}: Props) {
  const { rows, loading, error } = usePlanningParPole({
    weekStart,
    weekEnd,
    inclureOpportunites,
    filtresMetierIds,
    filtresStatut,
  });

  const days = useMemo(
    () => Array.from({ length: showWeekend ? 7 : 5 }, (_, i) => addDays(weekStart, i)),
    [weekStart.getTime(), showWeekend],
  );

  // Index : metier_id -> Map<dateISO, row>
  const { metiers, byCell } = useMemo(() => {
    const metiersMap = new Map<
      number,
      { id: number; libelle: string; couleur: string; ordre: number }
    >();
    const cellMap = new Map<string, PoleJourRow>();
    for (const r of rows) {
      if (!metiersMap.has(r.metier_id)) {
        metiersMap.set(r.metier_id, {
          id: r.metier_id,
          libelle: r.metier_libelle,
          couleur: r.metier_couleur,
          ordre: r.metier_ordre,
        });
      }
      cellMap.set(`${r.metier_id}::${r.date_jour}`, r);
    }
    const metiersList = Array.from(metiersMap.values()).sort((a, b) => a.ordre - b.ordre);
    return { metiers: metiersList, byCell: cellMap };
  }, [rows]);

  if (loading) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Chargement…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Erreur : {error}
      </div>
    );
  }
  if (metiers.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Aucun staffing cette semaine.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full min-w-[700px] border-collapse text-xs">
        <thead className="bg-muted/50">
          <tr>
            <th className="sticky left-0 z-10 w-[200px] border-b bg-muted/50 p-2 text-left font-semibold">
              Métier
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
          {metiers.map((m) => (
            <tr key={m.id} className="hover:bg-muted/30">
              <td className="sticky left-0 z-10 border-b bg-card p-2 align-middle hover:bg-muted/30">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: m.couleur || "#94a3b8" }}
                    aria-hidden
                  />
                  <span className="truncate font-medium">{m.libelle}</span>
                </div>
              </td>
              {days.map((d) => {
                const dayStr = format(d, "yyyy-MM-dd");
                const cell = byCell.get(`${m.id}::${dayStr}`);
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                return (
                  <td
                    key={d.toISOString()}
                    className={cn(
                      "border-b border-l p-2 text-center align-middle",
                      isWeekend && "bg-muted/20",
                    )}
                  >
                    {cell && cell.nb_personnes > 0 ? (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-primary/10 px-2 text-xs font-semibold text-primary hover:bg-primary/20 focus:outline-none focus:ring-2 focus:ring-primary"
                            data-testid="par-pole-cell-badge"
                            data-nb={cell.nb_personnes}
                          >
                            {cell.nb_personnes}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72 p-2" align="center">
                          <div className="mb-2 border-b pb-1.5 text-[11px] font-semibold uppercase text-muted-foreground">
                            {m.libelle} · {format(d, "EEEE dd MMM", { locale: fr })}
                          </div>
                          <ul className="space-y-1.5">
                            {cell.personnes.map((p) => (
                              <PersonneVignette key={`${p.employe_id}::${p.chantier_id}`} p={p} />
                            ))}
                          </ul>
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <span className="text-[10px] text-muted-foreground/30">·</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PersonneVignette({ p }: { p: PolePersonne }) {
  const initiales = `${(p.prenom ?? "?")[0] ?? ""}${(p.nom ?? "?")[0] ?? ""}`.toUpperCase();
  return (
    <li className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5">
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
          p.est_opportunite
            ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
            : "bg-muted text-muted-foreground",
        )}
        aria-hidden
      >
        {initiales || "?"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-xs font-semibold">
            {p.prenom} {p.nom ? `${p.nom.charAt(0)}.` : ""}
          </span>
          {p.est_opportunite && (
            <Badge
              variant="outline"
              className="h-4 border-amber-300 bg-amber-50 px-1 text-[9px] font-bold text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
            >
              PRÉV
            </Badge>
          )}
        </div>
        <div className="truncate text-[10px] text-muted-foreground">
          <span className="font-mono font-semibold">{p.chantier_numero}</span>{" "}
          · {p.chantier_nom}
        </div>
      </div>
    </li>
  );
}
