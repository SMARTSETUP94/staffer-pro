/**
 * v0.23 Bloc 3 — Page d'import de devis Progbat (xlsx).
 *
 * Workflow :
 *  1. Upload fichier Excel
 *  2. Sélection affaire active (filtre is_affaire_open)
 *  3. Parsing client (parseDevisProgbatFromArrayBuffer)
 *  4. Validation chef : tableau interactif (cocher / éditer noms / heures)
 *  5. Heures chantier (montage / démontage) avec opt-in
 *  6. Bulk import → fabrication_objets + UPDATE affaire
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, FileUp, Hammer, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { isAffaireSelectable } from "@/lib/affaire-lock";
import { PageHeader } from "@/components/PageHeader";
import { PageBreadcrumbs } from "@/components/PageBreadcrumbs";
import { ImportsTabsNav } from "@/components/ImportsTabsNav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  parseDevisProgbatFromArrayBuffer,
} from "@/lib/devis-parser/parse-excel";
import type {
  ObjetCandidat,
  ParseResult,
} from "@/lib/devis-parser/types";
import type {
  ApplicabilityFlags,
  HeuresParMetier,
  TypeFinition,
} from "@/lib/devis-parser/compute-flags";
import {
  computeFlagsFromMetiers,
  detectTypeFinition,
} from "@/lib/devis-parser/compute-flags";
import type { FabMetier } from "@/hooks/use-fabrication";
import { importProgbatToAffaire } from "@/lib/devis-progbat-import";

export const Route = createFileRoute("/_app/devis/progbat-import")({
  head: () => ({ meta: [{ title: "Import devis Progbat — Setup Paris" }] }),
  component: ProgbatImportPage,
});

const MAX_SIZE_MB = 5;

interface AffaireRow {
  id: string;
  numero: string;
  nom: string;
  client: string | null;
  statut: "prospect" | "en_cours" | "termine" | "annule";
  date_demontage: string | null;
}

interface DevisRow {
  id: string;
  numero: string;
  libelle: string | null;
}

interface EditableObjet {
  selected: boolean;
  numero: string;
  nom: string;
  quantite: number;
  heures: HeuresParMetier;
  budgetMateriaux: number;
  typeFinition: TypeFinition;
  flags: ApplicabilityFlags;
  confidence: "high" | "medium" | "low";
  warnings: string[];
  devisId: string | null;
}

const METIER_COLS: { key: FabMetier; label: string }[] = [
  { key: "be", label: "BE" },
  { key: "numerique", label: "Num" },
  { key: "bois", label: "Bois" },
  { key: "metal", label: "Métal" },
  { key: "peinture", label: "Peinture" },
  { key: "tapisserie", label: "Tapisserie" },
  { key: "manutention", label: "Manut" },
];

function confidenceDot(c: EditableObjet["confidence"]): string {
  if (c === "high") return "🟢";
  if (c === "medium") return "🟡";
  return "🔴";
}

function ProgbatImportPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  const [filename, setFilename] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [affaires, setAffaires] = useState<AffaireRow[]>([]);
  const [affaireId, setAffaireId] = useState<string>("");
  const [devisOptions, setDevisOptions] = useState<DevisRow[]>([]);

  const [objets, setObjets] = useState<EditableObjet[]>([]);
  const [importMontage, setImportMontage] = useState(true);
  const [importDemontage, setImportDemontage] = useState(true);
  const [montageH, setMontageH] = useState(0);
  const [demontageH, setDemontageH] = useState(0);

  // Charge affaires actives
  useEffect(() => {
    supabase
      .from("affaires")
      .select("id, numero, nom, client, statut, date_demontage")
      .order("numero", { ascending: false })
      .limit(300)
      .then(({ data }) => {
        const open = ((data ?? []) as AffaireRow[]).filter(isAffaireSelectable);
        setAffaires(open);
      });
  }, []);

  // Charge devis de l'affaire sélectionnée
  useEffect(() => {
    if (!affaireId) {
      setDevisOptions([]);
      return;
    }
    supabase
      .from("devis")
      .select("id, numero, libelle")
      .eq("affaire_id", affaireId)
      .order("created_at", { ascending: true })
      .then(({ data }) => setDevisOptions((data ?? []) as DevisRow[]));
  }, [affaireId]);

  // Initialise les objets éditables après parsing
  useEffect(() => {
    if (!parseResult) return;
    const initial: EditableObjet[] = parseResult.objetsCandidats.map((o: ObjetCandidat) => ({
      selected: o.confidence === "high",
      numero: o.numero,
      nom: o.nom,
      quantite: o.quantite,
      heures: { ...o.heures },
      budgetMateriaux: o.budgetMateriaux,
      typeFinition: o.typeFinition,
      flags: o.flags,
      confidence: o.confidence,
      warnings: o.warnings,
      devisId: null,
    }));
    setObjets(initial);
    setMontageH(parseResult.heuresChantier.montage);
    setDemontageH(parseResult.heuresChantier.demontage);
    setImportMontage(parseResult.heuresChantier.montage > 0);
    setImportDemontage(parseResult.heuresChantier.demontage > 0);
  }, [parseResult]);

  const onFile = async (file: File) => {
    setParseError(null);
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setParseError(`Fichier trop volumineux (max ${MAX_SIZE_MB} Mo).`);
      return;
    }
    setFilename(file.name);
    setParsing(true);
    try {
      const buf = await file.arrayBuffer();
      const result = parseDevisProgbatFromArrayBuffer(buf, { filename: file.name });
      setParseResult(result);
      if (result.errors.length) setParseError(result.errors.join(" • "));
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Erreur de parsing.");
    } finally {
      setParsing(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };

  const updateObjet = (idx: number, patch: Partial<EditableObjet>) => {
    setObjets((prev) =>
      prev.map((o, i) => {
        if (i !== idx) return o;
        const next = { ...o, ...patch };
        // Recalcule flags + finition si heures changent
        if (patch.heures) {
          next.flags = computeFlagsFromMetiers(next.heures);
          next.typeFinition = detectTypeFinition(next.heures);
        }
        return next;
      }),
    );
  };

  const updateMetier = (idx: number, metier: FabMetier, value: number) => {
    const obj = objets[idx];
    if (!obj) return;
    const heures = { ...obj.heures, [metier]: Number.isFinite(value) ? value : 0 };
    updateObjet(idx, { heures });
  };

  const reset = () => {
    setFilename(null);
    setParseResult(null);
    setParseError(null);
    setObjets([]);
    setMontageH(0);
    setDemontageH(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const selectedCount = objets.filter((o) => o.selected).length;
  const affaireSelected = affaires.find((a) => a.id === affaireId);

  const canImport =
    !!affaireId && (selectedCount > 0 || importMontage || importDemontage) && !importing;

  const onImport = async () => {
    if (!affaireId) {
      toast.error("Sélectionnez une affaire.");
      return;
    }
    setImporting(true);
    try {
      const res = await importProgbatToAffaire({
        affaireId,
        objets: objets
          .filter((o) => o.selected)
          .map((o) => ({
            nom: o.nom.trim() || "Objet sans nom",
            reference: o.numero || "",
            quantite: Math.max(1, Math.round(o.quantite)),
            heures: o.heures,
            budgetMateriaux: o.budgetMateriaux,
            typeFinition: o.typeFinition,
            flags: o.flags,
            devisId: o.devisId,
          })),
        heuresMontage: importMontage ? montageH : null,
        heuresDemontage: importDemontage ? demontageH : null,
      });
      toast.success(
        `${res.insertedObjets} objet(s) importé(s) sur l'affaire ${affaireSelected?.numero ?? ""}`,
      );
      navigate({ to: "/affaires/$affaireId/fabrication", params: { affaireId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'import.");
    } finally {
      setImporting(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <Card className="max-w-md">
          <CardContent className="flex items-start gap-3 p-6">
            <AlertCircle className="mt-0.5 h-5 w-5 text-destructive" />
            <div>
              <p className="font-semibold">Accès réservé</p>
              <p className="text-sm text-muted-foreground">
                Cette page d'import est réservée aux administrateurs.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        <PageBreadcrumbs items={[{ label: "Imports" }, { label: "Devis Progbat" }]} />
        <PageHeader
          title="Import devis Progbat"
          description="Upload d'un devis Excel Progbat → génération des objets de fabrication"
          icon={Hammer}
        />
        <ImportsTabsNav />

        {/* Step 1 — Upload */}
        {!parseResult && (
          <Card>
            <CardContent className="p-6">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center transition-colors",
                  dragOver
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:border-primary/40",
                )}
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
                    {filename ?? "Glisser un fichier .xlsx Progbat (ou cliquer)"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Max {MAX_SIZE_MB} Mo • parsing 100% local (aucun upload serveur)
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onFile(f);
                  }}
                />
              </div>
              {parseError && (
                <p className="mt-3 text-sm text-destructive">{parseError}</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Steps 2-5 — validation */}
        {parseResult && (
          <>
            {/* Métadonnées + reset */}
            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="text-sm">
                  <p className="font-semibold">
                    {parseResult.meta.numeroDevis ?? "Devis"}
                    {parseResult.meta.libelle ? ` — ${parseResult.meta.libelle}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {parseResult.meta.client ?? "—"} • {parseResult.meta.nbLignes} lignes •{" "}
                    {parseResult.meta.totalHt.toLocaleString("fr-FR")} € HT •{" "}
                    <span className="font-medium uppercase">{parseResult.devisType}</span>
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={reset}>
                  <X className="mr-2 h-4 w-4" /> Changer de fichier
                </Button>
              </CardContent>
            </Card>

            {/* Step 2 — Affaire */}
            <Card>
              <CardContent className="p-4">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Affaire de destination
                </Label>
                <Select value={affaireId} onValueChange={setAffaireId}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="— Sélectionner une affaire active —" />
                  </SelectTrigger>
                  <SelectContent>
                    {affaires.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.numero} — {a.nom}
                        {a.client ? ` (${a.client})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {affaires.length === 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Aucune affaire active.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Step 4 — Tableau objets */}
            {objets.length > 0 && (
              <Card>
                <CardContent className="p-0">
                  <div className="border-b border-border p-4">
                    <p className="text-sm font-semibold">
                      {objets.length} objet(s) candidat(s) — {selectedCount} sélectionné(s)
                    </p>
                  </div>
                  <div className="overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10"></TableHead>
                          <TableHead className="w-12 text-center">Conf.</TableHead>
                          <TableHead className="min-w-[200px]">Nom</TableHead>
                          <TableHead className="w-16">Qté</TableHead>
                          {METIER_COLS.map((m) => (
                            <TableHead key={m.key} className="w-16 text-right">
                              {m.label}
                            </TableHead>
                          ))}
                          <TableHead className="w-24 text-right">Budget mat.</TableHead>
                          <TableHead className="min-w-[140px]">Lot devis</TableHead>
                          <TableHead className="w-12 text-center">⚠</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {objets.map((o, idx) => (
                          <TableRow key={idx}>
                            <TableCell>
                              <Checkbox
                                checked={o.selected}
                                onCheckedChange={(v) =>
                                  updateObjet(idx, { selected: !!v })
                                }
                              />
                            </TableCell>
                            <TableCell className="text-center text-base">
                              {confidenceDot(o.confidence)}
                            </TableCell>
                            <TableCell>
                              <Input
                                value={o.nom}
                                onChange={(e) => updateObjet(idx, { nom: e.target.value })}
                                className="h-8"
                              />
                              {o.numero && (
                                <span className="text-[10px] text-muted-foreground">
                                  {o.numero}
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min={1}
                                value={o.quantite}
                                onChange={(e) =>
                                  updateObjet(idx, { quantite: Number(e.target.value) || 1 })
                                }
                                className="h-8 w-14"
                              />
                            </TableCell>
                            {METIER_COLS.map((m) => (
                              <TableCell key={m.key} className="text-right">
                                <Input
                                  type="number"
                                  min={0}
                                  step="0.5"
                                  value={o.heures[m.key]}
                                  onChange={(e) =>
                                    updateMetier(idx, m.key, Number(e.target.value) || 0)
                                  }
                                  className="h-8 w-16 text-right"
                                />
                              </TableCell>
                            ))}
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                min={0}
                                step="1"
                                value={o.budgetMateriaux}
                                onChange={(e) =>
                                  updateObjet(idx, {
                                    budgetMateriaux: Number(e.target.value) || 0,
                                  })
                                }
                                className="h-8 w-24 text-right"
                              />
                            </TableCell>
                            <TableCell>
                              <Select
                                value={o.devisId ?? "__none__"}
                                onValueChange={(v) =>
                                  updateObjet(idx, {
                                    devisId: v === "__none__" ? null : v,
                                  })
                                }
                              >
                                <SelectTrigger className="h-8">
                                  <SelectValue placeholder="—" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">—</SelectItem>
                                  {devisOptions.map((d) => (
                                    <SelectItem key={d.id} value={d.id}>
                                      {d.numero}
                                      {d.libelle ? ` — ${d.libelle}` : ""}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="text-center">
                              {o.warnings.length > 0 && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <AlertCircle className="h-4 w-4 text-amber-500" />
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">
                                    <ul className="list-disc pl-4 text-xs">
                                      {o.warnings.map((w, i) => (
                                        <li key={i}>{w}</li>
                                      ))}
                                    </ul>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Heures chantier */}
            <Card>
              <CardContent className="p-4">
                <p className="text-sm font-semibold">Heures chantier</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Mises à jour sur l'affaire (champs <code>heures_prevues_montage</code> /{" "}
                  <code>heures_prevues_demontage</code>). Décocher = ne pas écraser.
                </p>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                    <Checkbox
                      checked={importMontage}
                      onCheckedChange={(v) => setImportMontage(!!v)}
                    />
                    <Label className="flex-1 text-sm">Montage</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.5"
                      value={montageH}
                      onChange={(e) => setMontageH(Number(e.target.value) || 0)}
                      disabled={!importMontage}
                      className="h-8 w-24 text-right"
                    />
                    <span className="text-xs text-muted-foreground">h</span>
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                    <Checkbox
                      checked={importDemontage}
                      onCheckedChange={(v) => setImportDemontage(!!v)}
                    />
                    <Label className="flex-1 text-sm">Démontage</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.5"
                      value={demontageH}
                      onChange={(e) => setDemontageH(Number(e.target.value) || 0)}
                      disabled={!importDemontage}
                      className="h-8 w-24 text-right"
                    />
                    <span className="text-xs text-muted-foreground">h</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Renvois externes */}
            {parseResult.renvoisExternes.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm font-semibold">Renvois externes détectés</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Ces lignes citent d'autres devis — aucun objet créé. À traiter manuellement.
                  </p>
                  <ul className="mt-2 space-y-1 text-xs">
                    {parseResult.renvoisExternes.map((r, i) => (
                      <li key={i}>
                        <span className="font-mono">D-{r.numeroDevis}</span> — {r.contexte}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Warnings globaux */}
            {parseResult.warnings.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm font-semibold text-amber-600">Avertissements</p>
                  <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
                    {parseResult.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Footer actions */}
            <div className="sticky bottom-4 flex flex-wrap items-center justify-end gap-3 rounded-2xl border border-border bg-card/95 p-3 shadow-elegant backdrop-blur">
              <p className="mr-auto text-xs text-muted-foreground">
                {selectedCount} objet(s) seront créés
                {affaireSelected ? ` sur ${affaireSelected.numero}` : ""}
                {importMontage ? ` • Montage ${montageH}h` : ""}
                {importDemontage ? ` • Démontage ${demontageH}h` : ""}
              </p>
              <Button variant="ghost" onClick={reset}>
                Annuler
              </Button>
              <Button onClick={onImport} disabled={!canImport}>
                {importing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileUp className="mr-2 h-4 w-4" />
                )}
                Importer {selectedCount} objet(s) + heures
              </Button>
            </div>
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
