import { DevisPipelineBouton } from "./DevisPipeline";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Sparkles,
  Trophy,
  GripVertical,
  MoreVertical,
  Trash2,
  Clock,
  ArrowUpRight,
} from "lucide-react";
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
import { RolesManquantsBadges, PresqueGagneAlerte } from "@/components/affaire/RolesManquantsBadges";
import {
  actionUrgency,
  URGENCY_CLASS,
  fmtActionDate,
} from "@/lib/opportunite-action-urgency";
import { aFaireBadge, aFaireReferenceDate } from "@/lib/opportunite-a-faire";
import {
  A_FAIRE_BADGE_NOUVELLE,
  aFaireDepuisTitle,
  aFaireRetardLabel,
} from "@/lib/labels";

export interface OpportuniteCardData {
  id: string;
  numero: string;
  client: string | null;
  nom: string;
  charge_affaires_id: string | null;
  taille: OpportuniteTaille | null;
  date_opportunite: string | null;
  notes: string | null;
  statut_opportunite: "a_faire" | "envoye" | "a_l_etude" | "presque_gagne" | "gagne" | "perdu" | "termine";
  statut_opportunite_depuis?: string | null;
  /** Date de création — repère « Nouvelle » de la colonne À faire. */
  created_at?: string | null;
  /** Lot 1 — rôles projet déjà affectés (pour les badges « rôle à affecter »). */
  roles_affectes?: string[];
  /** Date de visite technique / repérage (statut « À l'étude »). */
  date_visite_technique?: string | null;
  /** v0.29.2 — typologie cible déclarée (override le getAffaireTypologie 9XXX par défaut). */
  typologie_future?: AffaireTypologie | null;
  /** Bloc 10.4 — enrichissement listing. */
  next_action_due_le?: string | null;
  last_jalon_etape?: string | null;
  actions_count?: number | null;
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
 * v0.50 — Toute la carte est cliquable et ouvre la fiche opportunité ;
 *         la poignée de drag, le menu et le bouton Signer arrêtent la propagation.
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

  /** Entrée/espace sur la carte elle-même (pas sur un contrôle interne) → fiche. */
  const onCardKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      goToFiche();
    }
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

  // Repères visuels de la colonne « À faire » (non bloquants).
  const aFaire =
    opp.statut_opportunite === "a_faire" ? aFaireBadge(opp) : null;
  const aFaireRef = aFaireReferenceDate(opp);

  return (
    <div
      ref={setNodeRef}
      style={style}
      role="button"
      tabIndex={0}
      onClick={goToFiche}
      onKeyDown={onCardKeyDown}
      title={`Ouvrir la fiche de l'opportunité ${opp.numero}`}
      className={cn(
        "group cursor-pointer rounded-lg border border-border bg-card p-3 shadow-sm transition-all hover:border-primary/60 hover:shadow-md focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isDragging && "opacity-40",
        aFaire?.kind === "retard" && "border-l-4 border-l-destructive",
      )}
    >
      <div className="flex items-start gap-2">
        {draggable && (
          <button
            type="button"
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
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
              <ArrowUpRight
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70 transition-colors group-hover:text-primary"
                aria-hidden="true"
              />
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

          {aFaire && (
            <div className="mt-2">
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                  aFaire.kind === "retard"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-primary/10 text-primary",
                )}
                title={aFaireRef ? aFaireDepuisTitle(aFaireRef) : undefined}
              >
                {aFaire.kind === "retard"
                  ? aFaireRetardLabel(aFaire.jours)
                  : A_FAIRE_BADGE_NOUVELLE}
              </span>
            </div>
          )}

          {opp.statut_opportunite === "a_l_etude" && opp.date_visite_technique && (
            <div className="mt-2">
              <span
                className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-800"
                title="Visite technique / repérage planifiée"
              >
                <Clock className="h-2.5 w-2.5" />
                Visite le {new Date(opp.date_visite_technique + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
              </span>
            </div>
          )}

          <PresqueGagneAlerte statut={opp.statut_opportunite} depuis={opp.statut_opportunite_depuis} />
          {opp.roles_affectes && (
            <RolesManquantsBadges
              etat={{ phase: "opportunite", statut_opportunite: opp.statut_opportunite }}
              typologie={opp.typologie_future ?? null}
              affectes={opp.roles_affectes}
            />
          )}

          {opp.next_action_due_le && (() => {
            const urg = actionUrgency(opp.next_action_due_le);
            if (!urg) return null;
            return (
              <div
                className={cn(
                  "mt-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                  URGENCY_CLASS[urg],
                )}
                title={urg === "overdue" ? "Action en retard" : urg === "soon" ? "Action due bientôt" : "Action planifiée"}
              >
                <Clock className="h-2.5 w-2.5" />
                Action {urg === "overdue" ? "en retard" : "due"} · {fmtActionDate(opp.next_action_due_le)}
              </div>
            );
          })()}

          <DevisPipelineBouton affaireId={opp.id} statut={opp.statut_opportunite} />

          {isGagne && onSign && (
            <Button
              type="button"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onSign(opp);
              }}
              className="mt-2 h-7 w-full rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Trophy className="mr-1 h-3 w-3" /> Signer cette opportunité
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
