import { useMemo } from "react";
import { addDays, format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { MapPin, Users, AlertTriangle, HardHat, Calendar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { DualProgress } from "@/components/ui/dual-progress";
import { cn } from "@/lib/utils";
import type {
  Affaire,
  Assignation,
  ChefRef,
  DevisConsommation,
  Employe,
  Metier,
} from "@/hooks/use-planning-data";

// Regroupement des 8 métiers en 4 pôles "ateliers"
const POLES: { key: string; label: string; codes: string[] }[] = [
  { key: "etude", label: "Bureau d'étude / Plans", codes: ["suivi_projet"] },
  { key: "fab", label: "Fabrication atelier", codes: ["numerique", "construction", "metallerie"] },
  { key: "finition", label: "Finition", codes: ["peinture", "tapisserie"] },
  { key: "pose", label: "Pose / Dépose", codes: ["logistique", "machiniste"] },
];

interface Props {
  weekStart: Date;
  affaires: Affaire[];
  employes: Employe[];
  metiers: Metier[];
  assignations: Assignation[];
  consommation: DevisConsommation[];
  chefsById: Map<string, ChefRef>;
  onSelectAffaire: (affaireId: string) => void;
}

export function PlanningSynthese({
  weekStart,
  affaires,
  employes,
  metiers,
  assignations,
  consommation,
  chefsById,
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
        const totalRealisees = consoLignes.reduce(
          (s, l) => s + Number(l.heures_reelles_validees || 0),
          0,
        );
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
                        ? chefsById.get(affaire.chef_chantier_id) ??
                          employesById.get(affaire.chef_chantier_id)
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

              {/* Récap heures par pôle (4 colonnes) */}
              {consoLignes.length > 0 && (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between gap-4 text-[11px]">
                    <span className="font-semibold uppercase tracking-wide text-muted-foreground">
                      Heures par pôle
                    </span>
                    <span className={cn("font-mono font-semibold", depassement && "text-destructive")}>
                      {totalAssignees.toFixed(0)}h staffées · {totalRealisees.toFixed(0)}h réalisées /{" "}
                      {totalPrevues.toFixed(0)}h budget
                    </span>
                  </div>
                  <DualProgress
                    staffees={totalAssignees}
                    realisees={totalRealisees}
                    budget={totalPrevues}
                    size="sm"
                    showLabel={false}
                  />
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {POLES.map((pole) => {
                      // Métiers de ce pôle existant en BDD
                      const metiersPole = metiers.filter((m) => pole.codes.includes(m.code));
                      const lignesPole = consoLignes.filter((c) =>
                        metiersPole.some((m) => m.id === c.metier_id),
                      );
                      const polePrevues = lignesPole.reduce(
                        (s, l) => s + Number(l.heures_prevues || 0),
                        0,
                      );
                      const poleAssignees = lignesPole.reduce(
                        (s, l) => s + Number(l.heures_assignees || 0),
                        0,
                      );
                      const polePct = polePrevues > 0 ? (poleAssignees / polePrevues) * 100 : 0;
                      const poleDep = polePct > 100;

                      return (
                        <div
                          key={pole.key}
                          className="rounded-md border border-border/60 bg-muted/20 p-2"
                        >
                          <div className="mb-1.5 flex items-center justify-between gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-foreground">
                              {pole.label}
                            </span>
                            {polePrevues > 0 && (
                              <span
                                className={cn(
                                  "font-mono text-[10px] font-semibold",
                                  poleDep && "text-destructive",
                                )}
                              >
                                {poleAssignees.toFixed(0)}/{polePrevues.toFixed(0)}h
                              </span>
                            )}
                          </div>
                          {lignesPole.length === 0 ? (
                            <p className="text-[10px] italic text-muted-foreground">
                              Aucun budget devis
                            </p>
                          ) : (
                            <div className="space-y-1.5">
                              {(() => {
                                // Agrégation par métier (somme tous devis confondus)
                                const parMetier = new Map<
                                  number,
                                  { metier: string; couleur: string; prevues: number; assignees: number }
                                >();
                                for (const l of lignesPole) {
                                  const ex = parMetier.get(l.metier_id);
                                  if (ex) {
                                    ex.prevues += Number(l.heures_prevues || 0);
                                    ex.assignees += Number(l.heures_assignees || 0);
                                  } else {
                                    parMetier.set(l.metier_id, {
                                      metier: l.metier,
                                      couleur: l.couleur,
                                      prevues: Number(l.heures_prevues || 0),
                                      assignees: Number(l.heures_assignees || 0),
                                    });
                                  }
                                }
                                return Array.from(parMetier.entries()).map(([mid, agg]) => {
                                  const pct = agg.prevues > 0 ? (agg.assignees / agg.prevues) * 100 : 0;
                                  const dep = pct > 100;
                                  return (
                                    <div key={mid} className="space-y-0.5">
                                      <div className="flex items-center justify-between text-[10px]">
                                        <span className="flex min-w-0 items-center gap-1.5">
                                          <span
                                            className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
                                            style={{ backgroundColor: agg.couleur }}
                                          />
                                          <span className="truncate">{agg.metier}</span>
                                        </span>
                                        <span
                                          className={cn(
                                            "ml-1 font-mono",
                                            dep && "font-semibold text-destructive",
                                          )}
                                        >
                                          {agg.assignees.toFixed(0)}/{agg.prevues.toFixed(0)}
                                        </span>
                                      </div>
                                      <Progress
                                        value={Math.min(pct, 100)}
                                        className={cn("h-1", dep && "[&>div]:bg-destructive")}
                                      />
                                    </div>
                                  );
                                });
                              })()}
                            </div>
                          )}
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
