import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Pencil, ExternalLink } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import {
  ETAPE_LABELS,
  ETAPES_ORDER,
  STATUT_LABELS,
  calcAvancementObjet,
  type FabricationEtape,
  type FabricationObjet,
} from "@/hooks/use-fabrication";

interface ObjetCardMobileProps {
  objet: FabricationObjet;
  isAdminOrChef: boolean;
  /** Lot 8.2b — Affaire pour construire le lien typé Fiche Objet (null = caché). */
  affaireIdForFiche?: string | null;
  onEditObjet: (objet: FabricationObjet) => void;
  onEditEtape: (objet: FabricationObjet, etape: FabricationEtape) => void;
}

const STATUT_BTN_CLASS: Record<string, string> = {
  a_faire: "bg-muted text-muted-foreground hover:bg-muted/80 border-border",
  en_cours: "bg-blue-500/15 text-blue-700 dark:text-blue-300 hover:bg-blue-500/20 border-blue-500/30",
  termine: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 border-emerald-500/30",
  non_applicable: "bg-muted/40 text-muted-foreground/60 line-through cursor-not-allowed border-dashed border-border/40",
};

function initials(name: string | null) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function ObjetCardMobile({
  objet,
  isAdminOrChef,
  onEditObjet,
  onEditEtape,
  ficheHref = null,
}: ObjetCardMobileProps) {
  const avancement = calcAvancementObjet(objet);
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm" data-objet-id={objet.id}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] text-muted-foreground">{objet.reference}</p>
          <h3 className="text-sm font-semibold leading-tight text-foreground">{objet.nom}</h3>

          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
              Qté {objet.quantite}
            </Badge>
            {objet.respo_fab_name && (
              <span className="text-muted-foreground">· {objet.respo_fab_name}</span>
            )}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Progress value={avancement} className="h-1.5 flex-1" />
            <span className="text-[11px] font-semibold tabular-nums text-foreground">
              {avancement}%
            </span>
          </div>
        </div>
        {isAdminOrChef && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 flex-shrink-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEditObjet(objet)}>
                <Pencil className="mr-2 h-4 w-4" /> Modifier l'objet
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* 5 boutons d'étape — zone tactile >=56px */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {ETAPES_ORDER.map((type) => {
          const e = objet.etapes.find((x) => x.type_etape === type);
          if (!e) {
            return (
              <div
                key={type}
                className="min-h-[56px] rounded-lg border border-dashed border-border/40 p-2 text-center text-[11px] text-muted-foreground"
              >
                {ETAPE_LABELS[type]} —
              </div>
            );
          }
          const isNA = e.statut === "non_applicable";
          const clickable = isAdminOrChef && !isNA;
          return (
            <button
              key={type}
              type="button"
              onClick={() => clickable && onEditEtape(objet, e)}
              disabled={!clickable}
              aria-label={`${ETAPE_LABELS[type]} — ${STATUT_LABELS[e.statut]}`}
              className={cn(
                "flex min-h-[56px] flex-col items-start justify-center gap-0.5 rounded-lg border p-2 text-left text-xs transition-colors",
                STATUT_BTN_CLASS[e.statut],
                !clickable && "cursor-default",
              )}
            >
              <div className="flex w-full items-center justify-between">
                <span className="font-semibold">{ETAPE_LABELS[type]}</span>
                <span className="text-[10px] uppercase tracking-wide opacity-80">
                  {STATUT_LABELS[e.statut]}
                </span>
              </div>
              {e.assignee_name && !isNA && (
                <div className="mt-0.5 flex items-center gap-1">
                  <Avatar className="h-4 w-4">
                    <AvatarFallback className="text-[8px]">
                      {initials(e.assignee_name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate text-[10px] opacity-80">
                    {e.assignee_name.split(" ")[0]}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Lot 8.2c — Bouton "Fiche" full-width en bas de card */}
      {ficheHref && (
        <Button
          asChild
          variant="outline"
          size="sm"
          className="mt-3 w-full gap-1.5"
        >
          <a
            href={ficheHref}
            data-testid="objet-fiche-link"
            data-objet-id={objet.id}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span>Voir la fiche</span>
          </a>
        </Button>
      )}
    </div>
  );
}

