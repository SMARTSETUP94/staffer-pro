import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { startOfWeek, addDays, format } from "date-fns";
import { Truck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { usePlanningData } from "@/hooks/use-planning-data";
import { useVehicules, type Trajet } from "@/hooks/use-vehicules";
import { useTrajetsWeek } from "@/hooks/use-trajets";
import { WeekPicker } from "@/components/planning/WeekPicker";
import { FlotteGrid } from "@/components/planning/FlotteGrid";
import { SuggestionsTrajetsBloc } from "@/components/planning/SuggestionsTrajetsBloc";
import { TrajetDialog } from "@/components/flotte/TrajetDialog";
import { ExportTrajetsSoustraitanceDialog } from "@/components/flotte/ExportTrajetsSoustraitanceDialog";
import { PageBreadcrumbs } from "@/components/PageBreadcrumbs";
import type { TrajetSuggestion } from "@/lib/trajets-suggestions";
import { requireCapability } from "@/lib/capability-guard";

export const Route = createFileRoute("/_app/logistique/vehicules-planning")({
  beforeLoad: () => requireCapability("section.logistique"),
  head: () => ({
    meta: [
      { title: "Véhicules planning — Logistique" },
      { name: "description", content: "Planning hebdomadaire des véhicules de la flotte." },
    ],
  }),
  component: VehiculesPlanningPage,
});

function VehiculesPlanningPage() {
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const weekEnd = addDays(weekStart, 6);
  const [showWeekend, setShowWeekend] = useState(false);
  const { vehicules } = useVehicules();
  const { trajets, refresh: refreshTrajets } = useTrajetsWeek(weekStart, weekEnd);
  const { employes, affaires, loading, error } = usePlanningData(weekStart, weekEnd);

  const [trajetDlgOpen, setTrajetDlgOpen] = useState(false);
  const [exportSousTraitanceOpen, setExportSousTraitanceOpen] = useState(false);
  const [editTrajet, setEditTrajet] = useState<Trajet | null>(null);
  const [defaultTrajetVehId, setDefaultTrajetVehId] = useState<string | null>(null);
  const [defaultTrajetDate, setDefaultTrajetDate] = useState<string | undefined>(undefined);
  const [defaultPrefill, setDefaultPrefill] = useState<{
    adresseDepart?: string;
    adresseArrivee?: string;
    categorie?: "pose" | "depose" | "livraison_fourniture" | "recuperation_materiel" | "autre";
    affaireId?: string | null;
  }>({});

  return (
    <div className="h-full overflow-y-auto p-3 sm:p-6">
      <PageBreadcrumbs
        steps={[{ label: "Logistique" }, { label: "Véhicules planning" }]}
        className="mb-3"
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 sm:gap-3">
          <Truck className="h-5 w-5 shrink-0 text-primary sm:h-6 sm:w-6" />
          <h1 className="text-lg font-bold sm:text-2xl">
            Véhicules planning <span className="text-sm font-normal text-muted-foreground">({vehicules.filter((v) => v.actif).length} actifs)</span>
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <WeekPicker weekStart={weekStart} onChange={setWeekStart} />
          <div className="ml-2 flex items-center gap-2">
            <Switch id="weekend-toggle" checked={showWeekend} onCheckedChange={setShowWeekend} />
            <Label htmlFor="weekend-toggle" className="text-xs text-muted-foreground cursor-pointer">
              Week-end
            </Label>
          </div>
          <Button size="sm" variant="outline" onClick={() => setExportSousTraitanceOpen(true)}>
            <Truck className="mr-1.5 h-3.5 w-3.5" />
            Exporter trajets sous-traités
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          Erreur de chargement : {error}
        </div>
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-4">
          <SuggestionsTrajetsBloc
            weekStart={weekStart}
            weekEnd={weekEnd}
            affaires={affaires.map((a) => ({
              id: a.id,
              numero: a.numero,
              nom: a.nom,
              lieu: a.lieu,
              date_montage: a.date_montage,
              date_demontage: a.date_demontage,
            }))}
            trajets={trajets.map((t) => ({
              affaire_id: t.affaire_id,
              date: t.date,
              adresse_depart: t.adresse_depart,
              adresse_arrivee: t.adresse_arrivee,
            }))}
            onAccepter={(s: TrajetSuggestion, altAdresse?: string) => {
              setEditTrajet(null);
              setDefaultTrajetVehId(null);
              setDefaultTrajetDate(s.date);
              setDefaultPrefill({
                adresseDepart: s.adresse_depart,
                adresseArrivee: altAdresse ?? s.adresse_arrivee,
                categorie: s.type === "montage" ? "pose" : "depose",
                affaireId: s.affaire.id,
              });
              setTrajetDlgOpen(true);
            }}
          />
          <FlotteGrid
            weekStart={weekStart}
            vehicules={vehicules}
            trajets={trajets}
            employesById={new Map(employes.map((e) => [e.id, { id: e.id, prenom: e.prenom, nom: e.nom }]))}
            affairesById={new Map(affaires.map((a) => [a.id, { id: a.id, numero: a.numero }]))}
            showWeekend={showWeekend}
            onAddTrajet={(vId, d) => {
              setEditTrajet(null);
              setDefaultTrajetVehId(vId);
              setDefaultTrajetDate(format(d, "yyyy-MM-dd"));
              setDefaultPrefill({});
              setTrajetDlgOpen(true);
            }}
            onEditTrajet={(t) => {
              setEditTrajet(t);
              setDefaultTrajetVehId(null);
              setDefaultTrajetDate(undefined);
              setDefaultPrefill({});
              setTrajetDlgOpen(true);
            }}
            onAddTrajetSousTraite={(d) => {
              setEditTrajet(null);
              setDefaultTrajetVehId(null);
              setDefaultTrajetDate(format(d, "yyyy-MM-dd"));
              setDefaultPrefill({});
              setTrajetDlgOpen(true);
            }}
          />
        </div>
      )}

      <TrajetDialog
        open={trajetDlgOpen}
        onOpenChange={setTrajetDlgOpen}
        trajet={editTrajet}
        defaultDate={defaultTrajetDate}
        defaultVehiculeId={defaultTrajetVehId}
        defaultAdresseDepart={defaultPrefill.adresseDepart}
        defaultAdresseArrivee={defaultPrefill.adresseArrivee}
        defaultCategorie={defaultPrefill.categorie}
        defaultAffaireId={defaultPrefill.affaireId}
        affaires={affaires.map((a) => ({
          id: a.id,
          numero: a.numero,
          nom: a.nom,
          phase: a.phase,
          statut: a.statut,
          client: a.client,
          lieu: a.lieu,
        }))}
        employesLivreurs={employes
          .filter((e) => e.est_livreur)
          .map((e) => ({
            id: e.id,
            prenom: e.prenom,
            nom: e.nom,
            est_livreur: true,
            actif: true,
            categories_permis: e.categories_permis ?? [],
          }))}
        onSaved={() => void refreshTrajets()}
      />

      <ExportTrajetsSoustraitanceDialog
        open={exportSousTraitanceOpen}
        onOpenChange={setExportSousTraitanceOpen}
      />
    </div>
  );
}
