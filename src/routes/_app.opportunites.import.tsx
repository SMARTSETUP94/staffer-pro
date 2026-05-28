import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { FileUp, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useCapability } from "@/hooks/use-capability";
import { useChargesAffaires } from "@/hooks/use-charges-affaires";
import { PageHeader } from "@/components/PageHeader";
import { PageBreadcrumbs } from "@/components/PageBreadcrumbs";
import { ImportsTabsNav } from "@/components/ImportsTabsNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
import { requireCapability } from "@/lib/capability-guard";
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  parseOpportunitesFile,
  type ParsedOpportuniteRow,
} from "@/lib/opportunites-import";
import { STATUT_LABEL, TAILLE_LABEL } from "@/lib/opportunites";
import { ImportErrorPanel } from "@/components/imports/ImportErrorPanel";
import { ImportErrorBoundary } from "@/components/imports/ImportErrorBoundary";
import {
  exceptionToIssue,
  legacyStringsToIssues,
  makeIssue,
  type ImportIssue,
} from "@/lib/import-validation";

export const Route = createFileRoute("/_app/opportunites/import")({
  beforeLoad: () => requireCapability("section.admin"),
  head: () => ({ meta: [{ title: "Import opportunités — Setup Paris" }] }),
  component: () => (
    <ImportErrorBoundary label="Import opportunités">
      <OpportunitesImportPage />
    </ImportErrorBoundary>
  ),
});

