import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { startOfWeek, addDays } from "date-fns";
import { Calendar, Loader2, Search } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { usePlanningData } from "@/hooks/use-planning-data";
import { WeekPicker } from "@/components/planning/WeekPicker";
import { PlanningGrid } from "@/components/planning/PlanningGrid";
import { PlanningSynthese } from "@/components/planning/PlanningSynthese";
import { HeuresRestantesSidebar } from "@/components/planning/HeuresRestantesSidebar";
import { MultiFilter } from "@/components/planning/MultiFilter";

export const Route = createFileRoute("/_app/planning")({
  head: () => ({
    meta: [
      { title: "Planning — Planning chantiers" },
      { name: "description", content: "Vue planning hebdomadaire des équipes sur les chantiers." },
    ],
  }),
  component: PlanningPage,
});

function PlanningPage() {
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const weekEnd = addDays(weekStart, 6);
  const [tab, setTab] = useState<"cdi" | "interim" | "synthese">("cdi");
  const [filterAffaire, setFilterAffaire] = useState<Set<string | number>>(new Set());
  const [filterMetier, setFilterMetier] = useState<Set<string | number>>(new Set());
  const [showWeekend, setShowWeekend] = useState(false);
  const [searchEmploye, setSearchEmploye] = useState("");

  const { metiers, employes, affaires, assignations, consommation, absences, loading, error, refresh } =
    usePlanningData(weekStart, weekEnd);

  // Filtre recherche employé (prénom + nom, insensible casse/accent)
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  const employesFiltres = useMemo(() => {
    const q = norm(searchEmploye.trim());
    if (!q) return employes;
    return employes.filter((e) => norm(`${e.prenom} ${e.nom}`).includes(q));
  }, [employes, searchEmploye]);

  const employesCDI = useMemo(
    () => employes.filter((e) => e.type_contrat === "CDI" || e.type_contrat === "CDD"),
    [employes],
  );
  // Intérim/Indép. : uniquement ceux qui ont au moins une assignation sur la semaine
  const employesInterim = useMemo(() => {
    const assignedIds = new Set(assignations.map((a) => a.employe_id));
    return employes.filter(
      (e) =>
        (e.type_contrat === "Interim" || e.type_contrat === "Independant") &&
        assignedIds.has(e.id),
    );
  }, [employes, assignations]);

  // Affaires actives cette semaine pour le filtre (toutes celles qui apparaissent dans les assignations OU avec heures budgétées)
  const affairesActivesIds = useMemo(() => {
    const ids = new Set<string>();
    assignations.forEach((a) => ids.add(a.affaire_id));
    consommation.forEach((c) => ids.add(c.affaire_id));
    return ids;
  }, [assignations, consommation]);

  const affairesOptions = useMemo(
    () =>
      affaires
        .filter((a) => affairesActivesIds.has(a.id))
        .map((a) => ({ id: a.id, label: a.numero, sub: a.nom })),
    [affaires, affairesActivesIds],
  );

  const metiersOptions = useMemo(
    () => metiers.map((m) => ({ id: m.id, label: m.libelle, color: m.couleur })),
    [metiers],
  );

  const handleSelectAffaireFromSynthese = (affaireId: string) => {
    setFilterAffaire(new Set([affaireId]));
    setTab("cdi");
  };

  const filterAffaireStr = filterAffaire as Set<string>;
  const filterMetierNum = filterMetier as Set<number>;

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Calendar className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Planning hebdomadaire</h1>
          </div>
          <WeekPicker weekStart={weekStart} onChange={setWeekStart} />
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <MultiFilter
            label="Affaires"
            options={affairesOptions}
            selected={filterAffaire}
            onChange={setFilterAffaire}
          />
          <MultiFilter
            label="Métiers"
            options={metiersOptions}
            selected={filterMetier}
            onChange={setFilterMetier}
          />
          {(filterAffaire.size > 0 || filterMetier.size > 0) && (
            <button
              onClick={() => {
                setFilterAffaire(new Set());
                setFilterMetier(new Set());
              }}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              Réinitialiser les filtres
            </button>
          )}
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
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value="cdi">
                CDI / CDD <span className="ml-1.5 text-[10px] opacity-60">({employesCDI.length})</span>
              </TabsTrigger>
              <TabsTrigger value="interim">
                Intérim / Indép. <span className="ml-1.5 text-[10px] opacity-60">({employesInterim.length})</span>
              </TabsTrigger>
              <TabsTrigger value="synthese">Synthèse chantier</TabsTrigger>
            </TabsList>

            <TabsContent value="cdi" className="mt-4">
              <PlanningGrid
                weekStart={weekStart}
                employes={employesCDI}
                metiers={metiers}
                affaires={affaires}
                assignations={assignations}
                consommation={consommation}
                absences={absences}
                filterAffaireIds={filterAffaireStr}
                filterMetierIds={filterMetierNum}
                emptyMessage="Aucun employé CDI/CDD actif."
                onChanged={refresh}
              />
            </TabsContent>

            <TabsContent value="interim" className="mt-4">
              <PlanningGrid
                weekStart={weekStart}
                employes={employesInterim}
                metiers={metiers}
                affaires={affaires}
                assignations={assignations}
                consommation={consommation}
                absences={absences}
                filterAffaireIds={filterAffaireStr}
                filterMetierIds={filterMetierNum}
                emptyMessage="Aucun employé intérimaire / indépendant actif."
                onChanged={refresh}
              />
            </TabsContent>

            <TabsContent value="synthese" className="mt-4">
              <PlanningSynthese
                weekStart={weekStart}
                affaires={affaires}
                employes={employes}
                metiers={metiers}
                assignations={assignations}
                consommation={consommation}
                onSelectAffaire={handleSelectAffaireFromSynthese}
              />
            </TabsContent>
          </Tabs>
        )}
      </div>

      <aside className="hidden w-[260px] shrink-0 overflow-y-auto border-l bg-muted/20 p-4 xl:block">
        <HeuresRestantesSidebar
          affaires={affaires}
          consommation={consommation}
          filterAffaireIds={filterAffaireStr}
        />
      </aside>
    </div>
  );
}
