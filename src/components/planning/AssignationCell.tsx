import { cn } from "@/lib/utils";
import type { Assignation, Metier, Affaire } from "@/hooks/use-planning-data";

interface Props {
  assignations: Assignation[];
  metiersById: Map<number, Metier>;
  affairesById: Map<string, Affaire>;
  compact?: boolean;
}

/** Cellule jour — affiche les assignations AM/PM/JOURNEE empilées */
export function AssignationCell({ assignations, metiersById, affairesById, compact }: Props) {
  if (assignations.length === 0) {
    return <div className={cn("h-full w-full rounded-sm bg-muted/20", compact ? "min-h-[24px]" : "min-h-[40px]")} />;
  }

  // Tri : JOURNEE > AM > PM
  const sorted = [...assignations].sort((a, b) => {
    const order = { JOURNEE: 0, AM: 1, PM: 2 };
    return order[a.demi_journee] - order[b.demi_journee];
  });

  return (
    <div className="flex flex-col gap-0.5 p-0.5">
      {sorted.map((a) => {
        const metier = metiersById.get(a.metier_id);
        const affaire = affairesById.get(a.affaire_id);
        const couleur = metier?.couleur ?? "#94a3b8";
        return (
          <div
            key={a.id}
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-semibold leading-tight text-white shadow-sm",
              a.demi_journee === "AM" && "rounded-b-sm",
              a.demi_journee === "PM" && "rounded-t-sm",
            )}
            style={{ backgroundColor: couleur }}
            title={`${affaire?.numero ?? ""} — ${affaire?.nom ?? ""}\n${metier?.libelle ?? ""}\n${a.demi_journee} (${a.heures}h)${a.notes ? `\n${a.notes}` : ""}`}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="truncate">{affaire?.numero ?? "—"}</span>
              <span className="opacity-80 text-[9px]">
                {a.demi_journee === "JOURNEE" ? "J" : a.demi_journee}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
