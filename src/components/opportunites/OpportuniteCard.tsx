import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Sparkles, Trophy, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  TAILLE_LABEL,
  TAILLE_RANGE,
  TAILLE_TONE,
  type OpportuniteTaille,
} from "@/lib/opportunites";
import type { ChargeAffaires } from "@/hooks/use-charges-affaires";

export interface OpportuniteCardData {
  id: string;
  numero: string;
  client: string | null;
  nom: string;
  charge_affaires_id: string | null;
  taille: OpportuniteTaille | null;
  date_opportunite: string | null;
  notes: string | null;
  statut_opportunite: "a_faire" | "envoye" | "gagne" | "perdu" | "termine";
}

interface Props {
  opp: OpportuniteCardData;
  chargesById: Map<string, ChargeAffaires>;
  onSign?: (opp: OpportuniteCardData) => void;
  /** Si false, le drag est désactivé (lecture seule). */
  draggable?: boolean;
}

/**
 * v0.17 — Carte d'opportunité dans le Kanban.
 * Drag-drop via @dnd-kit/sortable (la colonne est le conteneur Sortable).
 */
export function OpportuniteCard({ opp, chargesById, onSign, draggable = true }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: opp.id, disabled: !draggable, data: { opp } });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const ca = opp.charge_affaires_id ? chargesById.get(opp.charge_affaires_id) : null;
  const dateLabel = opp.date_opportunite
    ? new Date(opp.date_opportunite).toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "short",
      })
    : "—";
  const isGagne = opp.statut_opportunite === "gagne";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group rounded-lg border border-border bg-card p-3 shadow-sm transition-shadow hover:shadow-md",
        isDragging && "opacity-40",
      )}
    >
      <div className="flex items-start gap-2">
        {draggable && (
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="mt-0.5 cursor-grab text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
            aria-label="Déplacer"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-xs font-bold text-primary">{opp.numero}</span>
            <span className="text-[10px] text-muted-foreground">{dateLabel}</span>
          </div>
          <div className="mt-0.5 truncate text-sm font-semibold text-foreground">
            {opp.client ?? opp.nom}
          </div>
          {opp.nom && opp.client && opp.nom !== opp.client && (
            <div className="truncate text-xs text-muted-foreground">{opp.nom}</div>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {opp.taille ? (
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                  TAILLE_TONE[opp.taille],
                )}
                title={`${TAILLE_LABEL[opp.taille]} — ${TAILLE_RANGE[opp.taille]}`}
              >
                {TAILLE_LABEL[opp.taille]}
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Taille ?
              </span>
            )}
            {ca && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-foreground">
                <Sparkles className="h-2.5 w-2.5" />
                {ca.full_name?.split(" ")[0] ?? ca.email.split("@")[0]}
              </span>
            )}
          </div>

          {isGagne && onSign && (
            <Button
              type="button"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onSign(opp);
              }}
              className="mt-2 h-7 w-full rounded-md bg-emerald-600 text-[11px] font-semibold text-white hover:bg-emerald-700"
            >
              <Trophy className="mr-1 h-3 w-3" /> Signer cette opportunité
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
