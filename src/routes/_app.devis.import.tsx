import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarIcon, FileUp, Loader2, Upload, AlertCircle, Plus, Trash2, Info,
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useMetiers } from "@/hooks/use-metiers";
import { PageHeader } from "@/components/PageHeader";
import { MetierBadge } from "@/components/MetierBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { parseDevisFromArrayBuffer } from "@/lib/devis-import";
import type { MetierCode } from "@/lib/employes-import";

export const Route = createFileRoute("/_app/devis/import")({
  head: () => ({ meta: [{ title: "Import devis Excel — Setup Paris" }] }),
  component: DevisImportPage,
});

interface AffaireOption {
  id: string;
  numero: string;
  nom: string;
  client: string | null;
  lieu: string | null;
}

interface PosteRow {
  key: string;
  metierId: number | null;
  heures: number;
  montantHt: number;
  libellesSources: string[];
  manuel: boolean;
}

const NEW_AFFAIRE = "__new__";

function round1(n: number) { return Math.round(n * 10) / 10; }
function round2(n: number) { return Math.round(n * 100) / 100; }
function toIso(d: Date | undefined): string | null {
  if (!d) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function DevisImportPage() {
  const { isAdminOrChef } = useAuth();
  const { metiers, byId } = useMetiers();
  const fileRef = useRef<HTMLInputElement>(null);

  // Upload & parse
  const [filename, setFilename] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [hasParsed, setHasParsed] = useState(false);

  // Section 1
  const [affaires, setAffaires] = useState<AffaireOption[]>([]);
  const [affaireId, setAffaireId] = useState<string>("");
  const [newAffaireNumero, setNewAffaireNumero] = useState("");
  const [newAffaireNom, setNewAffaireNom] = useState("");
  const [newAffaireClient, setNewAffaireClient] = useState("");
  const [newAffaireLieu, setNewAffaireLieu] = useState("");
  const [nomDevis, setNomDevis] = useState("");
  const [numeroDevis, setNumeroDevis] = useState("");
  const [dateMontage, setDateMontage] = useState<Date | undefined>(undefined);
  const [dateDemontage, setDateDemontage] = useState<Date | undefined>(undefined);

  // Section 2
  const [postes, setPostes] = useState<PosteRow[]>([]);

  useEffect(() => {
    supabase
      .from("affaires")
      .select("id, numero, nom, client, lieu")
      .order("numero", { ascending: false })
      .limit(200)
      .then(({ data }) => setAffaires((data ?? []) as AffaireOption[]));
  }, []);

  const metierByCode = useMemo(() => {
    const map = new Map<MetierCode, number>();
    metiers.forEach((m) => map.set(m.code as MetierCode, m.id));
    return map;
  }, [metiers]);

  const selectedAffaire = useMemo(
    () => (affaireId && affaireId !== NEW_AFFAIRE ? affaires.find((a) => a.id === affaireId) : undefined),
    [affaireId, affaires],
  );
  const effectiveClient = affaireId === NEW_AFFAIRE ? newAffaireClient : selectedAffaire?.client ?? "";
  const effectiveLieu = affaireId === NEW_AFFAIRE ? newAffaireLieu : selectedAffaire?.lieu ?? "";

  const handleFile = async (file: File) => {
    setParsing(true);
    setFilename(file.name);
    setParseErrors([]);
    try {
      const buf = await file.arrayBuffer();
      const result = parseDevisFromArrayBuffer(buf, { filename: file.name });
      setParseErrors(result.errors);

      if (result.meta.libelle) setNomDevis(result.meta.libelle);
      const fnNoExt = file.name.replace(/\.(xlsx?|xls)$/i, "").trim();
      setNumeroDevis(fnNoExt || result.meta.numeroDevis || "");

      const byMetier = new Map<MetierCode, { heures: number; montant: number; libelles: string[] }>();
      const sansMetier = { heures: 0, montant: 0, libelles: [] as string[] };
      result.lines.forEach((l) => {
        if (l.excluded) return;
        if (l.metierFinalCode) {
          const cur = byMetier.get(l.metierFinalCode) ?? { heures: 0, montant: 0, libelles: [] };
          cur.heures += l.tempsPrevu ?? 0;
          cur.montant += l.total ?? 0;
          if (l.designation) cur.libelles.push(l.designation);
          byMetier.set(l.metierFinalCode, cur);
        } else {
          sansMetier.heures += l.tempsPrevu ?? 0;
          sansMetier.montant += l.total ?? 0;
          if (l.designation) sansMetier.libelles.push(l.designation);
        }
      });

      const newPostes: PosteRow[] = Array.from(byMetier.entries()).map(([code, v], i) => ({
        key: `${code}-${i}`,
        metierId: metierByCode.get(code) ?? null,
        heures: round1(v.heures),
        montantHt: round2(v.montant),
        libellesSources: v.libelles,
        manuel: false,
      }));
      if (sansMetier.heures > 0 || sansMetier.libelles.length > 0) {
        newPostes.push({
          key: `sansmetier-${Date.now()}`,
          metierId: null,
          heures: round1(sansMetier.heures),
          montantHt: round2(sansMetier.montant),
          libellesSources: sansMetier.libelles,
          manuel: false,
        });
      }
      setPostes(newPostes);
      setHasParsed(true);
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

  const updatePoste = (key: string, patch: Partial<PosteRow>) =>
    setPostes((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  const removePoste = (key: string) => setPostes((ps) => ps.filter((p) => p.key !== key));
  const addPoste = () =>
    setPostes((ps) => [
      ...ps,
      { key: `manuel-${Date.now()}`, metierId: null, heures: 0, montantHt: 0, libellesSources: [], manuel: true },
    ]);

  const totals = useMemo(() => {
    let h = 0;
    let m = 0;
    postes.forEach((p) => { h += p.heures || 0; m += p.montantHt || 0; });
    return { heures: round1(h), montant: round2(m) };
  }, [postes]);

  const errors = useMemo(() => {
    const errs: string[] = [];
    if (!hasParsed) return errs;
    if (!affaireId) errs.push("Sélectionne une affaire (ou créer une nouvelle).");
    if (affaireId === NEW_AFFAIRE) {
      if (!newAffaireNumero.trim()) errs.push("Numéro de la nouvelle affaire requis.");
      if (!newAffaireNom.trim()) errs.push("Nom de la nouvelle affaire requis.");
    }
    if (!numeroDevis.trim()) errs.push("Numéro de devis requis.");
    if (!dateMontage) errs.push("Date de montage requise.");
    if (postes.length === 0) errs.push("Aucun poste à importer.");
    if (postes.some((p) => !p.metierId)) errs.push("Tous les postes doivent avoir un métier assigné.");
    if (postes.some((p) => p.heures <= 0)) errs.push("Toutes les heures doivent être > 0.");
    return errs;
  }, [hasParsed, affaireId, newAffaireNumero, newAffaireNom, numeroDevis, dateMontage, postes]);

  const canCommit = hasParsed && errors.length === 0 && !committing;

  const reset = () => {
    setHasParsed(false);
    setFilename(null);
    setParseErrors([]);
    setPostes([]);
    setNomDevis("");
    setNumeroDevis("");
    setDateMontage(undefined);
    setDateDemontage(undefined);
    setAffaireId("");
    setNewAffaireNumero("");
    setNewAffaireNom("");
    setNewAffaireClient("");
    setNewAffaireLieu("");
  };

  const commit = async () => {
    if (!canCommit) return;
    setCommitting(true);
    try {
      // Import atomique : affaire + devis + postes en une seule transaction côté DB.
      // Si n'importe quelle étape échoue, RIEN n'est créé (transaction rollback).
      const postesPayload = postes.map((p) => ({
        metier_id: p.metierId!,
        heures_prevues: p.heures,
        montant_ht: p.montantHt || null,
        libelle_source: p.libellesSources.slice(0, 5).join(" • ").slice(0, 500) || null,
      }));

      const { error } = await supabase.rpc("import_devis_atomique", {
        _affaire_id: affaireId === NEW_AFFAIRE ? null : affaireId,
        _new_affaire:
          affaireId === NEW_AFFAIRE
            ? {
                numero: newAffaireNumero.trim(),
                nom: newAffaireNom.trim(),
                client: newAffaireClient.trim() || null,
                lieu: newAffaireLieu.trim() || null,
              }
            : {},
        _date_montage: toIso(dateMontage),
        _date_demontage: toIso(dateDemontage),
        _devis: {
          numero: numeroDevis.trim(),
          libelle: nomDevis.trim() || null,
          montant_ht: totals.montant ? String(totals.montant) : null,
          fichier_source: filename,
        },
        _postes: postesPayload,
      });

      if (error) {
        toast.error("Import impossible", { description: error.message });
        return;
      }

      toast.success("Devis importé", {
        description: `${postesPayload.length} poste(s), ${totals.heures} h, ${totals.montant.toLocaleString("fr-FR")} € HT.`,
      });
      reset();
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
    <TooltipProvider delayDuration={150}>
      <div className="mx-auto max-w-7xl space-y-6 p-6">
        <PageHeader
          number="04"
          eyebrow="Données / Import"
          title="Import devis Excel"
          description="Charge un fichier devis (.xlsx). Le parser pré-remplit les champs et regroupe les heures par métier — à toi de valider ou corriger avant import."
        />

        {/* Drop zone + saisie manuelle */}
        {!hasParsed && (
          <div className="space-y-3">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center transition-colors",
                dragOver ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40",
              )}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                {parsing ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {filename ?? "Glisser le fichier .xlsx, .xls ou .csv (ou cliquer pour sélectionner)"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Colonnes attendues : N° • Désignation • Qté • Unité • PU HT • Total • TVA • Temps prévu
                </p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">ou</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="flex justify-center">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                onClick={(e) => {
                  e.stopPropagation();
                  setHasParsed(true);
                  setFilename(null);
                  setPostes([]);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Créer un devis manuellement
              </Button>
            </div>
          </div>
        )}

        {parseErrors.length > 0 && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="space-y-1 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
                <AlertCircle className="h-4 w-4" /> Avertissements de parsing
              </p>
              {parseErrors.map((e, i) => <div key={i} className="text-xs text-destructive/80">• {e}</div>)}
            </CardContent>
          </Card>
        )}

        {hasParsed && (
          <>
            {/* SECTION 1 — Affaire & devis */}
            <Card>
              <CardContent className="space-y-5 p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Section 1 — Affaire & devis
                  </h2>
                  <p className="text-[11px] text-muted-foreground">
                    Fichier : <span className="font-medium text-foreground">{filename}</span>
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {/* Affaire */}
                  <div className="space-y-1.5">
                    <Label>Numéro d'affaire <span className="text-destructive">*</span></Label>
                    <Select value={affaireId} onValueChange={setAffaireId}>
                      <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="Choisir une affaire ou en créer…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NEW_AFFAIRE} className="font-semibold text-primary">
                          + Créer une nouvelle affaire
                        </SelectItem>
                        {affaires.map((a) => (
                          <SelectItem key={a.id} value={a.id}>{a.numero} — {a.nom}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Numéro devis */}
                  <div className="space-y-1.5">
                    <Label>Numéro de devis <span className="text-destructive">*</span></Label>
                    <Input
                      value={numeroDevis}
                      onChange={(e) => setNumeroDevis(e.target.value)}
                      placeholder="D-202604-XXXX"
                      className="h-10 rounded-xl"
                    />
                  </div>

                  {/* Sous-champs nouvelle affaire */}
                  {affaireId === NEW_AFFAIRE && (
                    <>
                      <div className="space-y-1.5">
                        <Label>N° nouvelle affaire <span className="text-destructive">*</span></Label>
                        <Input
                          value={newAffaireNumero}
                          onChange={(e) => setNewAffaireNumero(e.target.value)}
                          placeholder="Ex. A-2604-001"
                          className="h-10 rounded-xl"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Nom de la nouvelle affaire <span className="text-destructive">*</span></Label>
                        <Input
                          value={newAffaireNom}
                          onChange={(e) => setNewAffaireNom(e.target.value)}
                          placeholder="Ex. Stand Maison & Objet 2026"
                          className="h-10 rounded-xl"
                        />
                      </div>
                    </>
                  )}

                  {/* Nom devis */}
                  <div className="space-y-1.5 md:col-span-2">
                    <Label>Nom du devis</Label>
                    <Input
                      value={nomDevis}
                      onChange={(e) => setNomDevis(e.target.value)}
                      placeholder="Libellé du devis (pré-rempli)"
                      className="h-10 rounded-xl"
                    />
                  </div>

                  {/* Client / lieu */}
                  <div className="space-y-1.5">
                    <Label>Client</Label>
                    {affaireId === NEW_AFFAIRE ? (
                      <Input
                        value={newAffaireClient}
                        onChange={(e) => setNewAffaireClient(e.target.value)}
                        placeholder="Client de la nouvelle affaire"
                        className="h-10 rounded-xl"
                      />
                    ) : (
                      <Input value={effectiveClient || "—"} readOnly className="h-10 rounded-xl bg-muted/40" />
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Lieu chantier</Label>
                    {affaireId === NEW_AFFAIRE ? (
                      <Input
                        value={newAffaireLieu}
                        onChange={(e) => setNewAffaireLieu(e.target.value)}
                        placeholder="Lieu du chantier"
                        className="h-10 rounded-xl"
                      />
                    ) : (
                      <Input value={effectiveLieu || "—"} readOnly className="h-10 rounded-xl bg-muted/40" />
                    )}
                  </div>

                  {/* Dates */}
                  <DatePickerField
                    label="Date de montage"
                    required
                    value={dateMontage}
                    onChange={setDateMontage}
                  />
                  <DatePickerField
                    label="Date de démontage"
                    value={dateDemontage}
                    onChange={setDateDemontage}
                    minDate={dateMontage}
                  />

                  {/* Montant total lecture seule */}
                  <div className="space-y-1.5 md:col-span-2">
                    <Label>Montant HT total (calculé)</Label>
                    <Input
                      readOnly
                      value={`${totals.montant.toLocaleString("fr-FR")} € HT`}
                      className="h-10 rounded-xl bg-muted/40 font-semibold"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* SECTION 2 — Heures par poste */}
            <Card>
              <CardContent className="space-y-3 p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Section 2 — Heures par poste
                  </h2>
                  <Button variant="outline" size="sm" onClick={addPoste} className="rounded-lg">
                    <Plus className="mr-1 h-3.5 w-3.5" /> Ajouter un poste
                  </Button>
                </div>

                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left">Métier</th>
                        <th className="px-3 py-2 text-right w-[140px]">Heures prévues</th>
                        <th className="px-3 py-2 text-right w-[160px]">Montant HT</th>
                        <th className="px-3 py-2 text-center w-[60px]">Sources</th>
                        <th className="px-3 py-2 w-[60px]"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {postes.length === 0 && (
                        <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-muted-foreground">
                          Aucun poste détecté. Clique sur « Ajouter un poste » pour saisir manuellement.
                        </td></tr>
                      )}
                      {postes.map((p) => {
                        const m = p.metierId ? byId(p.metierId) : null;
                        return (
                          <tr key={p.key} className="border-t border-border">
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <Select
                                  value={p.metierId ? String(p.metierId) : ""}
                                  onValueChange={(v) => updatePoste(p.key, { metierId: Number(v) })}
                                >
                                  <SelectTrigger className="h-9 w-[200px] rounded-lg text-xs">
                                    <SelectValue placeholder="Choisir un métier…" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {metiers.map((mm) => (
                                      <SelectItem key={mm.id} value={String(mm.id)}>{mm.libelle}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {m && <MetierBadge libelle={m.libelle} couleur={m.couleur} />}
                                {p.manuel && (
                                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">manuel</span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                type="number"
                                min={0}
                                step={0.5}
                                value={p.heures}
                                onChange={(e) => updatePoste(p.key, { heures: Number(e.target.value) || 0 })}
                                className="h-9 rounded-lg text-right tabular-nums"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                type="number"
                                min={0}
                                step={0.01}
                                value={p.montantHt}
                                onChange={(e) => updatePoste(p.key, { montantHt: Number(e.target.value) || 0 })}
                                className="h-9 rounded-lg text-right tabular-nums"
                              />
                            </td>
                            <td className="px-3 py-2 text-center">
                              {p.libellesSources.length > 0 ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className="text-muted-foreground hover:text-foreground">
                                      <Info className="h-4 w-4" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="left" className="max-w-md">
                                    <p className="text-[11px] font-semibold uppercase tracking-wider mb-1">
                                      {p.libellesSources.length} ligne(s) source
                                    </p>
                                    <ul className="space-y-0.5 text-xs">
                                      {p.libellesSources.slice(0, 12).map((l, i) => (
                                        <li key={i}>• {l}</li>
                                      ))}
                                      {p.libellesSources.length > 12 && (
                                        <li className="opacity-70">… et {p.libellesSources.length - 12} autres</li>
                                      )}
                                    </ul>
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removePoste(p.key)}
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-muted/30 text-sm font-semibold">
                      <tr className="border-t border-border">
                        <td className="px-3 py-2 text-right uppercase text-[11px] tracking-wider text-muted-foreground">Totaux</td>
                        <td className="px-3 py-2 text-right tabular-nums">{totals.heures} h</td>
                        <td className="px-3 py-2 text-right tabular-nums">{totals.montant.toLocaleString("fr-FR")} €</td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Erreurs validation */}
            {errors.length > 0 && (
              <Card className="border-destructive/40 bg-destructive/5">
                <CardContent className="space-y-1 p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
                    <AlertCircle className="h-4 w-4" /> Corrections requises avant validation
                  </p>
                  {errors.map((e, i) => <div key={i} className="text-xs text-destructive/80">• {e}</div>)}
                </CardContent>
              </Card>
            )}

            {/* Footer commit */}
            <div className="sticky bottom-4 flex flex-wrap items-center justify-end gap-3 rounded-2xl border border-border bg-card/95 p-3 shadow-elegant backdrop-blur">
              <p className="mr-auto text-xs text-muted-foreground">
                {errors.length === 0
                  ? `Prêt à importer : ${postes.length} poste(s) • ${totals.heures} h • ${totals.montant.toLocaleString("fr-FR")} € HT.`
                  : `${errors.length} correction(s) avant validation.`}
              </p>
              <Button variant="ghost" onClick={reset} className="rounded-xl">Réinitialiser</Button>
              <Button
                onClick={commit}
                disabled={!canCommit}
                className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {committing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
                Valider et importer
              </Button>
            </div>
          </>
        )}
      </div>
    </TooltipProvider>
  );
}

function DatePickerField({
  label, value, onChange, required, minDate,
}: {
  label: string;
  value: Date | undefined;
  onChange: (d: Date | undefined) => void;
  required?: boolean;
  minDate?: Date;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label} {required && <span className="text-destructive">*</span>}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "h-10 w-full justify-start rounded-xl text-left font-normal",
              !value && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {value ? format(value, "EEEE d MMMM yyyy", { locale: fr }) : "Choisir une date"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value}
            onSelect={onChange}
            disabled={minDate ? (d) => d < minDate : undefined}
            initialFocus
            locale={fr}
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
