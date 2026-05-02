import { useMemo, useState } from "react";
import {
  MapPin,
  Clock,
  StickyNote,
  Briefcase,
  Hourglass,
  Check,
  X,
  ArrowLeftRight,
} from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
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
  /** Callback de suppression (ouvre popover ✕). Si absent, le bouton ✕ n'est pas rendu. */
  onDeleteGroup?: (assignationIds: string[]) => Promise<void> | void;
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
  hasAutoStaffing: boolean;
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

/** Palette pastels pour les chantiers — fond clair + texte foncé fixe. */
const PASTEL_PALETTE = [
  "#DBEAFE", // blue-100
  "#D1FAE5", // emerald-100
  "#FED7AA", // orange-200
  "#FCE7F3", // pink-100
  "#E9D5FF", // purple-200
  "#FEF3C7", // amber-100
  "#CFFAFE", // cyan-100
  "#FEE2E2", // red-100
  "#E0E7FF", // indigo-100
  "#D9F99D", // lime-200
  "#FBCFE8", // pink-200
  "#BAE6FD", // sky-200
];

/** Hash stable d'une string en index palette. */
function pastelForAffaire(affaireId: string): string {
  let hash = 0;
  for (let i = 0; i < affaireId.length; i++) {
    hash = (hash * 31 + affaireId.charCodeAt(i)) >>> 0;
  }
  return PASTEL_PALETTE[hash % PASTEL_PALETTE.length];
}

const PASTEL_TEXT = "#1F2937"; // gray-800

/** Cellule jour — regroupe les assignations par (affaire + métier), fusionne AM+PM en JOURNEE */
export function AssignationCell({
  assignations,
  metiersById,
  affairesById,
  compact,
  dnd,
  swapAssignationIds,
  onDeleteGroup,
}: Props) {
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
      const statusSet = new Set(items.map((i) => i.statut_confirmation ?? "non_requise"));
      let confStatus: ConfStatus = "non_requise";
      if (statusSet.size === 1) confStatus = items[0].statut_confirmation ?? "non_requise";
      else {
        if (statusSet.has("refusee")) confStatus = "refusee";
        else if (statusSet.has("en_attente")) confStatus = "en_attente";
        else if (statusSet.has("confirmee")) confStatus = "mixte";
        else confStatus = "non_requise";
      }
      const hasSwap = swapAssignationIds ? items.some((i) => swapAssignationIds.has(i.id)) : false;
      const hasAutoStaffing = items.some(
        (i) => Boolean(i.staffing_plan_id) || i.type_operation === "auto_staffing",
      );
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
        hasAutoStaffing,
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
            dnd={dnd}
            onDelete={onDeleteGroup}
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
  dnd?: { employeId: string; date: string };
  onDelete?: (assignationIds: string[]) => Promise<void> | void;
}

