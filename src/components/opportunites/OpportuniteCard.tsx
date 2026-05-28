import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Sparkles, Trophy, GripVertical, MoreVertical, Trash2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  TAILLE_LABEL,
  TAILLE_RANGE,
  TAILLE_TONE,
  type OpportuniteTaille,
} from "@/lib/opportunites";
import type { ChargeAffaires } from "@/hooks/use-charges-affaires";
import { TypologieBadge } from "@/components/typologie/TypologieBadge";
import { getAffaireTypologie, type AffaireTypologie } from "@/lib/affaire-typologie";
import { checkCanDeleteOpportunite } from "@/lib/opportunite-delete";

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
  /** v0.29.2 — typologie cible déclarée (override le getAffaireTypologie 9XXX par défaut). */
  typologie_future?: AffaireTypologie | null;
}

interface Props {
  opp: OpportuniteCardData;
  chargesById: Map<string, ChargeAffaires>;
  onSign?: (opp: OpportuniteCardData) => void;
  /** v0.28.1 — callback suppression. Si non défini → menu masqué. */
  onDelete?: (opp: OpportuniteCardData) => void;
  /** Si false, le drag est désactivé (lecture seule). */
  draggable?: boolean;
}

/**
 * v0.17 — Carte d'opportunité dans le Kanban.
 * v0.28.1 — Ajout menu kebab avec suppression (gardé par RBAC parent).
 */
export function OpportuniteCard({
  opp,
  chargesById,
  onSign,
  onDelete,
  draggable = true,
}: Props) {
  const navigate = useNavigate();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: opp.id, disabled: !draggable, data: { opp } });

  const goToFiche = () => {
    navigate({ to: "/opportunites/$affaireId", params: { affaireId: opp.id } });
  };

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
  const canDelete =
    onDelete &&
    checkCanDeleteOpportunite({
      statut_opportunite: opp.statut_opportunite,
      phase: "opportunite",
    }).ok;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group rounded-lg border border-border bg-card p-3 shadow-sm transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1",
        isDragging && "opacity-40",
      )}
    >
      <div className="flex items-start gap-2">
        {draggable && (
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="mt-0.5 cursor-grab rounded text-muted-foreground opacity-0 transition-opacity focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 active:cursor-grabbing"
            aria-label={`Déplacer l'opportunité ${opp.numero}`}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-xs font-bold text-primary">{opp.numero}</span>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">{dateLabel}</span>
              {canDelete && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
                      aria-label="Actions"
                    >
                      <MoreVertical className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete?.(opp);
                      }}
                      className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                      Supprimer l'opportunité
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
          <div className="mt-0.5 truncate text-sm font-semibold text-foreground">
            {opp.client ?? opp.nom}
          </div>
          {opp.nom && opp.client && opp.nom !== opp.client && (
            <div className="truncate text-xs text-muted-foreground">{opp.nom}</div>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <TypologieBadge typologie={opp.typologie_future ?? getAffaireTypologie(opp.numero)} short />
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
              className="mt-2 h-7 w-full rounded-md bg-primary text-[11px] font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Trophy className="mr-1 h-3 w-3" /> Signer cette opportunité
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
