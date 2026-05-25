/**
 * Sprint D / Batch 1 — Atome <EquipeCapaciteIndicator>.
 *
 * Affiche un badge (vert / ambre / rouge) résumant la capacité estimée de
 * l'équipe castée pour une phase donnée, vs les heures prévues.
 *
 * Données : alimenté par la vue `v_affaire_equipe_capacite`. Le composant
 * est purement présentationnel : le fetch est délégué au parent.
 *
 * Formule V1 : nb_personnes × jours_ouvrés_phase × 8h.
 */
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type CapaciteStatut = "ok" | "sous_dim" | "fortement_sous_dim" | null;

export interface EquipeCapaciteIndicatorProps {
  statut: CapaciteStatut;
  nbPersonnes: number;
  joursOuvres: number;
  capaciteEstimeeH: number;
  heuresPrevues: number;
  ratio: number | null;
  className?: string;
}

const STATUT_STYLES: Record<NonNullable<CapaciteStatut>, string> = {
  ok: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400",
  sous_dim: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400",
  fortement_sous_dim: "bg-destructive/10 text-destructive border-destructive/30",
};

const STATUT_LABELS: Record<NonNullable<CapaciteStatut>, string> = {
  ok: "Capacité OK",
  sous_dim: "Sous-dimensionné",
  fortement_sous_dim: "Fortement sous-dimensionné",
};

export function EquipeCapaciteIndicator({
  statut,
  nbPersonnes,
  joursOuvres,
  capaciteEstimeeH,
  heuresPrevues,
  ratio,
  className,
}: EquipeCapaciteIndicatorProps) {
  if (statut === null) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-md border bg-muted text-muted-foreground px-2 py-0.5 text-xs",
          className,
        )}
        title="Pas d'heures prévues sur cette phase"
      >
        — heures prévues N/A
      </span>
    );
  }

  const pct = ratio !== null ? Math.round(ratio * 100) : null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium",
              STATUT_STYLES[statut],
              className,
            )}
          >
            <span
              aria-hidden
              className={cn(
                "inline-block h-1.5 w-1.5 rounded-full",
                statut === "ok" && "bg-emerald-500",
                statut === "sous_dim" && "bg-amber-500",
                statut === "fortement_sous_dim" && "bg-destructive",
              )}
            />
            {STATUT_LABELS[statut]}
            {pct !== null && <span className="opacity-70">· {pct}%</span>}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          <div className="font-semibold mb-1">Formule V1</div>
          <div>{nbPersonnes} pers. × {joursOuvres} j. ouvrés × 8 h</div>
          <div className="mt-1">
            = <strong>{capaciteEstimeeH} h</strong> de capacité
          </div>
          <div className="mt-1 text-muted-foreground">
            Heures prévues : {heuresPrevues} h
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
