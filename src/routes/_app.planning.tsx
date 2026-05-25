import { createFileRoute, useNavigate, stripSearchParams, redirect } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useMemo, useRef, useState } from "react";
import { startOfWeek, addDays } from "date-fns";
import { Calendar, Loader2, Search, FileDown, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { usePlanningData, type Employe } from "@/hooks/use-planning-data";
import { WeekPicker } from "@/components/planning/WeekPicker";
import { PlanningGrid } from "@/components/planning/PlanningGrid";
import { PlanningParChantier } from "@/components/planning/PlanningParChantier";
import { PlanningParObjet } from "@/components/planning/PlanningParObjet";
import { HeuresRestantesSidebar } from "@/components/planning/HeuresRestantesSidebar";
import { MultiFilter } from "@/components/planning/MultiFilter";
import { AddInterimDialog } from "@/components/planning/AddInterimDialog";
import { BulkStafferDialog } from "@/components/planning/BulkStafferDialog";
import { StaffingParPole } from "@/components/planning/par-pole/StaffingParPole";
import { useVehicules } from "@/hooks/use-vehicules";
import { useTrajetsWeek } from "@/hooks/use-trajets";
import { exportPlanningToPDF } from "@/lib/planning-export";
// PERF v0.30.1 — xlsx-js-style (~600 KB) chargé dynamiquement au clic export.
//   import { exportPlanningParObjetToXlsx, buildPlanningObjetXlsxFilename } from "@/lib/planning-objet-xlsx-export";
//   import { exportPlanningExcel } from "@/lib/planning-excel-export";
//   import { downloadBlob } from "@/lib/trajets-soustraitance-export";
import { TypologieMultiFilter } from "@/components/typologie/TypologieMultiFilter";
import { normalizeName } from "@/lib/string-normalize";
import {
  type AffaireTypologie,
  AFFAIRE_TYPOLOGIES,
  getAffaireTypologie,
} from "@/lib/affaire-typologie";
import { countActiveAffairesByTypologie } from "@/lib/typologie-active-counts";
import { useVocab } from "@/hooks/use-vocab";

const PLANNING_SEARCH_DEFAULTS = { typo: [] as AffaireTypologie[] };

const planningSearchSchema = z.object({
  typo: fallback(
    z.array(z.enum(AFFAIRE_TYPOLOGIES as [AffaireTypologie, ...AffaireTypologie[]])),
    [],
  ).default([]),
  // v0.48 — Legacy ?tab= : redirigé vers les nouvelles pages dédiées
  tab: fallback(z.string().optional(), undefined).optional(),
});

const LEGACY_TAB_REDIRECTS: Record<string, string> = {
  flotte: "/logistique/vehicules-planning",
  vehicules: "/logistique/vehicules-planning",
  budget: "/dashboard",
  feuilleroute: "/export/feuille-de-route",
};

export const Route = createFileRoute("/_app/planning")({
  head: () => ({
    meta: [
      { title: "Planning — Planning chantiers" },
      { name: "description", content: "Vue planning hebdomadaire des équipes sur les chantiers." },
    ],
  }),
  validateSearch: zodValidator(planningSearchSchema),
  search: { middlewares: [stripSearchParams(PLANNING_SEARCH_DEFAULTS)] },
  beforeLoad: ({ search }) => {
    const tab = (search as { tab?: string }).tab;
    if (tab && LEGACY_TAB_REDIRECTS[tab]) {
      throw redirect({ to: LEGACY_TAB_REDIRECTS[tab], replace: true });
    }
  },
  component: PlanningPage,
});

function PlanningPage() {
  const vocab = useVocab();
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const weekEnd = addDays(weekStart, 6);
  const [tab, setTab] = useState<"cdi" | "interim" | "parchantier" | "parobjet" | "parpole">("cdi");
  const { vehicules } = useVehicules();
  const { trajets } = useTrajetsWeek(weekStart, weekEnd);
  const [filterAffaire, setFilterAffaire] = useState<Set<string | number>>(new Set());
  const [filterMetier, setFilterMetier] = useState<Set<string | number>>(new Set());
  const [filterDevis, setFilterDevis] = useState<Set<string | number>>(new Set());
  const [showWeekend, setShowWeekend] = useState(false);
  const [searchEmploye, setSearchEmploye] = useState("");

  const navigate = useNavigate({ from: "/planning" });
  const { typo: typoFilter } = Route.useSearch();
  const setTypoFilter = (next: AffaireTypologie[]) => {
    navigate({ search: { typo: next }, replace: true });
  };
  // v0.48.1 — Plus de toggle "Inclure opportunités" : dérivé du filtre typologie.
  // typoFilter vide = aucune restriction → tout passe (proto inclus).
  // typoFilter actif = ne passent que les typologies cochées.
  const includeOpportunites = typoFilter.length === 0 || typoFilter.includes("prototype");

  const { metiers, employes, affaires, assignations, consommation, absences, chefsById, swapAssignationIds, devisLots, loading, error, refresh } =
    usePlanningData(weekStart, weekEnd);

  // Filtre recherche employé (prénom + nom, insensible casse/accent)
  const employesFiltres = useMemo(() => {
    const q = normalizeName(searchEmploye.trim());
    if (!q) return employes;
    return employes.filter((e) => normalizeName(`${e.prenom} ${e.nom}`).includes(q));
  }, [employes, searchEmploye]);

  const employesCDI = useMemo(
    () => employesFiltres.filter((e) => e.type_contrat === "CDI" || e.type_contrat === "CDD"),
    [employesFiltres],
  );
  // Intermittent/Indép. : ceux qui ont au moins une assignation sur la semaine
  // OU ceux ajoutés manuellement via le bouton "Ajouter un intermittent"
  const [extraInterims, setExtraInterims] = useState<Employe[]>([]);
  const [autoOpen, setAutoOpen] = useState<{ employe: Employe; date: Date } | null>(null);
  const [addInterimOpen, setAddInterimOpen] = useState(false);
  const [bulkStafferOpen, setBulkStafferOpen] = useState(false);

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

  // v0.24.0 — Filtre typologie : restreint l'ensemble d'affaires propagé downstream.
  // Si typoFilter actif : intersect avec filterAffaire si non-vide, sinon = toutes les affaires de la typo.
  const affaireIdsByTypo = useMemo(() => {
    if (typoFilter.length === 0) return null;
    const set = new Set(typoFilter);
    return new Set(
      affaires
        .filter((a) => {
          const t = getAffaireTypologie(a.numero);
          return t !== null && set.has(t);
        })
        .map((a) => a.id),
    );
  }, [affaires, typoFilter]);

  const filterAffaireStr: Set<string> = useMemo(() => {
    const explicit = filterAffaire as Set<string>;
    if (!affaireIdsByTypo) return explicit;
    if (explicit.size === 0) return affaireIdsByTypo;
    // intersect
    const out = new Set<string>();
    explicit.forEach((id) => {
      if (affaireIdsByTypo.has(id)) out.add(id);
    });
    return out;
  }, [filterAffaire, affaireIdsByTypo]);

  // v0.29.2 — Compteurs typologies actifs : voir countActiveAffairesByTypologie.
  const typoCounts = useMemo(
    () => countActiveAffairesByTypologie(affaires),
    [affaires],
  );

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
          ? "Intermittent / Indép."
          : tab === "parchantier"
            ? "Planning par chantier"
            : tab === "parobjet"
              ? "Planning par objet"
              : "Par pôle";
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

  async function handleExportObjetXlsx() {
    setExporting(true);
    try {
      // PERF v0.30.1 — chargement dynamique de xlsx-js-style au clic
      const [{ exportPlanningParObjetToXlsx, buildPlanningObjetXlsxFilename }, { downloadBlob }] =
        await Promise.all([
          import("@/lib/planning-objet-xlsx-export"),
          import("@/lib/trajets-soustraitance-export"),
        ]);
      const blob = await exportPlanningParObjetToXlsx({
        weekStart,
        showWeekend,
        affaires,
        employes,
        assignations,
        filterAffaireIds: filterAffaireStr,
        filterMetierIds: filterMetierNum,
      });
      downloadBlob(blob, buildPlanningObjetXlsxFilename(weekStart));
      toast.success("Export Excel généré");
    } catch (e) {
      console.error(e);
      toast.error(`Échec export Excel : ${(e as Error).message}`);
    } finally {
      setExporting(false);
    }
  }

  async function handleExportWeekXlsx() {
    setExporting(true);
    try {
      // PERF v0.30.1 — chargement dynamique de xlsx-js-style au clic
      const { exportPlanningExcel } = await import("@/lib/planning-excel-export");
      exportPlanningExcel({
        weekStart,
        metiers,
        employes,
        affaires,
        assignations,
        consommation,
        absences,
        chefsById,
        vehicules,
        trajets,
      });
      toast.success("Export Excel généré");
    } catch (e) {
      console.error(e);
      toast.error(`Échec export Excel : ${(e as Error).message}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-y-auto p-3 sm:p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <Calendar className="h-5 w-5 shrink-0 text-primary sm:h-6 sm:w-6" />
            <h1 className="text-lg font-bold sm:text-2xl">Planning hebdomadaire</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <WeekPicker weekStart={weekStart} onChange={setWeekStart} />
            <Button
              size="sm"
              onClick={() => setBulkStafferOpen(true)}
              disabled={loading}
              className="h-8 px-2.5 sm:h-9 sm:px-3"
            >
              <Users className="mr-1.5 h-3.5 w-3.5" />
              <span className="hidden sm:inline">{vocab.assignerEnLot}</span>
              <span className="sm:hidden">{vocab.assignerEnLot.split(" ")[0]}</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleExportPDF}
              disabled={exporting || loading}
              className="h-8 px-2.5 sm:h-9 sm:px-3"
            >
              {exporting ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileDown className="mr-1.5 h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">Exporter PDF</span>
              <span className="sm:hidden">PDF</span>
            </Button>
            {tab === "parobjet" ? (
              <Button
                size="sm"
                variant="outline"
                onClick={handleExportObjetXlsx}
                disabled={exporting || loading}
                className="h-8 px-2.5 sm:h-9 sm:px-3"
                title="Export Excel matriciel objets × jours"
              >
                {exporting ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileDown className="mr-1.5 h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline">Export Excel objets</span>
                <span className="sm:hidden">Excel</span>
              </Button>
            ) : (tab === "cdi" || tab === "interim") ? (
              <Button
                size="sm"
                variant="outline"
                onClick={handleExportWeekXlsx}
                disabled={exporting || loading}
                className="h-8 px-2.5 sm:h-9 sm:px-3"
                title="Export Excel complet (CDI, Intermittent, Synthèse, Heures, Flotte)"
              >
                {exporting ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileDown className="mr-1.5 h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline">Export Excel</span>
                <span className="sm:hidden">Excel</span>
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-auto">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Rechercher un employé…"
              value={searchEmploye}
              onChange={(e) => setSearchEmploye(e.target.value)}
              className="h-9 w-full pl-8 sm:w-[220px]"
            />
          </div>
          <MultiFilter
            label="Affaires"
            options={affairesOptions}
            selected={filterAffaire}
            onChange={setFilterAffaire}
          />
          <div className="basis-full" />
          <TypologieMultiFilter
            value={typoFilter}
            onChange={setTypoFilter}
            counts={typoCounts}
            className="-mt-1"
          />
          <div className="basis-full" />
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
              <div className="-mx-3 overflow-x-auto sm:mx-0">
                <TabsList className="mx-3 inline-flex w-max sm:mx-0">
                  <TabsTrigger value="cdi">
                    CDI / CDD <span className="ml-1.5 text-[10px] opacity-60">({employesCDI.length})</span>
                  </TabsTrigger>
                  <TabsTrigger value="interim">
                    Intermittent <span className="ml-1.5 text-[10px] opacity-60">({employesInterim.length})</span>
                  </TabsTrigger>
                  <TabsTrigger value="parchantier">
                    <span className="hidden sm:inline">Planning par chantier</span>
                    <span className="sm:hidden">Par chantier</span>
                  </TabsTrigger>
                  <TabsTrigger value="parobjet">
                    <span className="hidden sm:inline">Planning par objet</span>
                    <span className="sm:hidden">Par objet</span>
                  </TabsTrigger>
                  <TabsTrigger value="parpole">
                    <span className="hidden sm:inline">Par pôle</span>
                    <span className="sm:hidden">Pôle</span>
                  </TabsTrigger>
                </TabsList>
              </div>

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
                    Affiche les intermittent. / indép. déjà staffés cette semaine. Utilise « Ajouter »
                    pour staffer un nouvel intermittent depuis la base.
                  </p>
                  <Button size="sm" onClick={() => setAddInterimOpen(true)}>
                    <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                    Ajouter un intermittent
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
                  emptyMessage="Aucun employé intermittent / indépendant staffé cette semaine. Clique sur « Ajouter un intermittent »."
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
                  devisLots={devisLots}
                  showWeekend={showWeekend}
                  filterAffaireIds={filterAffaireStr}
                  filterMetierIds={filterMetierNum}
                  onSelectAffaire={handleSelectAffaireFromSynthese}
                  onChanged={refresh}
                />
              </TabsContent>

              <TabsContent value="parobjet" className="mt-4">
                <PlanningParObjet
                  weekStart={weekStart}
                  affaires={affaires}
                  employes={employes}
                  metiers={metiers}
                  assignations={assignations}
                  consommation={consommation}
                  devisLots={devisLots}
                  showWeekend={showWeekend}
                  filterAffaireIds={filterAffaireStr}
                  filterMetierIds={filterMetierNum}
                  onChanged={refresh}
                />
              </TabsContent>

              <TabsContent value="parpole" className="mt-4">
                <StaffingParPole
                  weekStart={weekStart}
                  weekEnd={weekEnd}
                  showWeekend={showWeekend}
                  inclureOpportunites={includeOpportunites}
                  filtresMetierIds={filterMetierNum.size > 0 ? Array.from(filterMetierNum) : undefined}
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
          // Switch sur l'onglet intermittent au cas où on ouvrirait depuis ailleurs
          setTab("interim");
          // Ajoute à la liste visible si pas déjà là
          setExtraInterims((prev) =>
            prev.some((p) => p.id === emp.id) ? prev : [...prev, emp],
          );
          // Ouvre le dialog d'assignation sur le lundi de la semaine
          setAutoOpen({ employe: emp, date: weekStart });
        }}
      />

      <BulkStafferDialog
        open={bulkStafferOpen}
        onOpenChange={setBulkStafferOpen}
        weekStart={weekStart}
        employes={employes}
        affaires={affaires}
        metiers={metiers}
        devisLots={devisLots}
        assignations={assignations}
        onSaved={refresh}
      />

    </div>
  );
}
