import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { startOfWeek, addDays } from "date-fns";
import { Calendar, Loader2, Search, FileDown } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { usePlanningData } from "@/hooks/use-planning-data";
import { WeekPicker } from "@/components/planning/WeekPicker";
import { PlanningGrid } from "@/components/planning/PlanningGrid";
import { PlanningSynthese } from "@/components/planning/PlanningSynthese";
import { HeuresRestantesSidebar } from "@/components/planning/HeuresRestantesSidebar";
import { MultiFilter } from "@/components/planning/MultiFilter";
import { exportPlanningToPDF } from "@/lib/planning-export";

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

  const { metiers, employes, affaires, assignations, consommation, absences, chefsById, loading, error, refresh } =
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
    () => employesFiltres.filter((e) => e.type_contrat === "CDI" || e.type_contrat === "CDD"),
    [employesFiltres],
  );
  // Intérim/Indép. : uniquement ceux qui ont au moins une assignation sur la semaine
  const employesInterim = useMemo(() => {
    const assignedIds = new Set(assignations.map((a) => a.employe_id));
    return employesFiltres.filter(
      (e) =>
        (e.type_contrat === "Interim" || e.type_contrat === "Independant") &&
        assignedIds.has(e.id),
    );
  }, [employesFiltres, assignations]);

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

  const exportRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  async function handleExportPDF() {
    const root = exportRef.current;
    if (!root) return;
    // Cible : la grille de l'onglet actif (ou la zone synthèse complète)
    const target =
      (root.querySelector('[data-planning-grid-export]') as HTMLElement | null) ?? root;
    const tabLabel =
      tab === "cdi" ? "CDI / CDD" : tab === "interim" ? "Intérim / Indép." : "Synthèse chantier";
    setExporting(true);
    try {
      await exportPlanningToPDF(target, { weekStart, tabLabel });
      toast.success("PDF généré");
    } catch (e) {
      console.error(e);
      toast.error("Échec de l'export PDF");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Calendar className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Planning hebdomadaire</h1>
          </div>
          <div className="flex items-center gap-2">
            <WeekPicker weekStart={weekStart} onChange={setWeekStart} />
            <Button
              size="sm"
              variant="outline"
              onClick={handleExportPDF}
              disabled={exporting || loading}
            >
              {exporting ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileDown className="mr-1.5 h-3.5 w-3.5" />
              )}
              Exporter PDF
            </Button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Rechercher un employé…"
              value={searchEmploye}
              onChange={(e) => setSearchEmploye(e.target.value)}
              className="h-9 w-[220px] pl-8"
            />
          </div>
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
          <div className="ml-2 flex items-center gap-2">
            <Switch
              id="weekend-toggle"
              checked={showWeekend}
              onCheckedChange={setShowWeekend}
            />
            <Label htmlFor="weekend-toggle" className="text-xs text-muted-foreground cursor-pointer">
              Week-end
            </Label>
          </div>
          {(filterAffaire.size > 0 || filterMetier.size > 0 || searchEmploye) && (
            <button
              onClick={() => {
                setFilterAffaire(new Set());
                setFilterMetier(new Set());
                setSearchEmploye("");
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
          <div ref={exportRef}>
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
                  showWeekend={showWeekend}
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
                  showWeekend={showWeekend}
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
          </div>
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
