import { useMemo } from "react";
import { MapPin, Clock, StickyNote, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Assignation, Metier, Affaire } from "@/hooks/use-planning-data";

interface Props {
  assignations: Assignation[];
  metiersById: Map<number, Metier>;
  affairesById: Map<string, Affaire>;
  compact?: boolean;
}

type Slot = "AM" | "PM" | "JOURNEE";

interface Group {
  key: string;
  affaire_id: string;
  metier_id: number;
  slot: Slot;
  heures: number;
  items: Assignation[];
  notes: string[];
}

/**
 * Détermine la luminance d'une couleur hex et renvoie une couleur de texte lisible.
 * Couleur métier appliquée en fond, texte clair/sombre auto.
 */
function getReadableTextColor(hex: string): string {
  const m = hex.replace("#", "");
  if (m.length !== 6) return "#fff";
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#1e293b" : "#fff";
}

/** Cellule jour — regroupe les assignations par (affaire + métier), fusionne AM+PM en JOURNEE */
export function AssignationCell({ assignations, metiersById, affairesById, compact }: Props) {
  const groups = useMemo<Group[]>(() => {
    if (assignations.length === 0) return [];
    // 1) regrouper par affaire+métier
    const byKey = new Map<string, Assignation[]>();
    assignations.forEach((a) => {
      const k = `${a.affaire_id}::${a.metier_id}`;
      const arr = byKey.get(k) ?? [];
      arr.push(a);
      byKey.set(k, arr);
    });
    // 2) déterminer le slot (fusion AM+PM → JOURNEE)
    const result: Group[] = [];
    byKey.forEach((items, key) => {
      const slots = new Set(items.map((i) => i.demi_journee));
      let slot: Slot;
      if (slots.has("JOURNEE") || (slots.has("AM") && slots.has("PM"))) slot = "JOURNEE";
      else if (slots.has("AM")) slot = "AM";
      else slot = "PM";
      const heures = items.reduce((s, i) => s + Number(i.heures || 0), 0);
      const notes = items.map((i) => i.notes).filter((n): n is string => !!n);
      result.push({
        key,
        affaire_id: items[0].affaire_id,
        metier_id: items[0].metier_id,
        slot,
        heures,
        items,
        notes,
      });
    });
    // 3) tri : JOURNEE > AM > PM
    const order: Record<Slot, number> = { JOURNEE: 0, AM: 1, PM: 2 };
    result.sort((a, b) => order[a.slot] - order[b.slot]);
    return result;
  }, [assignations]);

  if (groups.length === 0) {
    return (
      <div
        className={cn(
          "h-full w-full rounded-sm bg-muted/10",
          compact ? "min-h-[28px]" : "min-h-[44px]",
        )}
      />
    );
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex flex-col gap-0.5 p-0.5">
        {groups.map((g) => {
          const metier = metiersById.get(g.metier_id);
          const affaire = affairesById.get(g.affaire_id);
          const couleur = metier?.couleur ?? "#94a3b8";
          const textColor = getReadableTextColor(couleur);
          const slotLabel = g.slot === "JOURNEE" ? "J" : g.slot;

          return (
            <Tooltip key={g.key}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "group relative cursor-default rounded px-1.5 py-1 text-[10px] font-semibold leading-tight shadow-sm transition-all hover:shadow-md hover:brightness-110",
                    g.slot === "AM" && "mb-0",
                    g.slot === "PM" && "mt-0",
                  )}
                  style={{ backgroundColor: couleur, color: textColor }}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate font-mono text-[10px]">
                      {affaire?.numero ?? "—"}
                    </span>
                    <span
                      className="shrink-0 rounded-sm px-1 text-[9px] font-bold opacity-90"
                      style={{
                        backgroundColor:
                          textColor === "#fff" ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.5)",
                      }}
                    >
                      {slotLabel}
                    </span>
                  </div>
                  {affaire?.nom && (
                    <div className="mt-0.5 truncate text-[9px] font-normal opacity-90">
                      {affaire.nom}
                    </div>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[280px] p-0">
                <div className="space-y-2 p-3">
                  <div className="flex items-start gap-2">
                    <span
                      className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: couleur }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] font-semibold">
                          {affaire?.numero ?? "—"}
                        </span>
                      </div>
                      {affaire?.nom && (
                        <div className="mt-1 text-xs font-semibold leading-tight">
                          {affaire.nom}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1 border-t pt-2 text-[11px]">
                    {affaire?.client && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Briefcase className="h-3 w-3 shrink-0" />
                        <span className="truncate">{affaire.client}</span>
                      </div>
                    )}
                    {affaire?.lieu && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{affaire.lieu}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: couleur }}
                      />
                      <span className="font-medium">{metier?.libelle ?? "—"}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Clock className="h-3 w-3 shrink-0" />
                      <span>
                        {g.slot === "JOURNEE" ? "Journée" : g.slot} · {g.heures}h
                      </span>
                    </div>
                  </div>

                  {g.notes.length > 0 && (
                    <div className="space-y-1 border-t pt-2 text-[11px]">
                      {g.notes.map((n, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-muted-foreground">
                          <StickyNote className="mt-0.5 h-3 w-3 shrink-0" />
                          <span className="italic">{n}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
