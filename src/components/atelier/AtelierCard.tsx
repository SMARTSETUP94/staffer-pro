/**
 * LOT B3 — Carte objet du tableau d'atelier.
 * Affiche, ne bloque jamais : un prérequis manquant se signale en ambre,
 * la validation reste possible.
 */
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  ATELIER_COLONNES,
  TAMPON_LABEL,
  actionCarte,
  formatDateMontage,
  formatHeures,
  pastille,
  type ObjetCarte,
  type TamponEtat,
} from "@/lib/atelier-board";

const TAMPON_CLASS: Record<TamponEtat, string> = {
  valide: "bg-primary text-primary-foreground border-primary",
  non_applicable: "border-dashed border-muted-foreground/40 text-muted-foreground/60 bg-muted/40",
  courant: "border-2 border-primary text-primary bg-background",
  a_venir: "border-border text-muted-foreground bg-background",
  absent: "border-border/40 text-muted-foreground/30 bg-background",
};

const PASTILLE_CLASS = {
  ok: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  manque: "bg-amber-500/20 text-amber-800 dark:text-amber-300",
  neutre: "bg-muted text-muted-foreground",
} as const;

export function AtelierCard({
  carte,
  onTerminer,
  onValider,
  pending,
  isAdmin,
  currentUserId,
}: {
  carte: ObjetCarte;
  onTerminer: (etapeId: string) => void;
  onValider: (etapeId: string) => void;
  pending: boolean;
  isAdmin: boolean;
  currentUserId: string | null;
}) {
  const p = pastille(carte.etape);
  const enAttente = carte.etape.statut === "en_attente_validation";
  const action = actionCarte(carte.etape, {
    isAdmin,
    isRespoFab: !!currentUserId && carte.respo_fab_id === currentUserId,
  });

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-3 shadow-sm transition hover:border-primary/50",
        enAttente && "border-amber-500/60 bg-amber-500/5 ring-1 ring-amber-500/30",
      )}
    >
      <Link
        to="/affaires/$affaireId/objets/$objetId"
        params={{ affaireId: carte.affaire_id, objetId: carte.objet_id }}
        className="block"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="font-mono text-xs font-semibold text-muted-foreground">
            {carte.reference}
          </span>
          <span className="text-[11px] font-semibold text-muted-foreground">
            {carte.heures > 0 ? formatHeures(carte.heures) : "— h"}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-sm font-semibold text-foreground">{carte.nom}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {carte.affaire_numero}
          {carte.date_montage
            ? ` · montage ${formatDateMontage(carte.date_montage) ?? carte.date_montage}`
            : " · sans date de montage"}
        </p>

        <span
          className={cn(
            "mt-2 inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-[11px] font-semibold",
            PASTILLE_CLASS[p.ton],
          )}
        >
          {p.ton === "manque" ? (
            <AlertTriangle className="h-3 w-3 shrink-0" />
          ) : p.ton === "ok" ? (
            <Check className="h-3 w-3 shrink-0" />
          ) : null}
          <span className="truncate">{p.label}</span>
        </span>
      </Link>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {ATELIER_COLONNES.map((col, i) => {
            const etat = carte.tampons[i] ?? "absent";
            return (
              <Tooltip key={col.type}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={`${col.label} : ${TAMPON_LABEL[etat]}`}
                    className={cn(
                      "inline-flex h-5 items-center rounded px-1 text-[9px] font-bold uppercase tracking-wide",
                      "border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      TAMPON_CLASS[etat],
                    )}
                  >
                    {col.tampon}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {col.label} : {TAMPON_LABEL[etat]}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
        {action.kind === "aucune" ? (
          <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
            {action.label}
          </span>
        ) : (
          <Button
            size="sm"
            variant={action.kind === "valider" ? "default" : "outline"}
            className="h-7 px-2 text-[11px]"
            disabled={pending}
            onClick={() =>
              action.kind === "valider" ? onValider(carte.etape.id) : onTerminer(carte.etape.id)
            }
          >
            {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : action.label}
          </Button>
        )}
      </div>
    </div>
  );
}
