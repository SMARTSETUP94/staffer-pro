/**
 * Sprint D / Batch 2 finition — Atome <EquipeCapaciteIndicator>.
 *
 * 3 cas distincts d'affichage :
 *   - 'dates_manquantes' (gris, icône calendrier barré) : fenêtre de phase
 *     impossible à calculer (dates absentes). CTA optionnel.
 *   - statut=null + heures absentes (gris "—") : heures prévues non saisies.
 *   - 'ok' / 'sous_dim' / 'fortement_sous_dim' : badge couleur + tooltip
 *     détaillant la formule.
 */
import { Calendar as CalendarIcon, AlertCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type CapaciteStatut =
  | "ok"
  | "sous_dim"
  | "fortement_sous_dim"
  | "dates_manquantes"
  | null;

export interface EquipeCapaciteIndicatorProps {
  statut: CapaciteStatut;
  nbPersonnes: number;
  joursOuvres: number;
  capaciteEstimeeH: number | null;
  heuresPrevues: number | null;
  ratio: number | null;
  className?: string;
  /** Lien (ex. édition dates affaire) affiché en CTA quand dates_manquantes. */
  datesCtaHref?: string;
  /** Label compact pour mini-indicateur (ex. par métier). */
  size?: "sm" | "md";
}

const STATUT_STYLES = {
  ok: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400",
  sous_dim: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400",
  fortement_sous_dim: "bg-destructive/10 text-destructive border-destructive/30",
} as const;

const STATUT_LABELS = {
  ok: "Capacité OK",
  sous_dim: "Sous-dimensionné",
  fortement_sous_dim: "Fortement sous-dimensionné",
} as const;

export function EquipeCapaciteIndicator({
  statut,
  nbPersonnes,
  joursOuvres,
  capaciteEstimeeH,
  heuresPrevues,
  ratio,
  className,
  datesCtaHref,
  size = "md",
}: EquipeCapaciteIndicatorProps) {
  const padClass = size === "sm" ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-xs";

  // Cas 1 — fenêtre de dates invalide
  if (statut === "dates_manquantes") {
    const badge = (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md border bg-muted text-muted-foreground border-border",
          padClass,
          className,
        )}
        data-testid="capacite-dates-manquantes"
      >
        <CalendarIcon className="h-3 w-3 opacity-70" />
        Dates manquantes
      </span>
    );
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {datesCtaHref ? (
              <a href={datesCtaHref} className="no-underline">{badge}</a>
            ) : (
              badge
            )}
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs">
            Dates de phase non définies. {datesCtaHref ? "Cliquer pour les saisir." : "Saisissez les dates dans la synthèse de l'affaire."}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Cas 2 — heures prévues absentes
  if (statut === null) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-md border bg-muted text-muted-foreground border-border",
                padClass,
                className,
              )}
              data-testid="capacite-no-heures"
            >
              <AlertCircle className="h-3 w-3 opacity-60" />
              —
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs">
            Heures prévues non saisies pour cette phase
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Cas 3 — statut calculé
  const pct = ratio !== null ? Math.round(ratio * 100) : null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-md border font-medium",
              padClass,
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
            {size === "sm" ? (pct !== null ? `${pct}%` : "ok") : STATUT_LABELS[statut]}
            {size === "md" && pct !== null && <span className="opacity-70">· {pct}%</span>}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          <div className="font-semibold mb-1">Formule V1</div>
          <div>{nbPersonnes} pers. × {joursOuvres} j. ouvrés × 8 h</div>
          <div className="mt-1">
            = <strong>{capaciteEstimeeH ?? 0} h</strong> de capacité
          </div>
          <div className="mt-1 text-muted-foreground">
            Heures prévues : {heuresPrevues ?? 0} h
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
