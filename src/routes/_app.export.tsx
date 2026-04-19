import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { startOfWeek, addDays, format } from "date-fns";
import { fr } from "date-fns/locale";
import { FileDown, Loader2, FileSpreadsheet, Users, Briefcase, LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { WeekPicker } from "@/components/planning/WeekPicker";
import { usePlanningData } from "@/hooks/use-planning-data";
import { exportPlanningExcel } from "@/lib/planning-excel-export";

export const Route = createFileRoute("/_app/export")({
  head: () => ({ meta: [{ title: "Export planning — Planning chantiers" }] }),
  component: ExportPage,
});

function ExportPage() {
  const [weekStart, setWeekStart] = useState<Date>(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 }),
  );
  const weekEnd = addDays(weekStart, 6);
  const [exporting, setExporting] = useState(false);

  const data = usePlanningData(weekStart, weekEnd);

  const cdiCount = data.employes.filter(
    (e) => e.type_contrat === "CDI" || e.type_contrat === "CDD",
  ).length;
  const assignedIds = new Set(data.assignations.map((a) => a.employe_id));
  const interimCount = data.employes.filter(
    (e) =>
      (e.type_contrat === "Interim" || e.type_contrat === "Independant") &&
      assignedIds.has(e.id),
  ).length;
  const affairesActivesCount = new Set(data.assignations.map((a) => a.affaire_id)).size;

  async function handleExport() {
    if (data.loading) return;
    setExporting(true);
    try {
      exportPlanningExcel({
        weekStart,
        metiers: data.metiers,
        employes: data.employes,
        affaires: data.affaires,
        assignations: data.assignations,
        consommation: data.consommation,
        absences: data.absences,
        chefsById: data.chefsById,
      });
      toast.success("Export Excel généré");
    } catch (e) {
      console.error(e);
      toast.error("Échec de l'export Excel");
    } finally {
      setExporting(false);
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
            Export hebdomadaire matriciel
          </CardTitle>
          <CardDescription>
            Génère un classeur Excel avec 3 feuilles : CDI/CDD, Intérim/Indép. et Synthèse chantier.
            Mise en forme couleur par métier, en-têtes figés et largeurs adaptées.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Semaine à exporter
            </p>
            <WeekPicker weekStart={weekStart} onChange={setWeekStart} />
            <p className="mt-2 text-sm text-muted-foreground">
              Du {format(weekStart, "EEEE d MMMM", { locale: fr })} au{" "}
              {format(weekEnd, "EEEE d MMMM yyyy", { locale: fr })}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard icon={Users} label="CDI / CDD" value={cdiCount} loading={data.loading} />
            <StatCard
              icon={Briefcase}
              label="Intérim / Indép. staffés"
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

          <div className="flex items-center justify-between border-t pt-4">
            <p className="text-xs text-muted-foreground">
              Le fichier sera téléchargé automatiquement (.xlsx).
            </p>
            <Button onClick={handleExport} disabled={data.loading || exporting} size="lg">
              {exporting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileDown className="mr-2 h-4 w-4" />
              )}
              Télécharger Excel
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4 max-w-3xl">
        <CardHeader>
          <CardTitle className="text-base">Contenu du classeur</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            <li className="flex gap-2">
              <span className="font-semibold text-primary">Feuille 1 — CDI/CDD :</span>
              <span className="text-muted-foreground">
                Matrice employé × jour (lun → dim) avec affaires et absences (CP, FORM, RTT, AM…)
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold text-primary">Feuille 2 — Intérim/Indép. :</span>
              <span className="text-muted-foreground">
                Idem, restreint aux intérimaires et indépendants staffés sur la semaine.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold text-primary">Feuille 3 — Synthèse chantier :</span>
              <span className="text-muted-foreground">
                Une ligne par affaire, équipe par jour (initiales par métier), total équipe-jours
                et heures restantes au budget.
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
