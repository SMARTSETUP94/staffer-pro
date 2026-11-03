import { useContext, useMemo } from "react";
import { ChevronsLeftRight } from "lucide-react";
import { IndicateursCtx } from "./PipelineIndicateursBandeau";
import { eurEntier, kEur, totauxColonne, type SupplementChantier } from "@/lib/pipeline-indicateurs";
import { Link } from "@tanstack/react-router";
import { STATUT_LABEL as STATUT_DEVIS_LABEL } from "@/components/devis/editeur/api";
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
export function KanbanColonne({ statut, items, chargesById, onSign, onDelete, draggable = true, tri, repliee, onToggle }: Props) {
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
            className="min-w-0 truncate whitespace-nowrap text-left text-sm font-semibold text-foreground hover:underline"
            title={statut === "presque_gagne" ? `${PRESQUE_GAGNE_DEFINITION} — cliquer pour replier` : "Cliquer pour replier la colonne"}
          >
            {label} <span className="tabular-nums">· {items.length}</span>
          </button>
          {enRetard > 0 && (
            <span className="ml-auto shrink-0 whitespace-nowrap rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
              {enRetard} en retard
            </span>
          )}
        </div>
        <div className="mt-0.5 h-4 truncate whitespace-nowrap text-xs tabular-nums text-foreground">
          {parAffaire.size > 0 && (tot.chiffre > 0 || tot.estime > 0) ? (
            <>
              {kEur(tot.chiffre + tot.estime)}
              {tot.estime > 0 && <span className="text-muted-foreground"> · dont {kEur(tot.estime)} est.</span>}
            </>
          ) : null}
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

/** Badge commun « Supplément 6XXX ». */
export function BadgeSupplement() {
  return <span className="inline-flex items-center rounded-full border border-warning/50 bg-warning/15 px-2 py-0.5 text-[10px] font-semibold text-foreground">Supplément 6XXX</span>;
}

/**
 * Colonne à part, en fin de Kanban : devis de suppléments des chantiers 6XXX encore ouverts.
 * Non droppable (ce ne sont pas des opportunités) ; repliée par défaut.
 */
export function SupplementsColonne({ items, repliee, onToggle }: { items: SupplementChantier[]; repliee: boolean; onToggle: () => void }) {
  const total = items.reduce((s, i) => s + Number(i.net_ht ?? 0), 0);
  const label = "Suppléments 6XXX";
  if (repliee) {
    return (
      <button type="button" onClick={onToggle} title={`Déplier « ${label} » (${items.length})`} aria-label={`Déplier la colonne ${label}, ${items.length} devis`}
        className="flex shrink-0 items-center gap-2 rounded-xl border-2 border-dashed border-warning/50 bg-warning/5 px-3 py-2 text-left hover:border-primary/60 md:w-11 md:flex-col md:px-0 md:py-3">
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-warning/20 px-1.5 text-[10px] font-bold tabular-nums text-foreground">{items.length}</span>
        <span className="whitespace-nowrap text-sm font-semibold text-foreground md:[writing-mode:vertical-rl] md:rotate-180">{label}</span>
        <ChevronsLeftRight className="ml-auto h-3.5 w-3.5 text-muted-foreground md:ml-0 md:mt-auto" aria-hidden="true" />
      </button>
    );
  }
  return (
    <div className="flex min-h-[60vh] min-w-0 flex-col rounded-xl border-2 border-dashed border-warning/50 bg-warning/5 md:min-w-[230px] md:flex-1">
      <div className="border-b border-border/50 px-3 py-2">
        <button type="button" onClick={onToggle} className="flex h-5 w-full items-center truncate whitespace-nowrap text-left text-sm font-semibold text-foreground hover:underline" title="Cliquer pour replier la colonne">
          {label} <span className="ml-1 tabular-nums">· {items.length}</span>
        </button>
        <div className="mt-0.5 h-4 text-xs tabular-nums text-foreground">{kEur(total)}</div>
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
        {items.map((d) => (
          <Link key={d.devis_id} to="/affaires/$affaireId/devis-staffing/$devisId" params={{ affaireId: d.affaire_id, devisId: d.devis_id! }}
            className="rounded-lg border border-border bg-card p-3 shadow-sm hover:border-primary/60">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs font-bold text-primary">{d.numero}</span>
              <BadgeSupplement />
            </div>
            <div className="mt-0.5 truncate text-sm font-semibold text-foreground">{d.client ?? d.libelle}</div>
            {d.libelle && d.client && d.libelle !== d.client && <div className="truncate text-xs text-muted-foreground">{d.libelle}</div>}
            <div className="mt-1 text-base font-bold tabular-nums text-foreground">
              {eurEntier(d.net_ht)}<span className="text-xs font-semibold text-muted-foreground"> · {d.devis_numero} · {(STATUT_DEVIS_LABEL[d.statut_redaction as keyof typeof STATUT_DEVIS_LABEL] ?? d.statut_redaction).toLowerCase()}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
