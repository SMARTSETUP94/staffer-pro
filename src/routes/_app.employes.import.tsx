import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { FileUp, Loader2, Upload, AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCapability } from "@/hooks/use-capability";
import { useMetiers } from "@/hooks/use-metiers";
import { PageHeader } from "@/components/PageHeader";
import { PageBreadcrumbs } from "@/components/PageBreadcrumbs";
import { ImportsTabsNav } from "@/components/ImportsTabsNav";
import { MetierBadge } from "@/components/MetierBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
import { requireCapability } from "@/lib/capability-guard";
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  decodeWindows1252, parseCsv, type ParsedEmployeRow, type MetierCode,
} from "@/lib/employes-import";

export const Route = createFileRoute("/_app/employes/import")({
  beforeLoad: () => requireCapability("section.admin"),
  head: () => ({ meta: [{ title: "Import employés — Setup Paris" }] }),
  component: EmployesImportPage,
});

interface RowState extends ParsedEmployeRow {
  /** id existant si correspondance trouvée en base. */
  existingId: string | null;
  matchedBy: "email" | "nom_prenom_ddn" | "nom_prenom" | null;
  /** Métier_id édité par l'utilisateur (override du metierCode). */
  metierIdOverride: number | null;
  nonStaffingOverride: boolean;
  /** Statut résultant de l'import après commit. */
  importStatus?: "ok-create" | "ok-update" | "skipped" | "error";
  importError?: string;
}

