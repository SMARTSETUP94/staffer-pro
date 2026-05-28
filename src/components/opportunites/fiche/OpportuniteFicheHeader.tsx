import { Link } from "@tanstack/react-router";
import { ArrowLeft, Trophy, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TypologieBadge } from "@/components/typologie/TypologieBadge";
import { getAffaireTypologie, type AffaireTypologie } from "@/lib/affaire-typologie";
import {
  STATUT_LABEL,
  TAILLE_LABEL,
  type OpportuniteStatut,
  type OpportuniteTaille,
} from "@/lib/opportunites";

interface Props {
  affaire: {
    id: string;
    numero: string;
    code_opportunite: string | null;
    nom: string;
    client: string | null;
    lieu: string | null;
    phase: string;
    statut_opportunite: string | null;
    taille: string | null;
    typologie_future: string | null;
  };
  canSign: boolean;
  onSign: () => void;
}

export function OpportuniteFicheHeader({ affaire, canSign, onSign }: Props) {
  const statut = (affaire.statut_opportunite ?? "a_faire") as OpportuniteStatut;
  const taille = (affaire.taille ?? null) as OpportuniteTaille | null;
  const typo = (affaire.typologie_future as AffaireTypologie | null) ?? getAffaireTypologie(affaire.numero);
  const isSigne = affaire.phase === "signe";

  return (
    <div className="space-y-3" data-testid="opportunite-fiche-header">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm" className="h-7 px-2">
          <Link to="/opportunites">
            <ArrowLeft className="mr-1 h-3.5 w-3.5" />
            Pipeline
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-mono text-base font-bold text-primary">
              {affaire.numero}
            </span>
            {affaire.code_opportunite && affaire.code_opportunite !== affaire.numero && (
              <span className="text-xs text-muted-foreground">
                (ex {affaire.code_opportunite})
              </span>
            )}
            {isSigne ? (
              <Badge variant="default" className="bg-emerald-600">
                Signée
              </Badge>
            ) : (
              <Badge variant="secondary">{STATUT_LABEL[statut]}</Badge>
            )}
          </div>
          <h1 className="mt-1 text-xl font-semibold leading-tight">
            {affaire.client ?? affaire.nom}
          </h1>
          {affaire.client && affaire.nom && affaire.nom !== affaire.client && (
            <p className="text-sm text-muted-foreground">{affaire.nom}</p>
          )}
          {affaire.lieu && (
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" />
              {affaire.lieu}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <TypologieBadge typologie={typo} short />
            {taille && (
              <Badge variant="outline" className="text-[10px] uppercase">
                {TAILLE_LABEL[taille]}
              </Badge>
            )}
          </div>
        </div>

        {canSign && !isSigne && statut === "gagne" && (
          <Button onClick={onSign} className="rounded-xl" data-testid="btn-sign-opp">
            <Trophy className="mr-2 h-4 w-4" />
            Signer en 5XXX
          </Button>
        )}
      </div>
    </div>
  );
}
