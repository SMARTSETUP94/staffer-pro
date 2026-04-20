import { useMemo } from "react";
import { MapPin, Clock, StickyNote, Briefcase, Hourglass, Check, X, ArrowLeftRight } from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Assignation, Metier, Affaire } from "@/hooks/use-planning-data";

interface Props {
  assignations: Assignation[];
  metiersById: Map<number, Metier>;
  affairesById: Map<string, Affaire>;
  compact?: boolean;
  /** Si fourni, active le drag des badges via dnd-kit. */
  dnd?: {
    employeId: string;
    date: string; // yyyy-MM-dd
  };
  /** Ids d'assignations actuellement engagées dans une demande de swap "en cours" */
  swapAssignationIds?: Set<string>;
}

type Slot = "AM" | "PM" | "JOURNEE";
type ConfStatus = "non_requise" | "en_attente" | "confirmee" | "refusee" | "mixte";

interface Group {
  key: string;
  affaire_id: string;
  metier_id: number;
  slot: Slot;
  heures: number;
  items: Assignation[];
  notes: string[];
  confStatus: ConfStatus;
  hasSwap: boolean;
}

export interface DragGroupPayload {
  type: "assignation-group";
  fromEmployeId: string;
  fromDate: string;
  affaire_id: string;
  metier_id: number;
  slot: Slot;
  assignationIds: string[];
}

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
export function AssignationCell({ assignations, metiersById, affairesById, compact, dnd, swapAssignationIds }: Props) {
  const groups = useMemo<Group[]>(() => {
    if (assignations.length === 0) return [];
    const byKey = new Map<string, Assignation[]>();
    assignations.forEach((a) => {
      const k = `${a.affaire_id}::${a.metier_id}`;
      const arr = byKey.get(k) ?? [];
      arr.push(a);
      byKey.set(k, arr);
    });
    const result: Group[] = [];
    byKey.forEach((items, key) => {
      const slots = new Set(items.map((i) => i.demi_journee));
      let slot: Slot;
      if (slots.has("JOURNEE") || (slots.has("AM") && slots.has("PM"))) slot = "JOURNEE";
      else if (slots.has("AM")) slot = "AM";
      else slot = "PM";
      const heures = items.reduce((s, i) => s + Number(i.heures || 0), 0);
      const notes = items.map((i) => i.notes).filter((n): n is string => !!n);
      // Agrégation statut confirmation
      const statusSet = new Set(items.map((i) => i.statut_confirmation ?? "non_requise"));
      let confStatus: ConfStatus = "non_requise";
      if (statusSet.size === 1) confStatus = items[0].statut_confirmation ?? "non_requise";
      else {
        // Priorité visuelle : refusée > en_attente > confirmée > non_requise
        if (statusSet.has("refusee")) confStatus = "refusee";
        else if (statusSet.has("en_attente")) confStatus = "en_attente";
        else if (statusSet.has("confirmee")) confStatus = "mixte";
        else confStatus = "non_requise";
      }
      const hasSwap = swapAssignationIds
        ? items.some((i) => swapAssignationIds.has(i.id))
        : false;
      result.push({
        key,
        affaire_id: items[0].affaire_id,
        metier_id: items[0].metier_id,
        slot,
        heures,
        items,
        notes,
        confStatus,
        hasSwap,
      });
    });
    const order: Record<Slot, number> = { JOURNEE: 0, AM: 1, PM: 2 };
    result.sort((a, b) => order[a.slot] - order[b.slot]);
    return result;
  }, [assignations, swapAssignationIds]);

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
        {groups.map((g) => (
          <DraggableBadge
            key={g.key}
            group={g}
            metier={metiersById.get(g.metier_id)}
            affaire={affairesById.get(g.affaire_id)}
            getReadableTextColor={getReadableTextColor}
            dnd={dnd}
          />
        ))}
      </div>
    </TooltipProvider>
  );
}

interface DraggableBadgeProps {
  group: Group;
  metier?: Metier;
  affaire?: Affaire;
  getReadableTextColor: (hex: string) => string;
  dnd?: { employeId: string; date: string };
}

function DraggableBadge({ group: g, metier, affaire, getReadableTextColor, dnd }: DraggableBadgeProps) {
  const couleur = metier?.couleur ?? "#94a3b8";
  const textColor = getReadableTextColor(couleur);
  const slotLabel = g.slot === "JOURNEE" ? "J" : g.slot;

  const dragId = dnd ? `drag::${dnd.employeId}::${dnd.date}::${g.key}` : g.key;
  const payload: DragGroupPayload | undefined = dnd
    ? {
        type: "assignation-group",
        fromEmployeId: dnd.employeId,
        fromDate: dnd.date,
        affaire_id: g.affaire_id,
        metier_id: g.metier_id,
        slot: g.slot,
        assignationIds: g.items.map((i) => i.id),
      }
    : undefined;

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: dragId,
    data: payload,
    disabled: !dnd,
  });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          ref={setNodeRef}
          {...(dnd ? attributes : {})}
          {...(dnd ? listeners : {})}
          className={cn(
            "group relative rounded px-1.5 py-1 text-[10px] font-semibold leading-tight shadow-sm transition-all hover:shadow-md hover:brightness-110",
            dnd ? "cursor-grab active:cursor-grabbing" : "cursor-default",
            g.slot === "AM" && "mb-0",
            g.slot === "PM" && "mt-0",
            isDragging && "opacity-40",
          )}
          style={{
            backgroundColor: couleur,
            color: textColor,
            transform: transform ? CSS.Translate.toString(transform) : undefined,
            zIndex: isDragging ? 50 : undefined,
          }}
          onClick={(e) => {
            // Empêche le clic sur le badge de remonter à la cellule (ouverture dialog par cellule)
            // Le dialog d'édition s'ouvre quand même via le clic sur la cellule mère ; ici on stoppe
            // la propagation seulement si le drag a réellement eu lieu (dnd-kit gère déjà l'activationConstraint).
            if (!dnd) return;
            e.stopPropagation();
          }}
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
            {dnd && (
              <div className="border-t pt-1.5 text-[10px] italic text-muted-foreground">
                Glisser pour déplacer · Alt + glisser pour dupliquer
              </div>
            )}
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
}
