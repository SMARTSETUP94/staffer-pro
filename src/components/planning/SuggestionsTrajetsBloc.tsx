import { useMemo } from "react";
import { Sparkles, ArrowRight, Plus, Building2, Warehouse } from "lucide-react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLieux } from "@/hooks/use-lieux";
import { buildSuggestions, type AffaireSuggest, type TrajetExistant, type TrajetSuggestion } from "@/lib/trajets-suggestions";

interface Props {
  weekStart: Date;
  weekEnd: Date;
  affaires: AffaireSuggest[];
  trajets: TrajetExistant[];
  onAccepter: (suggestion: TrajetSuggestion, alternativeArriveeAdresse?: string) => void;
}

export function SuggestionsTrajetsBloc({ weekStart, weekEnd, affaires, trajets, onAccepter }: Props) {
  const { atelier, stockages, loading } = useLieux();

  const suggestions = useMemo(
    () => buildSuggestions({ weekStart, weekEnd, affaires, trajets, atelier, stockages }),
    [weekStart, weekEnd, affaires, trajets, atelier, stockages],
  );

  if (loading) return null;

  if (!atelier) {
    return (
      <Card className="border-warning/40 bg-warning/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-warning" />
            Suggestions de trajets désactivées
          </CardTitle>
          <CardDescription className="text-xs">
            Définis l'<a href="/parametres/lieux" className="underline font-medium">atelier de l'entreprise</a> dans
            les paramètres pour activer les suggestions automatiques de montage / démontage.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Suggestions de trajets ({suggestions.length})
        </CardTitle>
        <CardDescription className="text-xs">
          Trajets ATELIER ↔ chantier proposés selon les dates de montage/démontage des affaires actives cette semaine.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {suggestions.map((s) => (
          <SuggestionRow key={s.id} suggestion={s} onAccepter={onAccepter} />
        ))}
      </CardContent>
    </Card>
  );
}

function SuggestionRow({
  suggestion,
  onAccepter,
}: {
  suggestion: TrajetSuggestion;
  onAccepter: (s: TrajetSuggestion, altAdresse?: string) => void;
}) {
  const dateLbl = format(parseISO(suggestion.date), "EEE dd MMM", { locale: fr });
  const isMontage = suggestion.type === "montage";

  return (
    <div className="rounded-md border bg-background p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <Badge
            variant="outline"
            className={isMontage ? "border-primary/40 text-primary" : "border-warning/40 text-warning"}
          >
            {isMontage ? (
              <>
                <Building2 className="h-3 w-3 mr-1" /> Montage
              </>
            ) : (
              <>
                <Warehouse className="h-3 w-3 mr-1" /> Démontage
              </>
            )}
          </Badge>
          <span className="font-mono text-[11px] font-semibold">{dateLbl}</span>
          <span className="text-muted-foreground">·</span>
          <span className="font-medium truncate">
            {suggestion.affaire.numero} — {suggestion.affaire.nom}
          </span>
        </div>
        <Button
          size="sm"
          variant="default"
          className="h-7 px-2 text-[11px]"
          onClick={() => onAccepter(suggestion)}
        >
          <Plus className="h-3 w-3 mr-1" />
          Créer le trajet
        </Button>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="truncate">{suggestion.adresse_depart}</span>
        <ArrowRight className="h-3 w-3 shrink-0" />
        <span className="truncate">{suggestion.adresse_arrivee}</span>
      </div>
      {suggestion.alternatives_arrivee && suggestion.alternatives_arrivee.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <span className="text-[10px] text-muted-foreground">Ou retour vers :</span>
          {suggestion.alternatives_arrivee.map((alt) => (
            <Button
              key={alt.id}
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[10px]"
              onClick={() => onAccepter(suggestion, alt.adresse)}
            >
              {alt.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