function DraggableBadge({ group: g, metier, affaire, dnd, onDelete }: DraggableBadgeProps) {
  const bg = pastelForAffaire(g.affaire_id);
  const metierColor = metier?.couleur ?? "#94a3b8";
  const slotLabel = g.slot === "JOURNEE" ? "J" : g.slot;
  const [confirmOpen, setConfirmOpen] = useState(false);

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
    // v0.15.2 fix bug #2 : désactiver le Tooltip quand le popover de confirmation
    // est ouvert, sinon le TooltipContent (z-50) chevauche le PopoverContent et
    // bloque le clic sur le bouton "Supprimer".
    <Tooltip open={confirmOpen ? false : undefined}>
      <TooltipTrigger asChild>
        <div
          ref={setNodeRef}
          {...(dnd ? attributes : {})}
          {...(dnd ? listeners : {})}
          className={cn(
            "group/badge relative rounded px-1.5 py-1 text-[10px] font-semibold leading-tight shadow-sm transition-all hover:shadow-md hover:brightness-95",
            dnd ? "cursor-grab active:cursor-grabbing" : "cursor-default",
            g.slot === "AM" && "mb-0",
            g.slot === "PM" && "mt-0",
            isDragging && "opacity-40",
          )}
          style={{
            backgroundColor: bg,
            color: PASTEL_TEXT,
            transform: transform ? CSS.Translate.toString(transform) : undefined,
            zIndex: isDragging ? 50 : undefined,
          }}
          // Pas de stopPropagation : le clic doit pouvoir remonter à la cellule pour ouvrir
          // le dialog d'édition. Le drag est déjà distingué du clic par activationConstraint
          // (distance: 6) du DndContext parent.
        >
          <div className="flex items-center justify-between gap-1">
            <span className="flex min-w-0 items-center gap-1 truncate font-mono text-[10px]">
              {/* Dot 6px coloré métier */}
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full ring-1 ring-black/10"
                style={{ backgroundColor: metierColor }}
                aria-hidden
              />
              {g.hasSwap && <ArrowLeftRight className="h-2.5 w-2.5 shrink-0 opacity-80" />}
              {g.confStatus === "en_attente" && (
                <Hourglass className="h-2.5 w-2.5 shrink-0 animate-pulse" />
              )}
              {g.confStatus === "confirmee" && <Check className="h-2.5 w-2.5 shrink-0" />}
              {g.confStatus === "refusee" && <X className="h-2.5 w-2.5 shrink-0" />}
              <span className="truncate">{affaire?.numero ?? "—"}</span>
              {/* v0.17 — Badge PROTO si l'affaire est une opportunité non signée */}
              {affaire?.phase === "opportunite" && (
                <span className="shrink-0 rounded bg-warning px-1 text-[8px] font-bold uppercase tracking-wider text-warning-foreground">
                  PROTO
                </span>
              )}
              {/* v0.35.5 — Badge Auto-staffing */}
              {g.hasAutoStaffing && (
                <span
                  className="shrink-0 rounded bg-primary/15 px-1 text-[8px] font-bold uppercase tracking-wider text-primary"
                  title="Créneau issu d'un plan Auto-staffing v0.35"
                >
                  AS
                </span>
              )}
            </span>
            <span
              className="shrink-0 rounded-sm px-1 text-[9px] font-bold opacity-80"
              style={{ backgroundColor: "rgba(0,0,0,0.08)" }}
            >
              {slotLabel}
            </span>
          </div>
          {affaire?.nom && (
            <div className="mt-0.5 truncate text-[9px] font-normal opacity-80">{affaire.nom}</div>
          )}

          {/* ✕ rouge en haut-droite, visible au hover du badge uniquement */}
          {onDelete && (
            <Popover open={confirmOpen} onOpenChange={setConfirmOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "absolute right-0.5 top-0.5 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white shadow-sm",
                    "opacity-0 transition-opacity group-hover/badge:opacity-100 focus:opacity-100",
                    "hover:bg-red-600",
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setConfirmOpen(true);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  aria-label="Supprimer cette affectation"
                >
                  <X className="h-2.5 w-2.5" strokeWidth={3} />
                </button>
              </PopoverTrigger>
              <PopoverContent
                side="top"
                align="end"
                // v0.15.2 fix bug #2 : z-[60] pour passer au-dessus du Tooltip (z-50)
                // et de tout hover-overlay des cellules planning.
                className="z-[60] w-[220px] p-3"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <p className="mb-3 text-sm font-medium">Supprimer cette affectation ?</p>
                <p className="mb-3 text-xs text-muted-foreground">
                  {affaire?.numero ?? "—"} · {g.slot === "JOURNEE" ? "Journée" : g.slot} ·{" "}
                  {g.heures}h
                </p>
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmOpen(false);
                    }}
                  >
                    Annuler
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={async (e) => {
                      e.stopPropagation();
                      setConfirmOpen(false);
                      await onDelete(g.items.map((i) => i.id));
                    }}
                  >
                    Supprimer
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="max-w-[280px] border bg-white p-0 text-gray-900 shadow-lg"
      >
        <div className="space-y-2 p-3">
          <div className="flex items-start gap-2">
            <span
              className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: metierColor }}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[10px] font-semibold text-gray-900">
                  {affaire?.numero ?? "—"}
                </span>
              </div>
              {affaire?.nom && (
                <div className="mt-1 text-xs font-semibold leading-tight text-gray-900">
                  {affaire.nom}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1 border-t border-gray-200 pt-2 text-[11px] text-gray-700">
            {affaire?.client && (
              <div className="flex items-center gap-1.5">
                <Briefcase className="h-3 w-3 shrink-0" />
                <span className="truncate">{affaire.client}</span>
              </div>
            )}
            {affaire?.lieu && (
              <div className="flex items-center gap-1.5">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{affaire.lieu}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-gray-900">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: metierColor }}
              />
              <span className="font-medium">{metier?.libelle ?? "—"}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="h-3 w-3 shrink-0" />
              <span>
                {g.slot === "JOURNEE" ? "Journée" : g.slot} · {g.heures}h
              </span>
            </div>
            {dnd && (
              <div className="border-t border-gray-200 pt-1.5 text-[10px] italic text-gray-500">
                Cliquer pour éditer · Glisser pour déplacer · Alt + glisser pour dupliquer
              </div>
            )}
          </div>

          {g.notes.length > 0 && (
            <div className="space-y-1 border-t border-gray-200 pt-2 text-[11px] text-gray-700">
              {g.notes.map((n, i) => (
                <div key={i} className="flex items-start gap-1.5">
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
