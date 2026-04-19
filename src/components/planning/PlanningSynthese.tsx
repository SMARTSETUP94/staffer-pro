import { useMemo } from "react";
import { addDays, format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { MapPin, Users, AlertTriangle, HardHat, Calendar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type {
  Affaire,
  Assignation,
  DevisConsommation,
  Employe,
  Metier,
} from "@/hooks/use-planning-data";

interface Props {
  weekStart: Date;
  affaires: Affaire[];
  employes: Employe[];
  metiers: Metier[];
  assignations: Assignation[];
  consommation: DevisConsommation[];
  onSelectAffaire: (affaireId: string) => void;
}

export function PlanningSynthese({
  weekStart,
  affaires,
  employes,
  metiers,
  assignations,
  consommation,
  onSelectAffaire,
}: Props) {
  const weekEnd = addDays(weekStart, 6);
  const employesById = useMemo(() => new Map(employes.map((e) => [e.id, e])), [employes]);
  const metiersById = useMemo(() => new Map(metiers.map((m) => [m.id, m])), [metiers]);

  // Affaires actives cette semaine = celles avec au moins une assignation
  const affairesActives = useMemo(() => {
    const ids = new Set(assignations.map((a) => a.affaire_id));
    return affaires.filter((a) => ids.has(a.id));
  }, [affaires, assignations]);

  if (affairesActives.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Aucune affaire active du {format(weekStart, "d MMM", { locale: fr })} au{" "}
          {format(weekEnd, "d MMM yyyy", { locale: fr })}.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {affairesActives.map((affaire) => {
        const assignsAffaire = assignations.filter((a) => a.affaire_id === affaire.id);
        const employesAssignes = Array.from(new Set(assignsAffaire.map((a) => a.employe_id)))
          .map((id) => employesById.get(id))
          .filter((e): e is Employe => !!e);
        const cdi = employesAssignes.filter((e) => e.type_contrat === "CDI" || e.type_contrat === "CDD");
        const interim = employesAssignes.filter(
          (e) => e.type_contrat === "Interim" || e.type_contrat === "Independant",
        );

        // Récap par métier
        const consoLignes = consommation.filter((c) => c.affaire_id === affaire.id);
        const totalPrevues = consoLignes.reduce((s, l) => s + Number(l.heures_prevues || 0), 0);
        const totalAssignees = consoLignes.reduce((s, l) => s + Number(l.heures_assignees || 0), 0);
        const pctGlobal = totalPrevues > 0 ? (totalAssignees / totalPrevues) * 100 : 0;
        const depassement = pctGlobal > 100;

        return (
          <Card key={affaire.id} className={cn("overflow-hidden", depassement && "border-destructive/50")}>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {affaire.numero}
                    </Badge>
                    <h3 className="text-sm font-semibold truncate">{affaire.nom}</h3>
                    {depassement && (
                      <Badge variant="destructive" className="gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Dépassement
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    {affaire.client && <span>{affaire.client}</span>}
                    {affaire.lieu && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {affaire.lieu}
                      </span>
                    )}
                    {(() => {
                      const chef = affaire.chef_chantier_id
                        ? employesById.get(affaire.chef_chantier_id)
                        : null;
                      return chef ? (
                        <span className="flex items-center gap-1">
                          <HardHat className="h-3 w-3" /> Chef : {chef.prenom} {chef.nom}
                        </span>
                      ) : null;
                    })()}
                    {(affaire.date_montage || affaire.date_demontage) && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {affaire.date_montage
                          ? `Montage ${format(parseISO(affaire.date_montage), "d MMM", { locale: fr })}`
                          : ""}
                        {affaire.date_montage && affaire.date_demontage ? " → " : ""}
                        {affaire.date_demontage
                          ? `Démontage ${format(parseISO(affaire.date_demontage), "d MMM", { locale: fr })}`
                          : ""}
                      </span>
                    )}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => onSelectAffaire(affaire.id)}>
                  Voir dans le planning →
                </Button>
              </div>

              {/* Récap heures par métier */}
              {consoLignes.length > 0 && (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold uppercase tracking-wide text-muted-foreground">
                      Heures par métier
                    </span>
                    <span className={cn("font-semibold", depassement && "text-destructive")}>
                      {totalAssignees.toFixed(0)}h / {totalPrevues.toFixed(0)}h ({pctGlobal.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {consoLignes.map((c) => {
                      const pct = Number(c.heures_prevues) > 0
                        ? (Number(c.heures_assignees) / Number(c.heures_prevues)) * 100
                        : 0;
                      const dep = pct > 100;
                      return (
                        <div key={`${c.devis_id}-${c.metier_id}`} className="space-y-0.5">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="flex items-center gap-1.5">
                              <span
                                className="inline-block h-2 w-2 rounded-full"
                                style={{ backgroundColor: c.couleur }}
                              />
                              {c.metier}
                            </span>
                            <span className={cn("font-mono", dep && "text-destructive font-semibold")}>
                              {Number(c.heures_assignees).toFixed(0)}/{Number(c.heures_prevues).toFixed(0)}h
                            </span>
                          </div>
                          <Progress
                            value={Math.min(pct, 100)}
                            className={cn("h-1", dep && "[&>div]:bg-destructive")}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Équipe assignée */}
              <div className="mt-4 flex flex-wrap gap-3 border-t pt-3 text-[11px]">
                <div className="flex items-center gap-1.5">
                  <Users className="h-3 w-3 text-muted-foreground" />
                  <span className="font-semibold">{employesAssignes.length}</span>
                  <span className="text-muted-foreground">personne{employesAssignes.length > 1 ? "s" : ""}</span>
                </div>
                {cdi.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <Badge variant="secondary" className="text-[10px]">CDI</Badge>
                    <span className="text-muted-foreground">
                      {cdi.map((e) => `${e.prenom} ${e.nom[0]}.`).join(", ")}
                    </span>
                  </div>
                )}
                {interim.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px]">Intérim</Badge>
                    <span className="text-muted-foreground">
                      {interim.map((e) => `${e.prenom} ${e.nom[0]}.`).join(", ")}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