interface RowState extends ParsedOpportuniteRow {
  existingId: string | null;
  resolvedChargeId: string | null;
  importStatus?: "ok-create" | "ok-update" | "skipped" | "error";
  importError?: string;
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function OpportunitesImportPage() {
  const { user } = useAuth();
  const canImport = useCapability("section.admin");
  const { data: charges } = useChargesAffaires();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<RowState[]>([]);
  const [parsing, setParsing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [filename, setFilename] = useState<string | null>(null);
  const [fileHash, setFileHash] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const chargesByEmail = useMemo(() => {
    const m = new Map<string, string>();
    charges.forEach((c) => m.set(c.email.toLowerCase(), c.id));
    return m;
  }, [charges]);

  async function handleFile(file: File) {
    setParsing(true);
    setFilename(file.name);
    setRows([]);
    setParseErrors([]);
    setFileHash(null);
    try {
      const buf = await file.arrayBuffer();
      const hash = await sha256Hex(buf);

      // Vérification anti-doublon
      const { data: dup } = await supabase
        .from("opportunites_imports")
        .select("created_at, fichier_nom")
        .eq("fichier_hash", hash)
        .maybeSingle();
      if (dup) {
        const dt = new Date(dup.created_at).toLocaleDateString("fr-FR", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        });
        toast.error("Fichier déjà importé", {
          description: `Ce fichier (« ${dup.fichier_nom} ») a déjà été importé le ${dt}. Réinitialise pour forcer un nouvel import.`,
        });
        setParsing(false);
        return;
      }
      setFileHash(hash);

      const { rows: parsed, parseErrors: errs } = parseOpportunitesFile(buf);
      setParseErrors(errs);

      const numeros = parsed.map((r) => r.parsed.numero).filter((n): n is string => !!n);
      const existingByNumero = new Map<string, string>();
      if (numeros.length) {
        const { data } = await supabase
          .from("affaires")
          .select("id, numero")
          .in("numero", numeros);
        (data ?? []).forEach((a) => existingByNumero.set(a.numero, a.id));
      }

      const states: RowState[] = parsed.map((r) => {
        const existingId = r.parsed.numero
          ? existingByNumero.get(r.parsed.numero) ?? null
          : null;
        const caId = r.parsed.charge_affaires_email
          ? chargesByEmail.get(r.parsed.charge_affaires_email) ?? null
          : null;
        return { ...r, existingId, resolvedChargeId: caId };
      });
      setRows(states);
    } catch (err) {
      const issue = exceptionToIssue(err, "Lecture du fichier opportunités");
      setParseErrors((prev) => [...prev, issue.message]);
      toast.error("Lecture impossible", { description: issue.message });
    } finally {
      setParsing(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }

  const stats = useMemo(() => {
    let nouveaux = 0;
    let majs = 0;
    let erreurs = 0;
    rows.forEach((r) => {
      if (r.errors.length > 0) erreurs++;
      else if (r.existingId) majs++;
      else nouveaux++;
    });
    return { nouveaux, majs, erreurs, total: rows.length };
  }, [rows]);

  // v0.32.0 — Issues globales (parse) + issues par ligne (cellule).
  const importIssues = useMemo<ImportIssue[]>(() => {
    const arr: ImportIssue[] = legacyStringsToIssues(parseErrors, { severity: "warning" });
    rows.forEach((r) => {
      r.errors.forEach((msg) =>
        arr.push(
          makeIssue({
            code: "REQUIRED_FIELD_MISSING",
            severity: "error",
            rowIndex: r.rowIndex,
            column: null,
            message: `Ligne ${r.rowIndex} · ${msg}`,
          }),
        ),
      );
      r.warnings.forEach((msg) =>
        arr.push(
          makeIssue({
            code: "INVALID_TEXT",
            severity: "warning",
            rowIndex: r.rowIndex,
            column: null,
            message: `Ligne ${r.rowIndex} · ${msg}`,
          }),
        ),
      );
    });
    return arr;
  }, [parseErrors, rows]);

  async function commit() {
    setCommitting(true);
    const updated: RowState[] = [...rows];
    let okCreate = 0;
    let okUpdate = 0;
    let skipped = 0;
    let errored = 0;

    for (let i = 0; i < updated.length; i++) {
      const r = updated[i];
      if (r.errors.length > 0 || !r.parsed.numero || !r.parsed.client) {
        updated[i] = {
          ...r,
          importStatus: "skipped",
          importError: r.errors.join(", ") || "Données minimales manquantes",
        };
        skipped++;
        continue;
      }

      const chargeId = r.resolvedChargeId ?? user?.id ?? null;
      const payload = {
        numero: r.parsed.numero,
        nom: r.parsed.nom ?? r.parsed.client,
        client: r.parsed.client,
        phase: "opportunite" as const,
        statut_opportunite: r.parsed.statut,
        statut: "prospect" as const,
        charge_affaires_id: chargeId,
        taille: r.parsed.taille,
        date_opportunite: r.parsed.date_opportunite,
        notes: r.parsed.commentaires,
      };

      if (r.existingId) {
        const { error } = await supabase
          .from("affaires")
          .update(payload)
          .eq("id", r.existingId);
        if (error) {
          updated[i] = { ...r, importStatus: "error", importError: error.message };
          errored++;
        } else {
          updated[i] = { ...r, importStatus: "ok-update" };
          okUpdate++;
        }
      } else {
        const { error } = await supabase.from("affaires").insert(payload);
        if (error) {
          updated[i] = { ...r, importStatus: "error", importError: error.message };
          errored++;
        } else {
          updated[i] = { ...r, importStatus: "ok-create" };
          okCreate++;
        }
      }
    }

    setRows(updated);
    setCommitting(false);

    // Enregistrement de l'import (anti-doublon hash)
    if (fileHash && user?.id) {
      await supabase.from("opportunites_imports").insert({
        user_id: user.id,
        fichier_nom: filename ?? "Sans nom",
        fichier_hash: fileHash,
        rows_count: updated.length,
        created_count: okCreate,
        updated_count: okUpdate,
        errored_count: errored,
      });
    }

    toast.success("Import terminé", {
      description: `${okCreate} créées, ${okUpdate} mises à jour, ${skipped} ignorées, ${errored} en erreur.`,
    });
  }

  if (!canImport) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Accès réservé aux administrateurs.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <PageBreadcrumbs
        steps={[
          { label: "Imports", to: "/employes/import" },
          { label: "Opportunités" },
        ]}
      />
      <PageHeader
        eyebrow="Administration / Imports"
        title="Import opportunités CRM"
        description="Charger un export CRM (Excel ou CSV). Colonnes attendues : code (9XXX), client, nom, taille, statut, date, ca (email), commentaires. UPSERT idempotent sur le numéro."
      />
      <ImportsTabsNav />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
          dragOver
            ? "border-primary bg-primary/5"
            : "border-border bg-card hover:border-primary/40"
        }`}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {parsing ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <Upload className="h-6 w-6" />
          )}
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">
            {filename ?? "Glisser un fichier Excel ou CSV ici"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Colonnes : code · client · nom · taille · statut · date · ca · commentaires
          </p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
      </div>

      <ImportErrorPanel
        issues={importIssues}
        filename={filename}
        onReset={
          rows.length > 0 || parseErrors.length > 0
            ? () => {
                setRows([]);
                setFilename(null);
                setParseErrors([]);
              }
            : undefined
        }
      />

      {rows.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Total lignes" value={stats.total} />
          <StatCard label="Nouvelles" value={stats.nouveaux} tone="primary" />
          <StatCard label="Mises à jour" value={stats.majs} tone="info" />
          <StatCard label="Erreurs" value={stats.erreurs} tone="danger" />
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">#</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Client / Nom</TableHead>
                <TableHead>Taille</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>CA</TableHead>
                <TableHead>État</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow
                  key={i}
                  className={r.errors.length > 0 ? "bg-destructive/5" : ""}
                >
                  <TableCell className="text-xs text-muted-foreground">
                    {r.rowIndex}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {r.parsed.numero ?? "—"}
                  </TableCell>
                  <TableCell>
                    <div className="font-semibold text-foreground text-xs">
                      {r.parsed.client ?? "—"}
                    </div>
                    {r.parsed.nom && r.parsed.nom !== r.parsed.client && (
                      <div className="text-[10px] text-muted-foreground">
                        {r.parsed.nom}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.parsed.taille ? TAILLE_LABEL[r.parsed.taille] : "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {STATUT_LABEL[r.parsed.statut]}
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.parsed.date_opportunite ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.resolvedChargeId ? (
                      <Badge variant="outline" className="text-[10px]">
                        {charges.find((c) => c.id === r.resolvedChargeId)?.full_name ??
                          r.parsed.charge_affaires_email}
                      </Badge>
                    ) : r.parsed.charge_affaires_email ? (
                      <span className="text-warning">
                        ⚠ {r.parsed.charge_affaires_email}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">moi (défaut)</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {r.importStatus ? (
                      <ImportStatusBadge
                        status={r.importStatus}
                        error={r.importError}
                      />
                    ) : r.existingId ? (
                      <span className="text-xs font-semibold text-primary">
                        Mise à jour
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-success">
                        Nouvelle
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[200px] space-y-0.5">
                    {r.errors.map((e, k) => (
                      <div
                        key={`e-${k}`}
                        className="text-[10px] font-semibold text-destructive"
                      >
                        ⚠ {e}
                      </div>
                    ))}
                    {r.warnings.map((w, k) => (
                      <div
                        key={`w-${k}`}
                        className="text-[10px] text-muted-foreground"
                      >
                        • {w}
                      </div>
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
            UPSERT idempotent sur le numéro 9XXX. Les opportunités existantes seront
            mises à jour, les nouvelles créées.
          </p>
          <Button
            variant="ghost"
            onClick={() => {
              setRows([]);
              setFilename(null);
              setParseErrors([]);
            }}
            className="rounded-xl"
          >
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
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "primary" | "info" | "danger";
}) {
  const cls =
    tone === "primary"
      ? "text-primary"
      : tone === "info"
        ? "text-foreground"
        : tone === "danger"
          ? "text-destructive"
          : "text-foreground";
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={`mt-2 text-3xl font-bold tabular-nums ${cls}`}>{value}</p>
    </div>
  );
}

function ImportStatusBadge({
  status,
  error,
}: {
  status: "ok-create" | "ok-update" | "skipped" | "error";
  error?: string;
}) {
  if (status === "ok-create")
    return <Badge className="bg-success text-success-foreground text-[10px]">Créée</Badge>;
  if (status === "ok-update")
    return <Badge className="bg-primary text-primary-foreground text-[10px]">MAJ</Badge>;
  if (status === "skipped")
    return (
      <Badge variant="outline" className="text-[10px]" title={error}>
        Ignorée
      </Badge>
    );
  return (
    <Badge variant="destructive" className="text-[10px]" title={error}>
      Erreur
    </Badge>
  );
}