function EmployesImportPage() {
  const canImport = useCapability("section.admin");
  const { metiers, byId } = useMetiers();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<RowState[]>([]);
  const [parsing, setParsing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [filename, setFilename] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const metierByCode = useMemo(() => {
    const map = new Map<string, number>();
    metiers.forEach((m) => map.set(m.code, m.id));
    return map;
  }, [metiers]);

  const handleFile = async (file: File) => {
    setParsing(true);
    setFilename(file.name);
    setRows([]);
    setParseErrors([]);
    try {
      const buf = await file.arrayBuffer();
      const text = decodeWindows1252(buf);
      const { rows: parsed, parseErrors } = parseCsv(text);
      setParseErrors(parseErrors);

      // Matching base existante.
      const emails = parsed.map((r) => r.parsed.email).filter((e): e is string => !!e);
      const noms = Array.from(new Set(parsed.map((r) => r.parsed.nom).filter(Boolean)));

      const existingByEmail = new Map<string, string>();
      const existingByNomPrenomDdn = new Map<string, string>();
      const existingByNomPrenom = new Map<string, string>();

      if (emails.length || noms.length) {
        const tasks: Promise<void>[] = [];
        if (emails.length) {
          tasks.push((async () => {
            const { data } = await supabase
              .from("employes")
              .select("id, email, nom, prenom, date_naissance")
              .in("email", emails);
            (data ?? []).forEach((e) => {
              if (e.email) existingByEmail.set(e.email.toLowerCase(), e.id);
            });
          })());
        }
        if (noms.length) {
          tasks.push((async () => {
            const { data } = await supabase
              .from("employes")
              .select("id, nom, prenom, date_naissance")
              .in("nom", noms);
            (data ?? []).forEach((e) => {
              const k1 = `${e.nom.toLowerCase()}|${e.prenom.toLowerCase()}|${e.date_naissance ?? ""}`;
              const k2 = `${e.nom.toLowerCase()}|${e.prenom.toLowerCase()}`;
              existingByNomPrenomDdn.set(k1, e.id);
              if (!existingByNomPrenom.has(k2)) existingByNomPrenom.set(k2, e.id);
            });
          })());
        }
        await Promise.all(tasks);
      }

      const states: RowState[] = parsed.map((r) => {
        let existingId: string | null = null;
        let matchedBy: RowState["matchedBy"] = null;
        if (r.parsed.email && existingByEmail.has(r.parsed.email)) {
          existingId = existingByEmail.get(r.parsed.email)!;
          matchedBy = "email";
        } else {
          const k1 = `${r.parsed.nom.toLowerCase()}|${r.parsed.prenom.toLowerCase()}|${r.parsed.date_naissance ?? ""}`;
          const k2 = `${r.parsed.nom.toLowerCase()}|${r.parsed.prenom.toLowerCase()}`;
          if (r.parsed.date_naissance && existingByNomPrenomDdn.has(k1)) {
            existingId = existingByNomPrenomDdn.get(k1)!;
            matchedBy = "nom_prenom_ddn";
          } else if (existingByNomPrenom.has(k2)) {
            existingId = existingByNomPrenom.get(k2)!;
            matchedBy = "nom_prenom";
          }
        }

        const metierId = r.parsed.metierCode ? metierByCode.get(r.parsed.metierCode) ?? null : null;
        return {
          ...r,
          existingId,
          matchedBy,
          metierIdOverride: metierId,
          nonStaffingOverride: r.parsed.non_staffing,
        };
      });
      setRows(states);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Lecture impossible", { description: msg });
    } finally {
      setParsing(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const stats = useMemo(() => {
    let nouveaux = 0;
    let majs = 0;
    let exclus = 0;
    let erreurs = 0;
    rows.forEach((r) => {
      if (r.errors.length > 0) erreurs++;
      else if (r.nonStaffingOverride) exclus++;
      else if (r.existingId) majs++;
      else nouveaux++;
    });
    return { nouveaux, majs, exclus, erreurs, total: rows.length };
  }, [rows]);

  const updateRow = (idx: number, patch: Partial<RowState>) =>
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const commit = async () => {
    setCommitting(true);
    const updated: RowState[] = [...rows];
    let okCreate = 0;
    let okUpdate = 0;
    let skipped = 0;
    let errored = 0;

    for (let i = 0; i < updated.length; i++) {
      const r = updated[i];
      if (r.errors.length > 0) {
        updated[i] = { ...r, importStatus: "skipped", importError: r.errors.join(", ") };
        skipped++;
        continue;
      }
      const metierId = r.metierIdOverride;
      if (!metierId) {
        updated[i] = { ...r, importStatus: "skipped", importError: "Métier principal manquant" };
        skipped++;
        continue;
      }
      const payload = {
        nom: r.parsed.nom,
        prenom: r.parsed.prenom,
        email: r.parsed.email,
        telephone: r.parsed.telephone,
        mobile: r.parsed.mobile,
        adresse: r.parsed.adresse,
        date_naissance: r.parsed.date_naissance,
        type_contrat: r.parsed.type_contrat,
        sous_type_contrat: r.parsed.sous_type_contrat,
        is_apprenti: r.parsed.is_apprenti,
        agence_interim: r.parsed.agence_interim,
        metier_principal_id: metierId,
        non_staffing: r.nonStaffingOverride,
        actif: !r.nonStaffingOverride,
      };

      let employeId = r.existingId;
      if (employeId) {
        const { error } = await supabase.from("employes").update(payload).eq("id", employeId);
        if (error) {
          updated[i] = { ...r, importStatus: "error", importError: error.message };
          errored++;
          continue;
        }
        updated[i] = { ...r, importStatus: "ok-update" };
        okUpdate++;
      } else {
        const { data, error } = await supabase.from("employes").insert(payload).select("id").single();
        if (error || !data) {
          updated[i] = { ...r, importStatus: "error", importError: error?.message ?? "Insert vide" };
          errored++;
          continue;
        }
        employeId = data.id;
        updated[i] = { ...r, importStatus: "ok-create", existingId: data.id };
        okCreate++;
      }

      // Compétences secondaires : on remplace.
      const secIds = r.parsed.competencesSecondairesCodes
        .map((c) => metierByCode.get(c))
        .filter((id): id is number => !!id && id !== metierId);
      await supabase.from("employe_metiers").delete().eq("employe_id", employeId);
      if (secIds.length) {
        await supabase
          .from("employe_metiers")
          .insert(secIds.map((mid) => ({ employe_id: employeId!, metier_id: mid })));
      }
    }

    setRows(updated);
    setCommitting(false);
    toast.success("Import terminé", {
      description: `${okCreate} créés, ${okUpdate} mis à jour, ${skipped} ignorés, ${errored} en erreur.`,
    });
  };

  if (!canImport) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Accès réservé aux administrateurs.</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <PageBreadcrumbs steps={[{ label: "Imports", to: "/employes/import" }, { label: "Employés" }]} />
      <PageHeader
        eyebrow="Administration / Imports"
        title="Import employés"
        description="Charger un export RH au format CSV (séparateur ; , encodage Windows-1252). Les lignes seront mises en correspondance avec les fiches existantes avant validation."
      />
      <ImportsTabsNav />

      {/* Zone drop */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"
        }`}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {parsing ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">
            {filename ?? "Glisser le CSV ici ou cliquer pour sélectionner"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Colonnes attendues : Nom complet ; Contrat ; Poste ; Téléphone ; Mobile ; Email ; Date naissance ; Adresse
          </p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv,application/vnd.ms-excel"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
      </div>

      {parseErrors.length > 0 && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="space-y-1 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
              <AlertCircle className="h-4 w-4" /> Avertissements de parsing
            </p>
            <ul className="text-xs text-destructive/80">
              {parseErrors.slice(0, 8).map((e, i) => <li key={i}>• {e}</li>)}
              {parseErrors.length > 8 && <li>… et {parseErrors.length - 8} autres.</li>}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatCard label="Total lignes" value={stats.total} />
          <StatCard label="Nouveaux" value={stats.nouveaux} tone="primary" />
          <StatCard label="Mises à jour" value={stats.majs} tone="info" />
          <StatCard label="Exclus staffing" value={stats.exclus} tone="muted" />
          <StatCard label="Erreurs" value={stats.erreurs} tone="danger" />
        </div>
      )}

      {/* Preview */}
      {rows.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">#</TableHead>
                <TableHead>Nom</TableHead>
                <TableHead>Contrat</TableHead>
                <TableHead>Poste source</TableHead>
                <TableHead>Métier mappé</TableHead>
                <TableHead>État</TableHead>
                <TableHead>Staffing</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={i} className={r.errors.length > 0 ? "bg-destructive/5" : ""}>
                  <TableCell className="text-xs text-muted-foreground">{r.rowIndex}</TableCell>
                  <TableCell>
                    <div className="font-semibold text-foreground">{r.parsed.nom} {r.parsed.prenom}</div>
                    {r.parsed.email && <div className="text-xs text-muted-foreground">{r.parsed.email}</div>}
                  </TableCell>
                  <TableCell>
                    <div className="text-xs font-semibold uppercase tracking-wider text-foreground">{r.parsed.type_contrat}</div>
                    {r.parsed.sous_type_contrat && <div className="text-[10px] text-muted-foreground">{r.parsed.sous_type_contrat}</div>}
                    {r.parsed.is_apprenti && <div className="text-[10px] font-semibold text-primary">Apprenti</div>}
                  </TableCell>
                  <TableCell className="max-w-[180px] text-xs text-muted-foreground">{r.raw.poste || "—"}</TableCell>
                  <TableCell>
                    <Select
                      value={r.metierIdOverride ? String(r.metierIdOverride) : ""}
                      onValueChange={(v) => updateRow(i, { metierIdOverride: Number(v) })}
                    >
                      <SelectTrigger className="h-8 w-[160px] rounded-lg text-xs">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        {metiers.map((m) => (
                          <SelectItem key={m.id} value={String(m.id)}>{m.libelle}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {r.metierIdOverride && (
                      <div className="mt-1">
                        {(() => {
                          const m = byId(r.metierIdOverride);
                          return m ? <MetierBadge libelle={m.libelle} couleur={m.couleur} /> : null;
                        })()}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {r.importStatus ? (
                      <ImportStatusBadge status={r.importStatus} error={r.importError} />
                    ) : r.existingId ? (
                      <span className="text-xs font-semibold text-primary">Mise à jour ({r.matchedBy})</span>
                    ) : (
                      <span className="text-xs font-semibold text-success">Nouveau</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={!r.nonStaffingOverride}
                      onCheckedChange={(v) => updateRow(i, { nonStaffingOverride: !v })}
                    />
                  </TableCell>
                  <TableCell className="max-w-[220px] space-y-0.5">
                    {r.errors.map((e, k) => (
                      <div key={`e-${k}`} className="text-[10px] font-semibold text-destructive">⚠ {e}</div>
                    ))}
                    {r.warnings.map((w, k) => (
                      <div key={`w-${k}`} className="text-[10px] text-muted-foreground">• {w}</div>
                    ))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {rows.length > 0 && (
        <div className="sticky bottom-4 flex items-center justify-end gap-3 rounded-2xl border border-border bg-card/95 p-3 shadow-elegant backdrop-blur">
          <p className="mr-auto text-xs text-muted-foreground">
            Vérifie les métiers mappés et le flag staffing avant de valider l'import.
          </p>
          <Button variant="ghost" onClick={() => { setRows([]); setFilename(null); setParseErrors([]); }} className="rounded-xl">
            Réinitialiser
          </Button>
          <Button
            onClick={commit}
            disabled={committing}
            className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {committing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <FileUp className="mr-2 h-4 w-4" />
            Valider l'import ({stats.total} lignes)
          </Button>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label, value, tone = "default",
}: { label: string; value: number; tone?: "default" | "primary" | "info" | "muted" | "danger" }) {
  const cls =
    tone === "primary" ? "text-primary" :
    tone === "info" ? "text-foreground" :
    tone === "muted" ? "text-muted-foreground" :
    tone === "danger" ? "text-destructive" : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
        <p className={`mt-1 text-2xl font-bold ${cls}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function ImportStatusBadge({ status, error }: { status: NonNullable<RowState["importStatus"]>; error?: string }) {
  if (status === "ok-create") return <span className="inline-flex items-center gap-1 text-xs font-semibold text-success"><CheckCircle2 className="h-3 w-3" /> Créé</span>;
  if (status === "ok-update") return <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary"><CheckCircle2 className="h-3 w-3" /> Mis à jour</span>;
  if (status === "skipped") return <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground" title={error}><XCircle className="h-3 w-3" /> Ignoré</span>;
  return <span className="inline-flex items-center gap-1 text-xs font-semibold text-destructive" title={error}><AlertCircle className="h-3 w-3" /> Erreur</span>;
}

// Évite warning unused import si MetierCode utilisé ailleurs.
export type _Used = MetierCode;
