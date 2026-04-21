import { useMemo } from "react";
import { addDays, format, isSameDay } from "date-fns";
import { fr } from "date-fns/locale";
import { Truck, Plus, AlertTriangle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  alerteDate,
  alerteCT,
  dateExpirationCT,
  VEHICULE_TYPE_LABEL,
  type Trajet,
  type Vehicule,
} from "@/hooks/use-vehicules";

interface EmployeMini {
  id: string;
  prenom: string;
  nom: string;
}
interface AffaireMini {
  id: string;
  numero: string;
}

interface Props {
  weekStart: Date;
  vehicules: Vehicule[];
  trajets: Trajet[];
  employesById: Map<string, EmployeMini>;
  affairesById: Map<string, AffaireMini>;
  showWeekend: boolean;
  onAddTrajet: (vehiculeId: string, date: Date) => void;
  onEditTrajet: (trajet: Trajet) => void;
}

export function FlotteGrid({
  weekStart,
  vehicules,
  trajets,
  employesById,
  affairesById,
  showWeekend,
  onAddTrajet,
  onEditTrajet,
}: Props) {
  const days = useMemo(() => {
    const all = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    return showWeekend ? all : all.filter((d) => d.getDay() !== 0 && d.getDay() !== 6);
  }, [weekStart, showWeekend]);

  const trajetsByVehDay = useMemo(() => {
    const m = new Map<string, Trajet[]>();
    trajets.forEach((t) => {
      const vId = t.vehicule_id ?? "__sst__";
      const key = `${vId}::${t.date}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(t);
    });
    return m;
  }, [trajets]);

  const sousTraitanceTrajets = useMemo(
    () => trajets.filter((t) => t.statut_soustraitance !== "non"),
    [trajets],
  );

  // v0.15.2 — Pour les véhicules loués/sous-traités, on les masque du planning
  // hors de leur plage [date_debut_location, date_fin_location]. Si une seule borne
  // est définie, on respecte uniquement celle-ci. Si aucune borne, le véhicule
  // s'affiche normalement (rétro-compat).
  const vehiculesActifs = useMemo(() => {
    const weekStartStr = format(weekStart, "yyyy-MM-dd");
    const weekEndStr = format(addDays(weekStart, 6), "yyyy-MM-dd");
    return vehicules
      .filter((v) => {
        if (!v.actif) return false;
        const isLoue = v.proprietaire === "location" || v.proprietaire === "sous_traitance";
        if (!isLoue) return true;
        // Au moins un jour de la semaine doit être dans la plage de location
        if (v.date_debut_location && weekEndStr < v.date_debut_location) return false;
        if (v.date_fin_location && weekStartStr > v.date_fin_location) return false;
        return true;
      })
      .sort((a, b) => a.nom.localeCompare(b.nom));
  }, [vehicules, weekStart]);

  if (vehiculesActifs.length === 0) {
    return (
      <div className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
        Aucun véhicule actif. Ajoute un véhicule depuis{" "}
        <a href="/flotte" className="underline">
          la page Flotte
        </a>
        .
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="overflow-x-auto rounded-md border bg-card" data-planning-grid-export>
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
            <tr>
              <th className="sticky left-0 z-20 w-[200px] border-b border-r bg-muted/60 px-3 py-2 text-left text-xs font-semibold">
                Véhicule
              </th>
              {days.map((d) => (
                <th
                  key={d.toISOString()}
                  className={cn(
                    "border-b border-r px-2 py-2 text-center text-xs font-semibold min-w-[140px]",
                    isSameDay(d, new Date()) && "bg-primary/10",
                  )}
                >
                  <div>{format(d, "EEE", { locale: fr })}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {format(d, "d MMM", { locale: fr })}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vehiculesActifs.map((v) => {
              const ctAlert = alerteCT(v.date_controle_technique);
              const ctEcheance = dateExpirationCT(v.date_controle_technique);
              const revAlert = alerteDate(v.date_prochaine_revision);
              const assAlert = alerteDate(v.date_expiration_assurance);
              const hasAlert = [ctAlert, revAlert, assAlert].some(
                (a) => a === "warning" || a === "expired",
              );
              return (
                <tr key={v.id} className="hover:bg-muted/20">
                  <td className="sticky left-0 z-10 w-[200px] border-b border-r bg-card px-3 py-2 align-top">
                    <div className="flex items-start gap-2">
                      <Truck className="mt-0.5 h-4 w-4 text-primary shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <span className="font-semibold truncate">{v.nom}</span>
                          {hasAlert && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <AlertTriangle className="h-3 w-3 text-warning shrink-0" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <div className="text-xs space-y-0.5">
                                  {ctAlert !== "ok" && ctAlert !== "none" && (
                                    <div>CT (échéance) : {ctEcheance}</div>
                                  )}
                                  {revAlert !== "ok" && revAlert !== "none" && (
                                    <div>Révision : {v.date_prochaine_revision}</div>
                                  )}
                                  {assAlert !== "ok" && assAlert !== "none" && (
                                    <div>Assurance : {v.date_expiration_assurance}</div>
                                  )}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {VEHICULE_TYPE_LABEL[v.type]} · {v.permis_requis}
                        </div>
                        {v.immatriculation && (
                          <div className="text-[10px] font-mono text-muted-foreground">
                            {v.immatriculation}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  {days.map((d) => {
                    const dateStr = format(d, "yyyy-MM-dd");
                    const cellTrajets = trajetsByVehDay.get(`${v.id}::${dateStr}`) ?? [];
                    return (
                      <td
                        key={d.toISOString()}
                        className={cn(
                          "relative border-b border-r px-1 py-1 align-top min-h-[60px]",
                          isSameDay(d, new Date()) && "bg-primary/5",
                        )}
                      >
                        <div className="space-y-1">
                          {cellTrajets.map((t) => {
                            const driver = t.chauffeur_id ? employesById.get(t.chauffeur_id) : null;
                            const aff = t.affaire_id ? affairesById.get(t.affaire_id) : null;
                            return (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => onEditTrajet(t)}
                                className="block w-full rounded border bg-primary/5 px-1.5 py-1 text-left text-[11px] hover:bg-primary/10"
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <span className="font-semibold truncate">
                                    {t.heure_depart ? t.heure_depart.slice(0, 5) : "—"}
                                  </span>
                                  {t.parent_trajet_id && (
                                    <span className="text-[8px] uppercase opacity-60">retour</span>
                                  )}
                                </div>
                                <div className="truncate text-muted-foreground">
                                  {driver ? `${driver.prenom} ${driver.nom[0]}.` : "Sans chauffeur"}
                                </div>
                                {aff && (
                                  <div className="truncate text-[10px] text-primary">
                                    {aff.numero}
                                  </div>
                                )}
                              </button>
                            );
                          })}
                          <button
                            type="button"
                            onClick={() => onAddTrajet(v.id, d)}
                            className="flex w-full items-center justify-center rounded border border-dashed py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sousTraitanceTrajets.length > 0 && (
        <div className="mt-4 rounded-md border bg-warning/5 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ExternalLink className="h-4 w-4 text-warning" />
              <span className="font-semibold text-sm">À sous-traiter</span>
              <Badge variant="outline">{sousTraitanceTrajets.length}</Badge>
            </div>
            <a
              href="/export/demandes-devis"
              className="text-xs text-primary underline-offset-2 hover:underline"
            >
              Voir les demandes transport →
            </a>
          </div>
          <div className="space-y-1">
            {sousTraitanceTrajets.slice(0, 5).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onEditTrajet(t)}
                className="flex w-full items-center justify-between gap-2 rounded border bg-card px-2 py-1 text-xs hover:bg-accent"
              >
                <span className="font-mono">{format(new Date(t.date + "T00:00:00"), "dd/MM")}</span>
                <span className="flex-1 truncate text-left">
                  {t.adresse_depart} → {t.adresse_arrivee}
                </span>
                <Badge variant="secondary" className="text-[9px]">
                  {t.statut_soustraitance === "a_sous_traiter"
                    ? "à envoyer"
                    : t.statut_soustraitance}
                </Badge>
              </button>
            ))}
            {sousTraitanceTrajets.length > 5 && (
              <p className="text-[10px] text-muted-foreground text-center pt-1">
                + {sousTraitanceTrajets.length - 5} autre(s)
              </p>
            )}
          </div>
        </div>
      )}
    </TooltipProvider>
  );
}
