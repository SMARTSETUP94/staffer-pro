import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { startOfWeek, addDays, format } from "date-fns";
import { Calendar, Loader2, Search, FileDown, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { usePlanningData, type Employe } from "@/hooks/use-planning-data";
import { WeekPicker } from "@/components/planning/WeekPicker";
import { PlanningGrid } from "@/components/planning/PlanningGrid";
import { PlanningSynthese } from "@/components/planning/PlanningSynthese";
import { PlanningParChantier } from "@/components/planning/PlanningParChantier";
import { HeuresRestantesSidebar } from "@/components/planning/HeuresRestantesSidebar";
import { MultiFilter } from "@/components/planning/MultiFilter";
import { AddInterimDialog } from "@/components/planning/AddInterimDialog";
import { FlotteGrid } from "@/components/planning/FlotteGrid";
import { TrajetDialog } from "@/components/flotte/TrajetDialog";
import { useVehicules, type Trajet } from "@/hooks/use-vehicules";
import { useTrajetsWeek } from "@/hooks/use-trajets";
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
  const [tab, setTab] = useState<"cdi" | "interim" | "parchantier" | "budget" | "flotte">("cdi");
  const [trajetDlgOpen, setTrajetDlgOpen] = useState(false);
  const [editTrajet, setEditTrajet] = useState<Trajet | null>(null);
  const [defaultTrajetVehId, setDefaultTrajetVehId] = useState<string | null>(null);
  const [defaultTrajetDate, setDefaultTrajetDate] = useState<string | undefined>(undefined);
  const { vehicules } = useVehicules();
  const { trajets, refresh: refreshTrajets } = useTrajetsWeek(weekStart, weekEnd);
  const [filterAffaire, setFilterAffaire] = useState<Set<string | number>>(new Set());
  const [filterMetier, setFilterMetier] = useState<Set<string | number>>(new Set());
  const [filterDevis, setFilterDevis] = useState<Set<string | number>>(new Set());
  const [showWeekend, setShowWeekend] = useState(false);
  const [includeOpportunites, setIncludeOpportunites] = useState(false);
  const [searchEmploye, setSearchEmploye] = useState("");

  const { metiers, employes, affaires, assignations, consommation, absences, chefsById, swapAssignationIds, devisLots, loading, error, refresh } =
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
  // Intérim/Indép. : ceux qui ont au moins une assignation sur la semaine
  // OU ceux ajoutés manuellement via le bouton "Ajouter un intérimaire"
  const [extraInterims, setExtraInterims] = useState<Employe[]>([]);
  const [autoOpen, setAutoOpen] = useState<{ employe: Employe; date: Date } | null>(null);
  const [addInterimOpen, setAddInterimOpen] = useState(false);

  const employesInterim = useMemo(() => {
    const assignedIds = new Set(assignations.map((a) => a.employe_id));
    const extraIds = new Set(extraInterims.map((e) => e.id));
    const baseFiltered = employesFiltres.filter(
      (e) =>
        (e.type_contrat === "Interim" || e.type_contrat === "Independant") &&
        (assignedIds.has(e.id) || extraIds.has(e.id)),
    );
    // Ajoute les extras qui ne sont pas dans employesFiltres (filtre recherche par ex)
    const baseIds = new Set(baseFiltered.map((e) => e.id));
    const missingExtras = extraInterims.filter((e) => !baseIds.has(e.id));
    return [...baseFiltered, ...missingExtras];
  }, [employesFiltres, assignations, extraInterims]);

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
        .filter((a) => {
          // v0.17 — Inclut les opportunités uniquement si toggle activé
          if (a.phase === "opportunite") return includeOpportunites;
          return affairesActivesIds.has(a.id);
        })
        .map((a) => ({
          id: a.id,
          label: a.numero,
          sub: a.phase === "opportunite" ? `🟡 PROTO · ${a.nom}` : a.nom,
        })),
    [affaires, affairesActivesIds, includeOpportunites],
  );

  const metiersOptions = useMemo(
    () => metiers.map((m) => ({ id: m.id, label: m.libelle, color: m.couleur })),
    [metiers],
  );

  // v0.15.1 — Options "Lot" : visibles uniquement quand 1+ affaire(s) filtrée(s) avec ≥2 lots actifs au total.
  // Si aucune affaire filtrée, on liste les lots des affaires actives (peut être grand → on requiert filterAffaire).
  const lotsOptions = useMemo(() => {
    const affaireIdsActives = filterAffaire.size > 0
      ? new Set(Array.from(filterAffaire).map(String))
      : null;
    const filtered = devisLots.filter((d) => {
      if (d.statut === "termine" || d.statut === "cloture") return false;
      if (affaireIdsActives && !affaireIdsActives.has(d.affaire_id)) return false;
      return true;
    });
    return filtered.map((d) => {
      const aff = affaires.find((a) => a.id === d.affaire_id);
      const aff_label = aff ? `${aff.numero}` : "";
      const sub = d.libelle ? `${aff_label} — ${d.libelle}` : aff_label;
      return { id: d.id, label: d.numero, sub };
    });
  }, [devisLots, filterAffaire, affaires]);

  const handleSelectAffaireFromSynthese = (affaireId: string) => {
    setFilterAffaire(new Set([affaireId]));
    setFilterDevis(new Set());
    setTab("cdi");
  };

  const filterAffaireStr = filterAffaire as Set<string>;
  const filterMetierNum = filterMetier as Set<number>;
  const filterDevisStr = filterDevis as Set<string>;

  const exportRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  async function handleExportPDF() {
    const root = exportRef.current;
    if (!root) return;
    // Cible : la grille de l'onglet actif (ou la zone synthèse complète)
    const target =
      (root.querySelector('[data-planning-grid-export]') as HTMLElement | null) ?? root;
    const tabLabel =
      tab === "cdi"
        ? "CDI / CDD"
        : tab === "interim"
          ? "Intérim / Indép."
          : tab === "parchantier"
            ? "Planning par chantier"
            : tab === "budget"
              ? "Budget chantier"
              : "Véhicules staffés";
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
          {/* v0.15.1 — Sélecteur lot : visible si ≥2 lots actifs disponibles dans le contexte courant */}
          {lotsOptions.length >= 2 && (
            <MultiFilter
              label="Lot"
              options={lotsOptions}
              selected={filterDevis}
              onChange={setFilterDevis}
            />
          )}
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
          <div className="ml-2 flex items-center gap-2">
            <Switch
              id="opp-toggle"
              checked={includeOpportunites}
              onCheckedChange={setIncludeOpportunites}
            />
            <Label htmlFor="opp-toggle" className="text-xs text-muted-foreground cursor-pointer">
              Inclure opportunités (proto)
            </Label>
          </div>
          {(filterAffaire.size > 0 || filterMetier.size > 0 || filterDevis.size > 0 || searchEmploye) && (
            <button
              onClick={() => {
                setFilterAffaire(new Set());
                setFilterMetier(new Set());
                setFilterDevis(new Set());
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
                <TabsTrigger value="parchantier">Planning par chantier</TabsTrigger>
                <TabsTrigger value="budget">Budget chantier</TabsTrigger>
                <TabsTrigger value="flotte">Véhicules staffés ({vehicules.filter((v) => v.actif).length})</TabsTrigger>
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
                  filterDevisIds={filterDevisStr}
                  devisLots={devisLots}
                  showWeekend={showWeekend}
                  emptyMessage="Aucun employé CDI/CDD actif."
                  onChanged={refresh}
                  swapAssignationIds={swapAssignationIds}
                />
              </TabsContent>

              <TabsContent value="interim" className="mt-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    Affiche les intérim. / indép. déjà staffés cette semaine. Utilise « Ajouter »
                    pour staffer un nouvel intérimaire depuis la base.
                  </p>
                  <Button size="sm" onClick={() => setAddInterimOpen(true)}>
                    <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                    Ajouter un intérimaire
                  </Button>
                </div>
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
                  filterDevisIds={filterDevisStr}
                  devisLots={devisLots}
                  showWeekend={showWeekend}
                  emptyMessage="Aucun employé intérimaire / indépendant staffé cette semaine. Clique sur « Ajouter un intérimaire »."
                  onChanged={refresh}
                  swapAssignationIds={swapAssignationIds}
                  openAssignationFor={autoOpen}
                  onAutoOpenConsumed={() => setAutoOpen(null)}
                />
              </TabsContent>

              <TabsContent value="parchantier" className="mt-4">
                <PlanningParChantier
                  weekStart={weekStart}
                  affaires={affaires}
                  employes={employes}
                  metiers={metiers}
                  assignations={assignations}
                  consommation={consommation}
                  showWeekend={showWeekend}
                  filterAffaireIds={filterAffaireStr}
                  filterMetierIds={filterMetierNum}
                  onSelectAffaire={handleSelectAffaireFromSynthese}
                />
              </TabsContent>

              <TabsContent value="budget" className="mt-4">
                <PlanningSynthese
                  weekStart={weekStart}
                  affaires={affaires}
                  employes={employes}
                  metiers={metiers}
                  assignations={assignations}
                  consommation={consommation}
                  chefsById={chefsById}
                  onSelectAffaire={handleSelectAffaireFromSynthese}
                />
              </TabsContent>

              <TabsContent value="flotte" className="mt-4">
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
                    setTrajetDlgOpen(true);
                  }}
                  onEditTrajet={(t) => {
                    setEditTrajet(t);
                    setDefaultTrajetVehId(null);
                    setDefaultTrajetDate(undefined);
                    setTrajetDlgOpen(true);
                  }}
                  onAddTrajetSousTraite={(d) => {
                    setEditTrajet(null);
                    setDefaultTrajetVehId(null);
                    setDefaultTrajetDate(format(d, "yyyy-MM-dd"));
                    setTrajetDlgOpen(true);
                  }}
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

      <AddInterimDialog
        open={addInterimOpen}
        onOpenChange={setAddInterimOpen}
        alreadyVisibleIds={new Set(employesInterim.map((e) => e.id))}
        onSelect={(emp) => {
          // Switch sur l'onglet intérim au cas où on ouvrirait depuis ailleurs
          setTab("interim");
          // Ajoute à la liste visible si pas déjà là
          setExtraInterims((prev) =>
            prev.some((p) => p.id === emp.id) ? prev : [...prev, emp],
          );
          // Ouvre le dialog d'assignation sur le lundi de la semaine
          setAutoOpen({ employe: emp, date: weekStart });
        }}
      />

      <TrajetDialog
        open={trajetDlgOpen}
        onOpenChange={setTrajetDlgOpen}
        trajet={editTrajet}
        defaultDate={defaultTrajetDate}
        defaultVehiculeId={defaultTrajetVehId}
        affaires={affaires.map((a) => ({ id: a.id, numero: a.numero, nom: a.nom }))}
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
    </div>
  );
}
