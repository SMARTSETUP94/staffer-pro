import { useMemo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { cn } from "@/lib/utils";
import {
  PRESQUE_GAGNE_DEFINITION,
  STATUT_LABEL,
  STATUT_TONE,
  type OpportuniteStatut,
} from "@/lib/opportunites";
import { countEnRetard, sortAFaire } from "@/lib/opportunite-a-faire";
import { aFaireColonneRetardCount } from "@/lib/labels";
import { OpportuniteCard, type OpportuniteCardData } from "./OpportuniteCard";
import type { ChargeAffaires } from "@/hooks/use-charges-affaires";

interface Props {
  statut: OpportuniteStatut;
  items: OpportuniteCardData[];
  chargesById: Map<string, ChargeAffaires>;
  onSign?: (opp: OpportuniteCardData) => void;
  onDelete?: (opp: OpportuniteCardData) => void;
  draggable?: boolean;
}

/**
 * v0.17 — Colonne du Kanban : zone droppable + liste sortable de cartes.
 * Le statut effectif est dérivé de la colonne sur laquelle on drop (cf. handleDragEnd).
 */
export function KanbanColonne({ statut, items, chargesById, onSign, onDelete, draggable = true }: Props) {
  const tone = STATUT_TONE[statut];
  const { setNodeRef, isOver } = useDroppable({ id: `col::${statut}` });

  // Colonne « À faire » : tri chronologique (plus ancienne en haut) + compteur de retards.
  const isAFaire = statut === "a_faire";
  const displayItems = useMemo(
    () => (isAFaire ? sortAFaire(items) : items),
    [isAFaire, items],
  );
  const enRetard = useMemo(
    () => (isAFaire ? countEnRetard(items) : 0),
    [isAFaire, items],
  );

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex h-full min-h-[60vh] flex-col rounded-xl border-2 transition-colors",
        tone.col,
        isOver && "border-primary bg-primary/5",
      )}
    >
      <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", tone.dot)} />
          <span
            className="text-sm font-semibold text-foreground"
            title={statut === "presque_gagne" ? PRESQUE_GAGNE_DEFINITION : undefined}
          >
            {STATUT_LABEL[statut]}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {enRetard > 0 && (
            <span
              className="text-[10px] font-semibold text-destructive"
              title={aFaireColonneRetardCount(enRetard)}
            >
              {aFaireColonneRetardCount(enRetard)}
            </span>
          )}
          <span
            className={cn(
              "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold",
              tone.chip,
            )}
          >
            {displayItems.length}
          </span>
        </div>
      </div>

      <SortableContext
        items={displayItems.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
          {displayItems.length === 0 ? (
            <div className="flex flex-1 items-center justify-center px-2 py-8 text-center text-[11px] italic text-muted-foreground">
              Glissez une carte ici
            </div>
          ) : (
            displayItems.map((opp) => (
              <OpportuniteCard
                key={opp.id}
                opp={opp}
                chargesById={chargesById}
                onSign={onSign}
                onDelete={onDelete}
                draggable={draggable}
              />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  );
}
