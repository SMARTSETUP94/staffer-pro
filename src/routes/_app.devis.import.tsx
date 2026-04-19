import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { FileUp, Upload, Loader2, AlertCircle, CheckCircle2, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useMetiers } from "@/hooks/use-metiers";
import { PageHeader } from "@/components/PageHeader";
import { MetierBadge } from "@/components/MetierBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { parseDevisFromArrayBuffer, type ParsedDevisLine } from "@/lib/devis-import";
import type { MetierCode } from "@/lib/employes-import";

export const Route = createFileRoute("/_app/devis/import")({
  head: () => ({ meta: [{ title: "Import devis Excel — Setup Paris" }] }),
  component: DevisImportPage,
});

interface AffaireOption {
  id: string;
  numero: string;
  nom: string;
}

interface LineState extends ParsedDevisLine {
  metierIdOverride: number | null;
  excludedOverride: boolean;
}

function DevisImportPage() {
  const { isAdminOrChef } = useAuth();
  const { metiers, byId } = useMetiers();
  const fileRef = useRef<HTMLInputElement>(null);

  const [filename, setFilename] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [meta, setMeta] = useState<{ numeroDevis: string | null; libelle: string | null }>({ numeroDevis: null, libelle: null });
  const [lines, setLines] = useState<LineState[]>([]);

  // Sélection affaire / numéro / libellé / statut
  const [affaires, setAffaires] = useState<AffaireOption[]>([]);
  const [affaireId, setAffaireId] = useState<string>("");
  const [numeroDevis, setNumeroDevis] = useState("");
  const [libelleDevis, setLibelleDevis] = useState("");

  // Charge la liste affaires au mount.
  useMemo(() => {
    supabase
      .from("affaires")
      .select("id, numero, nom")
      .order("numero", { ascending: false })
      .limit(100)
      .then(({ data }) => setAffaires((data ?? []) as AffaireOption[]));
  }, []);

  const metierByCode = useMemo(() => {
    const map = new Map<MetierCode, number>();
    metiers.forEach((m) => map.set(m.code as MetierCode, m.id));
    return map;
  }, [metiers]);

  const handleFile = async (file: File) => {
    setParsing(true);
    setFilename(file.name);
    setErrors([]);
    setLines([]);
    try {
      const buf = await file.arrayBuffer();
      const result = parseDevisFromArrayBuffer(buf, { filename: file.name });
      setErrors(result.errors);
      setMeta(result.meta);
      if (result.meta.numeroDevis) setNumeroDevis(result.meta.numeroDevis);
      if (result.meta.libelle) setLibelleDevis(result.meta.libelle);
      const states: LineState[] = result.lines.map((l) => ({
        ...l,
        metierIdOverride: l.metierFinalCode ? metierByCode.get(l.metierFinalCode) ?? null : null,
        excludedOverride: l.excluded,
      }));
      setLines(states);
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

  const updateLine = (idx: number, patch: Partial<LineState>) =>
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const stats = useMemo(() => {
    let importables = 0;
    let exclues = 0;
    let sansMetier = 0;
    let totalHeures = 0;
    let totalMontant = 0;
    lines.forEach((l) => {
      if (l.excludedOverride) exclues++;
      else {
        importables++;
        totalHeures += l.tempsPrevu ?? 0;
        totalMontant += l.total ?? 0;
        if (!l.metierIdOverride) sansMetier++;
      }
    });
    return { importables, exclues, sansMetier, totalHeures, totalMontant, total: lines.length };
  }, [lines]);

  const canCommit = !!affaireId && !!numeroDevis.trim() && stats.importables > 0 && stats.sansMetier === 0;

  const commit = async () => {
    if (!canCommit) return;
    setCommitting(true);
    try {
      // 1. Crée le devis (statut "signe" par défaut, comme spec).
      const { data: devis, error: errDevis } = await supabase
        .from("devis")
        .insert({
          affaire_id: affaireId,
          numero: numeroDevis.trim(),
          libelle: libelleDevis.trim() || null,
          statut: "signe",
          fichier_source: filename,
        })
        .select("id")
        .single();
      if (errDevis || !devis) {
        toast.error("Création du devis impossible", { description: errDevis?.message });
        setCommitting(false);
        return;
      }

      // 2. Agrège les lignes importables par métier (somme heures + montant).
      const aggregated = new Map<number, { heures: number; montant: number; libelles: string[] }>();
      lines.forEach((l) => {
        if (l.excludedOverride || !l.metierIdOverride) return;
        const cur = aggregated.get(l.metierIdOverride) ?? { heures: 0, montant: 0, libelles: [] };
        cur.heures += l.tempsPrevu ?? 0;
        cur.montant += l.total ?? 0;
        if (l.designation) cur.libelles.push(l.designation);
        aggregated.set(l.metierIdOverride, cur);
      });

      const postesPayload = Array.from(aggregated.entries()).map(([metier_id, v]) => ({
        devis_id: devis.id,
        metier_id,
        heures_prevues: v.heures,
        montant_ht: v.montant || null,
        libelle_source: v.libelles.slice(0, 5).join(" • ").slice(0, 500),
      }));

      if (postesPayload.length) {
        const { error: errPostes } = await supabase.from("devis_postes").insert(postesPayload);
        if (errPostes) {
          toast.error("Création des postes impossible", { description: errPostes.message });
          setCommitting(false);
          return;
        }
      }

      toast.success("Devis importé", {
        description: `${postesPayload.length} poste(s) métier, ${stats.totalHeures} h, ${stats.totalMontant.toLocaleString("fr-FR")} € HT.`,
      });
      // Reset.
      setLines([]);
      setFilename(null);
      setMeta({ numeroDevis: null, libelle: null });
      setNumeroDevis("");
      setLibelleDevis("");
    } finally {
      setCommitting(false);
    }
  };

  if (!isAdminOrChef) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Accès réservé aux chefs de chantier et administrateurs.</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <PageHeader
        number="04"
        eyebrow="Données / Import"
        title="Import devis Excel"
        description="Charger un fichier devis (format D-202604-XXXX.xlsx). Le parser détecte les sections, hérite le métier et exclut les lignes de récap (Total/TVA, Budget matériaux, Liste matière, régul)."
        actions={
          <Link to="/devis/import" className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-1 inline h-3 w-3" />
          </Link>
        }
      />

      {/* Drop zone */}
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
            {filename ?? "Glisser le fichier .xlsx ou cliquer pour sélectionner"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Colonnes attendues : N° • Désignation • Qté • Unité • PU HT • Total • TVA • Temps prévu
          </p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
      </div>

      {errors.length > 0 && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="space-y-1 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
              <AlertCircle className="h-4 w-4" /> Erreurs de parsing
            </p>
            {errors.map((e, i) => <div key={i} className="text-xs text-destructive/80">• {e}</div>)}
          </CardContent>
        </Card>
      )}

      {lines.length > 0 && (
        <>
          {/* Bandeau affectation */}
          <Card>
            <CardContent className="grid gap-4 p-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Affaire de destination</Label>
                <Select value={affaireId} onValueChange={setAffaireId}>
                  <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="Choisir une affaire…" /></SelectTrigger>
                  <SelectContent>
                    {affaires.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.numero} — {a.nom}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Numéro de devis</Label>
                <Input value={numeroDevis} onChange={(e) => setNumeroDevis(e.target.value)} placeholder="D-202604-XXXX" className="h-10 rounded-xl" />
                {meta.numeroDevis && meta.numeroDevis !== numeroDevis && (
                  <p className="text-[10px] text-muted-foreground">Détecté : {meta.numeroDevis}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Libellé (optionnel)</Label>
                <Input value={libelleDevis} onChange={(e) => setLibelleDevis(e.target.value)} placeholder="Ex. Stand Maison & Objet" className="h-10 rounded-xl" />
              </div>
            </CardContent>
          </Card>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <StatCard label="Lignes totales" value={stats.total} />
            <StatCard label="À importer" value={stats.importables} tone="primary" />
            <StatCard label="Exclues" value={stats.exclues} tone="muted" />
            <StatCard label="Sans métier" value={stats.sansMetier} tone={stats.sansMetier > 0 ? "danger" : "default"} />
            <StatCard label="Total heures" value={stats.totalHeures} tone="info" />
          </div>

          {/* Preview */}
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">N°</TableHead>
                  <TableHead>Désignation</TableHead>
                  <TableHead className="w-[80px] text-right">Temps</TableHead>
                  <TableHead className="w-[100px] text-right">Montant HT</TableHead>
                  <TableHead className="w-[180px]">Métier</TableHead>
                  <TableHead className="w-[80px]">Importer</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l, i) => (
                  <TableRow
                    key={i}
                    className={
                      l.isSection ? "bg-muted/40" :
                      l.excludedOverride ? "opacity-50" : ""
                    }
                  >
                    <TableCell className="font-mono text-xs">{l.numero || "—"}</TableCell>
                    <TableCell>
                      <div className={`text-sm ${l.isSection ? "font-bold uppercase tracking-wide text-foreground" : "text-foreground"}`}>
                        {l.designation || "—"}
                      </div>
                      {l.unite && (
                        <div className="text-[10px] text-muted-foreground">{l.quantite ?? "?"} {l.unite}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{l.tempsPrevu ?? "—"}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {l.total != null ? `${l.total.toLocaleString("fr-FR")} €` : "—"}
                    </TableCell>
                    <TableCell>
                      {l.isSection ? (
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Section</span>
                      ) : (
                        <div className="space-y-1">
                          <Select
                            value={l.metierIdOverride ? String(l.metierIdOverride) : ""}
                            onValueChange={(v) => updateLine(i, { metierIdOverride: Number(v) })}
                            disabled={l.excludedOverride}
                          >
                            <SelectTrigger className="h-8 rounded-lg text-xs">
                              <SelectValue placeholder="—" />
                            </SelectTrigger>
                            <SelectContent>
                              {metiers.map((m) => (
                                <SelectItem key={m.id} value={String(m.id)}>{m.libelle}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {l.metierIdOverride && (() => {
                            const m = byId(l.metierIdOverride);
                            return m ? <MetierBadge libelle={m.libelle} couleur={m.couleur} /> : null;
                          })()}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {!l.isSection && (
                        <Switch
                          checked={!l.excludedOverride}
                          onCheckedChange={(v) => updateLine(i, { excludedOverride: !v })}
                        />
                      )}
                    </TableCell>
                    <TableCell className="max-w-[220px] space-y-0.5">
                      {l.warnings.map((w, k) => (
                        <div key={k} className="text-[10px] text-muted-foreground">• {w}</div>
                      ))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Footer commit */}
          <div className="sticky bottom-4 flex flex-wrap items-center justify-end gap-3 rounded-2xl border border-border bg-card/95 p-3 shadow-elegant backdrop-blur">
            <p className="mr-auto text-xs text-muted-foreground">
              {stats.sansMetier > 0
                ? `${stats.sansMetier} ligne(s) sans métier — corrige-les avant validation.`
                : `Prêt à importer ${stats.importables} lignes • ${stats.totalHeures} h • ${stats.totalMontant.toLocaleString("fr-FR")} € HT.`}
            </p>
            <Button variant="ghost" onClick={() => { setLines([]); setFilename(null); setMeta({ numeroDevis: null, libelle: null }); setNumeroDevis(""); setLibelleDevis(""); }} className="rounded-xl">
              Réinitialiser
            </Button>
            <Button
              onClick={commit}
              disabled={!canCommit || committing}
              className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {committing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
              Créer le devis ({stats.importables} ligne{stats.importables > 1 ? "s" : ""})
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  label, value, tone = "default",
}: { label: string; value: number | string; tone?: "default" | "primary" | "info" | "muted" | "danger" }) {
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

// Inutile mais conserve l'import propre.
export type _UsedCheck = typeof CheckCircle2;
