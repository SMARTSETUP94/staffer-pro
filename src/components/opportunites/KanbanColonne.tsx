import { useContext, useMemo } from "react";
import { ChevronsLeftRight } from "lucide-react";
import { IndicateursCtx } from "./PipelineIndicateursBandeau";
import { kEur, totauxColonne } from "@/lib/pipeline-indicateurs";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { cn } from "@/lib/utils";
import {
  PRESQUE_GAGNE_DEFINITION,
  STATUT_LABEL,
  STATUT_TONE,
  type OpportuniteStatut,
} from "@/lib/opportunites";
import { estEnRetard, trierCartes, type TriCartes } from "@/lib/pipeline-kanban";
import { OpportuniteCard, type OpportuniteCardData } from "./OpportuniteCard";
import type { ChargeAffaires } from "@/hooks/use-charges-affaires";

interface Props {
  statut: OpportuniteStatut;
  items: OpportuniteCardData[];
  chargesById: Map<string, ChargeAffaires>;
  onSign?: (opp: OpportuniteCardData) => void;
  onClore?: (opp: OpportuniteCardData) => void;
  onDelete?: (opp: OpportuniteCardData) => void;
  draggable?: boolean;
  tri: TriCartes;
  repliee: boolean;
  onToggle: () => void;
}

/**
 * Colonne du Kanban : zone droppable + liste sortable de cartes.
 * En-tête sur deux lignes fixes (statut · nombre / montant) ; une colonne repliée
 * devient une bande étroite (nom vertical + nombre), toujours droppable.
 */
export function KanbanColonne({ statut, items, chargesById, onSign, onClore, onDelete, draggable = true, tri, repliee, onToggle }: Props) {
  const tone = STATUT_TONE[statut];
  const { setNodeRef, isOver } = useDroppable({ id: `col::${statut}` });
  const parAffaire = useContext(IndicateursCtx);
  const displayItems = useMemo(() => trierCartes(items, tri, (id) => {
    const a = parAffaire.get(id);
    return a ? Number(a.net_ht ?? a.estime ?? 0) : null;
  }), [items, tri, parAffaire]);
  const tot = useMemo(() => totauxColonne(items.map((i) => i.id), parAffaire), [items, parAffaire]);
  const enRetard = useMemo(() => items.filter((i) => estEnRetard(i)).length, [items]);
  const label = STATUT_LABEL[statut];

  if (repliee) {
    return (
      <button
        ref={setNodeRef}
        type="button"
        onClick={onToggle}
        title={`Déplier « ${label} » (${items.length})`}
        aria-label={`Déplier la colonne ${label}, ${items.length} opportunités`}
        className={cn(
          "flex shrink-0 items-center gap-2 rounded-xl border-2 px-3 py-2 text-left transition-colors hover:border-primary/60 md:w-11 md:flex-col md:px-0 md:py-3",
          tone.col,
          isOver && "border-primary bg-primary/5",
        )}
      >
        <span className={cn("h-2 w-2 shrink-0 rounded-full", tone.dot)} />
        <span className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums", tone.chip)}>
          {items.length}
        </span>
        <span className="whitespace-nowrap text-sm font-semibold text-foreground md:[writing-mode:vertical-rl] md:rotate-180">{label}</span>
        <ChevronsLeftRight className="ml-auto h-3.5 w-3.5 text-muted-foreground md:ml-0 md:mt-auto" aria-hidden="true" />
      </button>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-[60vh] min-w-0 flex-col rounded-xl border-2 transition-colors md:min-w-[230px] md:flex-1",
        tone.col,
        isOver && "border-primary bg-primary/5",
      )}
    >
      <div className="border-b border-border/50 px-3 py-2">
        <div className="flex h-5 items-center gap-2">
          <span className={cn("h-2 w-2 shrink-0 rounded-full", tone.dot)} />
          <button
            type="button"
            onClick={onToggle}
            className="min-w-0 truncate whitespace-nowrap text-left text-sm font-semibold tabular-nums text-foreground hover:underline"
            title={[statut === "presque_gagne" ? PRESQUE_GAGNE_DEFINITION : "", tot.estime > 0 ? `${kEur(tot.chiffre)} chiffrés · ${kEur(tot.estime)} estimés` : "", "Cliquer pour replier la colonne"].filter(Boolean).join(" — ")}
          >
            {label} · {items.length}{parAffaire.size > 0 && tot.chiffre + tot.estime > 0 && <span className="font-normal"> · {kEur(tot.chiffre + tot.estime)}</span>}
          </button>
          {enRetard > 0 && (
            <span className="ml-auto shrink-0 whitespace-nowrap rounded-full bg-destructive/10 px-1.5 text-[10px] font-semibold leading-4 text-destructive" title={`${enRetard} en retard`} aria-label={`${enRetard} en retard`}>
              {enRetard}
            </span>
          )}
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
                onClore={onClore}
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
