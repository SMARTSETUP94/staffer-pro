import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Info, Loader2, RotateCcw, Upload } from "lucide-react";
import { toast } from "sonner";
import { requireCapability } from "@/lib/capability-guard";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { PageBreadcrumbs } from "@/components/PageBreadcrumbs";
import { ImportsTabsNav } from "@/components/ImportsTabsNav";
import { ImportErrorBoundary } from "@/components/imports/ImportErrorBoundary";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  countIssues, downloadIssuesCsv, exceptionToIssue, type ImportIssue,
} from "@/lib/import-validation";
import {
  parsePlanningWorkbook, normLabel, HEURES_PAR_PERSONNE_JOUR,
  type ParsedPlanning, type SheetInput,
} from "@/lib/imports/planning-xlsx";
import {
  buildPlanningPlan, type HeuresConflictMode, type OrigineHeures, type PlanningPlan,
} from "@/lib/imports/planning-plan";
import { applyPlanningImport, type ApplyReport } from "@/lib/imports/planning-apply";

export const Route = createFileRoute("/_app/imports/planning")({
  beforeLoad: () => requireCapability("section.admin"),
  head: () => ({
    meta: [
      { title: "Import planning Excel — Setup Paris" },
      { name: "description", content: "Amorçage des données de planning atelier depuis le classeur Excel mensuel." },
      { property: "og:title", content: "Import planning Excel — Setup Paris" },
      { property: "og:description", content: "Import des onglets Fabrication, Livraisons et Affectations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <ImportErrorBoundary label="Import planning">
      <PlanningImportPage />
    </ImportErrorBoundary>
  ),
});

type Step = 1 | 2 | 3;

function PlanningImportPage() {
  const [step, setStep] = useState<Step>(1);
  const [filename, setFilename] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [sheets, setSheets] = useState<SheetInput | null>(null);
  const [parsed, setParsed] = useState<ParsedPlanning | null>(null);
  const [plan, setPlan] = useState<PlanningPlan | null>(null);
  const [report, setReport] = useState<ApplyReport | null>(null);

  // Options
  const [withFab, setWithFab] = useState(true);
  const [withLiv, setWithLiv] = useState(true);
  const [withAff, setWithAff] = useState(false);
  const [origine, setOrigine] = useState<OrigineHeures>("ajout");
  const [heuresMode, setHeuresMode] = useState<HeuresConflictMode>("replace");
  const [createAffaires, setCreateAffaires] = useState(false);

  const reset = () => {
    setStep(1); setFilename(null); setSheets(null); setParsed(null); setPlan(null); setReport(null);
  };

  /* ------------------------------------------------- étape 1 : lecture fichier */
  const readFile = useCallback(async (file: File) => {
    setBusy(true);
    try {
      const XLSX = await import("xlsx-js-style");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const out: SheetInput = {};
      for (const name of wb.SheetNames) {
        const ws = wb.Sheets[name];
        if (!ws) continue;
        out[name] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as unknown[][];
      }
      setSheets(out);
      setFilename(file.name);
      setParsed(null);
      setPlan(null);
      setReport(null);
      setStep(1);
    } catch (err) {
      toast.error(exceptionToIssue(err).message);
    } finally {
      setBusy(false);
    }
  }, []);

  /* --------------------------------- étape 2 : parse + résolution + validation */
  const buildPreview = useCallback(async () => {
    if (!sheets) return;
    setBusy(true);
    try {
      const p = parsePlanningWorkbook(sheets, {
        fabrication: withFab,
        livraisons: withLiv,
        affectations: withAff,
      });
      setParsed(p);

      const codes = [...new Set(p.fabrication.map((r) => r.code).filter(Boolean))];
      const affairesByCode = new Map<string, { id: string; nom: string }>();
      for (let i = 0; i < codes.length; i += 200) {
        const { data } = await supabase
          .from("affaires")
          .select("id, numero, nom")
          .in("numero", codes.slice(i, i + 200));
        for (const a of data ?? []) affairesByCode.set(a.numero, { id: a.id, nom: a.nom });
      }
      // Rattrapage par nom pour l'onglet Livraisons.
      const { data: allAffaires } = await supabase.from("affaires").select("id, numero, nom").limit(2000);
      for (const a of allAffaires ?? []) {
        if (!affairesByCode.has(a.numero)) affairesByCode.set(a.numero, { id: a.id, nom: a.nom });
      }

      const employesByPrenom = new Map<string, { id: string; prenom: string; nom: string; metier_principal_id: number | null }[]>();
      if (withAff) {
        const { data: emps } = await supabase
          .from("employes")
          .select("id, prenom, nom, metier_principal_id")
          .eq("actif", true);
        for (const e of emps ?? []) {
          const key = normLabel(e.prenom);
          if (!key) continue;
          const list = employesByPrenom.get(key) ?? [];
          list.push({ id: e.id, prenom: e.prenom, nom: e.nom, metier_principal_id: e.metier_principal_id ?? null });
          employesByPrenom.set(key, list);
        }
      }

      setPlan(buildPlanningPlan(p, { affairesByCode, employesByPrenom, origine, withAffectations: withAff }));
      setStep(2);
    } catch (err) {
      toast.error(exceptionToIssue(err, "Analyse du classeur").message);
    } finally {
      setBusy(false);
    }
  }, [sheets, withFab, withLiv, withAff, origine]);

  /* ------------------------------------------------------- étape 3 : exécution */
  const runImport = useCallback(async () => {
    if (!plan) return;
    setBusy(true);
    try {
      const r = await applyPlanningImport(plan, {
        createAffaires,
        heuresMode,
        withAffectations: withAff,
        withMontage: withLiv,
      });
      setReport(r);
      setStep(3);
      if (r.erreurs.length > 0) toast.warning(`Import terminé avec ${r.erreurs.length} erreur(s).`);
      else toast.success("Import planning terminé.");
    } catch (err) {
      toast.error(exceptionToIssue(err, "Import").message);
    } finally {
      setBusy(false);
    }
  }, [plan, createAffaires, heuresMode, withAff, withLiv]);

  const counts = useMemo(() => countIssues(plan?.issues ?? []), [plan]);
  const detected = parsed?.sheets ?? [];

  return (
    <div className="space-y-6 p-6">
      <PageBreadcrumbs steps={[{ label: "Imports" }, { label: "Planning Excel" }]} />
      <PageHeader
        title="Import du planning Excel"
        description="Amorçage des affaires, objets, heures prévues et effectif prévisionnel depuis le classeur mensuel."
      />
      <ImportsTabsNav />

      {/* ---------------------------------------------------------- Étape 1 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1 · Dépôt du classeur</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void readFile(f);
            }}
            className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
              dragOver ? "border-primary bg-primary/5" : "border-border"
            }`}
          >
            <Upload className="h-6 w-6 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">
              Glissez le fichier <strong>.xlsx</strong> ici, ou
            </p>
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".xlsx,.xlsm"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void readFile(f);
                }}
              />
              <span className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm font-medium">
                <FileSpreadsheet className="h-4 w-4" aria-hidden /> Choisir un fichier
              </span>
            </label>
            {filename && <p className="text-sm font-medium">{filename}</p>}
          </div>

          {sheets && (
            <div className="space-y-3">
              <p className="text-sm font-medium">Onglets à importer</p>
              <div className="flex flex-wrap gap-4">
                <CheckOption id="fab" checked={withFab} onChange={setWithFab} label="Fabrication" />
                <CheckOption id="liv" checked={withLiv} onChange={setWithLiv} label="Livraisons & Chantiers" />
                <CheckOption id="aff" checked={withAff} onChange={setWithAff} label="Affectations nominatives" />
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                {Object.keys(sheets).map((n) => (
                  <Badge key={n} variant="outline">{n}</Badge>
                ))}
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Origine des heures créées</Label>
                <RadioGroup
                  value={origine}
                  onValueChange={(v) => setOrigine(v as OrigineHeures)}
                  className="flex gap-6"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="ajout" id="orig-ajout" />
                    <Label htmlFor="orig-ajout" className="text-sm font-normal">Ajout planning (défaut)</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="devis" id="orig-devis" />
                    <Label htmlFor="orig-devis" className="text-sm font-normal">Devis</Label>
                  </div>
                </RadioGroup>
              </div>
              <Button onClick={() => void buildPreview()} disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Analyser le classeur
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------- Étape 2 */}
      {step >= 2 && plan && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2 · Prévisualisation et contrôles</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Affaires" value={plan.totals.affaires} hint={`dont ${plan.totals.affairesACreer} à créer`} />
              <Stat label="Objets" value={plan.totals.objets} />
              <Stat label="Lignes d'heures" value={plan.totals.lignesHeures} hint={`${plan.totals.joursHommes} j·h × ${HEURES_PAR_PERSONNE_JOUR} h`} />
              <Stat label="Lignes de planning" value={plan.totals.lignesPlanning} />
              <Stat label="Affectations" value={plan.totals.affectations} hint={`${plan.prenomsNonResolus.length} prénom(s) non résolu(s)`} />
              <Stat label="Erreurs" value={counts.errors} />
              <Stat label="Avertissements" value={counts.warnings} />
              <Stat label="Informations" value={counts.infos} />
            </div>

            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {detected.map((s) => (
                <Badge key={s.name} variant="secondary">
                  {s.name} · {s.kind ?? "non reconnu"} · {s.rows} lignes
                </Badge>
              ))}
            </div>

            <Separator />

            <div className="space-y-3">
              <CheckOption
                id="create-affaires"
                checked={createAffaires}
                onChange={setCreateAffaires}
                label={`Créer les ${plan.totals.affairesACreer} affaire(s) manquante(s)`}
              />
              <div className="space-y-2">
                <Label className="text-sm">Heures déjà présentes sur un objet × métier</Label>
                <RadioGroup
                  value={heuresMode}
                  onValueChange={(v) => setHeuresMode(v as HeuresConflictMode)}
                  className="flex gap-6"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="replace" id="h-replace" />
                    <Label htmlFor="h-replace" className="text-sm font-normal">Remplacer (ré-import idempotent)</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="cumulate" id="h-cumulate" />
                    <Label htmlFor="h-cumulate" className="text-sm font-normal">Cumuler</Label>
                  </div>
                </RadioGroup>
              </div>
              {plan.totals.affairesACreer > 0 && !createAffaires && (
                <p className="text-sm text-amber-600">
                  Les lignes des affaires inconnues seront ignorées tant que la création n'est pas cochée.
                </p>
              )}
            </div>

            <IssuesTable issues={plan.issues} filename={filename} />

            <div className="flex gap-2">
              <Button onClick={() => void runImport()} disabled={busy || counts.errors > 0}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Lancer l'import
              </Button>
              <Button variant="outline" onClick={reset} disabled={busy}>
                <RotateCcw className="mr-2 h-4 w-4" aria-hidden /> Recommencer
              </Button>
            </div>
            {counts.errors > 0 && (
              <p className="text-sm text-destructive">
                Corrigez les {counts.errors} erreur(s) bloquante(s) dans le fichier avant d'importer.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ---------------------------------------------------------- Étape 3 */}
      {step === 3 && report && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden /> 3 · Rapport d'import
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Affaires créées" value={report.affairesCreees} />
              <Stat label="Affaires mises à jour" value={report.affairesMisesAJour} />
              <Stat label="Objets créés" value={report.objetsCrees} hint={`${report.objetsExistants} déjà présents`} />
              <Stat label="Heures créées" value={report.heuresCreees} hint={`${report.heuresMisesAJour} mises à jour`} />
              <Stat label="Planning créé" value={report.planningCree} hint={`${report.planningMisAJour} mis à jour`} />
              <Stat label="Assignations créées" value={report.assignationsCreees} hint={`${report.assignationsExistantes} déjà présentes`} />
              <Stat label="Affaires ignorées" value={report.affairesIgnorees.length} />
              <Stat label="Erreurs" value={report.erreurs.length} />
            </div>
            {report.erreurs.length > 0 && (
              <ul className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                {report.erreurs.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
            <Button variant="outline" onClick={reset}>
              <RotateCcw className="mr-2 h-4 w-4" aria-hidden /> Nouvel import
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CheckOption({
  id, checked, onChange, label,
}: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      <Label htmlFor={id} className="text-sm font-normal">{label}</Label>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function IssuesTable({ issues, filename }: { issues: ImportIssue[]; filename: string | null }) {
  if (issues.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune anomalie détectée.</p>;
  }
  const shown = issues.slice(0, 100);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Anomalies ({issues.length})</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => downloadIssuesCsv(issues, `anomalies-planning-${filename ?? "import"}.csv`)}
        >
          <Download className="mr-2 h-4 w-4" aria-hidden /> Exporter en CSV
        </Button>
      </div>
      <div className="max-h-72 overflow-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <tbody>
            {shown.map((i, idx) => (
              <tr key={idx} className="border-b border-border last:border-0">
                <td className="w-8 p-2 align-top">
                  {i.severity === "error" ? (
                    <AlertTriangle className="h-4 w-4 text-destructive" aria-label="Erreur" />
                  ) : i.severity === "warning" ? (
                    <AlertTriangle className="h-4 w-4 text-amber-500" aria-label="Avertissement" />
                  ) : (
                    <Info className="h-4 w-4 text-muted-foreground" aria-label="Information" />
                  )}
                </td>
                <td className="p-2">{i.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {issues.length > shown.length && (
        <p className="text-xs text-muted-foreground">
          {issues.length - shown.length} anomalie(s) supplémentaire(s) — voir l'export CSV.
        </p>
      )}
    </div>
  );
}
