import { createFileRoute } from "@tanstack/react-router";
import { requireCapability } from "@/lib/capability-guard";
import { useMemo, useState } from "react";
import { startOfWeek, addDays, addWeeks, format, differenceInCalendarWeeks } from "date-fns";
import { fr } from "date-fns/locale";
import {
  FileDown,
  Loader2,
  FileSpreadsheet,
  Users,
  Briefcase,
  LayoutGrid,
  AlertTriangle,
  Archive,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { WeekPicker } from "@/components/planning/WeekPicker";
import { usePlanningData } from "@/hooks/use-planning-data";
// v0.24.1 — lazy-load des helpers d'export (xlsx, jszip ~600KB) au clic
import { useVehicules } from "@/hooks/use-vehicules";
import { useTrajetsWeek } from "@/hooks/use-trajets";
import { TypologieMultiFilter } from "@/components/typologie/TypologieMultiFilter";
import {
  type AffaireTypologie,
  getAffaireTypologie,
} from "@/lib/affaire-typologie";
import { countActiveAffairesByTypologie } from "@/lib/typologie-active-counts";

export const Route = createFileRoute("/_app/export/")({
  beforeLoad: () => requireCapability("section.admin"),
  head: () => ({ meta: [{ title: "Export planning — Planning chantiers" }] }),
  component: ExportPage,
});

const MAX_WEEKS = 4;

function ExportPage() {
  const [weekStart, setWeekStart] = useState<Date>(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 }),
  );
  const [weekEndStart, setWeekEndStart] = useState<Date>(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 }),
  );
  const [exporting, setExporting] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [typoFilter, setTypoFilter] = useState<AffaireTypologie[]>([]);

  // Sécurise l'ordre + plafonne à 4 semaines
  const { rangeStart, weekCount, tooMany } = useMemo(() => {
    const a = weekStart.getTime();
    const b = weekEndStart.getTime();
    const start = a <= b ? weekStart : weekEndStart;
    const endStart = a <= b ? weekEndStart : weekStart;
    const count = differenceInCalendarWeeks(endStart, start, { weekStartsOn: 1 }) + 1;
    return {
      rangeStart: start,
      weekCount: count,
      tooMany: count > MAX_WEEKS,
    };
  }, [weekStart, weekEndStart]);

  const effectiveCount = Math.min(weekCount, MAX_WEEKS);
  const effectiveEndStart = addWeeks(rangeStart, effectiveCount - 1);
  const rangeEnd = addDays(effectiveEndStart, 6);

  const weekStarts = useMemo(
    () => Array.from({ length: effectiveCount }, (_, i) => addWeeks(rangeStart, i)),
    [rangeStart, effectiveCount],
  );

  // On charge la plage entière en une seule passe
  const data = usePlanningData(rangeStart, rangeEnd);
  const { vehicules } = useVehicules();
  const { trajets } = useTrajetsWeek(rangeStart, rangeEnd);

  // v0.24.x — Filtre typologie : restreint l'univers exporté.
  const typoSet = useMemo(() => new Set(typoFilter), [typoFilter]);
  const affairesFiltrees = useMemo(() => {
    if (typoSet.size === 0) return data.affaires;
    return data.affaires.filter((a) => {
      const t = getAffaireTypologie(a.numero);
      return t !== null && typoSet.has(t);
    });
  }, [data.affaires, typoSet]);
  const affaireIdsFiltres = useMemo(
    () => new Set(affairesFiltrees.map((a) => a.id)),
    [affairesFiltrees],
  );
  const assignationsFiltrees = useMemo(() => {
    if (typoSet.size === 0) return data.assignations;
    return data.assignations.filter((a) => affaireIdsFiltres.has(a.affaire_id));
  }, [data.assignations, affaireIdsFiltres, typoSet]);

  // v0.29.2 — Compteurs typologie actifs (exclut terminé/annulé/démontage passé).
  const typoCounts = useMemo(
    () => countActiveAffairesByTypologie(data.affaires),
    [data.affaires],
  );

  const cdiCount = data.employes.filter(
    (e) => e.type_contrat === "CDI" || e.type_contrat === "CDD",
  ).length;
  const assignedIds = new Set(assignationsFiltrees.map((a) => a.employe_id));
  const interimCount = data.employes.filter(
    (e) =>
      (e.type_contrat === "Interim" || e.type_contrat === "Independant") && assignedIds.has(e.id),
  ).length;
  const affairesActivesCount = new Set(assignationsFiltrees.map((a) => a.affaire_id)).size;

  async function handleExport() {
    if (data.loading) return;
    setExporting(true);
    try {
      const { exportPlanningExcelRange } = await import("@/lib/planning-excel-export");
      exportPlanningExcelRange({
        weekStarts,
        metiers: data.metiers,
        employes: data.employes,
        affaires: affairesFiltrees,
        assignations: assignationsFiltrees,
        consommation: data.consommation,
        absences: data.absences,
        chefsById: data.chefsById,
        vehicules: vehicules.filter((v) => v.actif).map((v) => ({
          id: v.id,
          nom: v.nom,
          immatriculation: v.immatriculation,
          type: v.type,
        })),
        trajets: trajets.map((t) => ({
          id: t.id,
          date: t.date,
          heure_depart: t.heure_depart,
          vehicule_id: t.vehicule_id,
          chauffeur_id: t.chauffeur_id,
          adresse_depart: t.adresse_depart,
          adresse_arrivee: t.adresse_arrivee,
          categorie: t.categorie,
          statut_soustraitance: t.statut_soustraitance,
        })),
      });
      toast.success(
        weekStarts.length > 1
          ? `Export Excel généré (${weekStarts.length} semaines)`
          : "Export Excel généré",
      );
    } catch (e) {
      console.error(e);
      toast.error("Échec de l'export Excel");
    } finally {
      setExporting(false);
    }
  }

  async function handleExportZip() {
    if (data.loading) return;
    setZipping(true);
    try {
      const { exportPlanningZip } = await import("@/lib/planning-zip-export");
      const res = await exportPlanningZip({
        weekStarts,
        rangeStart,
        rangeEnd,
        metiers: data.metiers,
        employes: data.employes,
        affaires: affairesFiltrees,
        assignations: assignationsFiltrees,
        consommation: data.consommation,
        absences: data.absences,
        chefsById: data.chefsById,
        vehicules: vehicules.filter((v) => v.actif).map((v) => ({
          id: v.id,
          nom: v.nom,
          immatriculation: v.immatriculation,
          type: v.type,
        })),
        trajets: trajets.map((t) => ({
          id: t.id,
          date: t.date,
          heure_depart: t.heure_depart,
          vehicule_id: t.vehicule_id,
          chauffeur_id: t.chauffeur_id,
          adresse_depart: t.adresse_depart,
          adresse_arrivee: t.adresse_arrivee,
          categorie: t.categorie,
          statut_soustraitance: t.statut_soustraitance,
        })),
      });
      toast.success(`Archive téléchargée : ${res.files.length} fichier(s)`);
    } catch (e) {
      console.error(e);
      toast.error("Échec de l'export zip");
    } finally {
      setZipping(false);
    }
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center gap-3">
        <FileDown className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Export planning Excel</h1>
      </div>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Export matriciel multi-semaines
          </CardTitle>
          <CardDescription>
            Sélectionne 1 à {MAX_WEEKS} semaines consécutives. Le classeur contient 4 feuilles par
            semaine (CDI/CDD, Intermittent, Synthèse, Heures), suffixées par S{"{n°}"}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Semaine de début
              </Label>
              <WeekPicker weekStart={weekStart} onChange={setWeekStart} />
            </div>
            <div>
              <Label className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Semaine de fin
              </Label>
              <WeekPicker weekStart={weekEndStart} onChange={setWeekEndStart} />
            </div>
          </div>

          <div className="rounded-md border bg-muted/20 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                Du {format(rangeStart, "EEE d MMM", { locale: fr })} au{" "}
                {format(rangeEnd, "EEE d MMM yyyy", { locale: fr })}
              </span>
              <span className="font-medium">
                {effectiveCount} semaine{effectiveCount > 1 ? "s" : ""} · {effectiveCount * 4}{" "}
                feuilles
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Filtrer par typologie de chantier
            </Label>
            <TypologieMultiFilter
              value={typoFilter}
              onChange={setTypoFilter}
              counts={typoCounts}
            />
            {typoFilter.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {affairesFiltrees.length} affaire{affairesFiltrees.length > 1 ? "s" : ""} retenue
                {affairesFiltrees.length > 1 ? "s" : ""} sur {data.affaires.length}.
              </p>
            )}
          </div>

          {tooMany && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Plage limitée à {MAX_WEEKS} semaines. Seules les {MAX_WEEKS} premières seront
                exportées (du {format(rangeStart, "d MMM", { locale: fr })} au{" "}
                {format(addDays(addWeeks(rangeStart, MAX_WEEKS - 1), 6), "d MMM yyyy", {
                  locale: fr,
                })}
                ).
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard icon={Users} label="CDI / CDD" value={cdiCount} loading={data.loading} />
            <StatCard
              icon={Briefcase}
              label="Intermittent / Indép. staffés"
              value={interimCount}
              loading={data.loading}
            />
            <StatCard
              icon={LayoutGrid}
              label="Affaires actives"
              value={affairesActivesCount}
              loading={data.loading}
            />
          </div>

          {data.error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              Erreur de chargement : {data.error}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p className="text-xs text-muted-foreground">
              Le fichier sera téléchargé automatiquement.
            </p>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleExportZip}
                disabled={data.loading || zipping || exporting}
                size="lg"
                variant="outline"
              >
                {zipping ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Archive className="mr-2 h-4 w-4" />
                )}
                Exporter toutes les vues (.zip)
              </Button>
              <Button onClick={handleExport} disabled={data.loading || exporting || zipping} size="lg">
                {exporting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileDown className="mr-2 h-4 w-4" />
                )}
                Télécharger Excel
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4 max-w-3xl">
        <CardHeader>
          <CardTitle className="text-base">Contenu du classeur (par semaine)</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            <li className="flex gap-2">
              <span className="font-semibold text-primary">S{"{n°}"} CDI-CDD :</span>
              <span className="text-muted-foreground">
                Matrice employé × jour avec affaires et absences (CP, FORM, RTT, AM…).
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold text-primary">S{"{n°}"} Intermittent :</span>
              <span className="text-muted-foreground">
                Idem, restreint aux intermittents et indépendants staffés sur la semaine.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold text-primary">S{"{n°}"} Synthèse :</span>
              <span className="text-muted-foreground">
                Une ligne par affaire, équipe par jour, total équipe-jours et heures restantes.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold text-primary">S{"{n°}"} Heures :</span>
              <span className="text-muted-foreground">
                Total heures, demi-journées, absences et taux d'occupation par CDI/CDD.
              </span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  loading: boolean;
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold">
        {loading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : value}
      </div>
    </div>
  );
}
