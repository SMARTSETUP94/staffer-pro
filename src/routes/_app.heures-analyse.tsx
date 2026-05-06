/**
 * v0.22 — Centre d'analyse heures consolidé (admin + chef)
 *
 * Tableau complet des `heures_saisies` avec filtres combinables persistés
 * dans l'URL (lien partageable), compteur live, KPIs et exports CSV / Excel.
 * Spec : mem://features/centre-analyse-heures.
 *
 * Filtres URL (validateSearch + zodValidator) :
 *  - preset (7j, 30j, semaine, mois, mois_precedent, custom)
 *  - from / to (YYYY-MM-DD)
 *  - statut (multi : brouillon|soumis|valide|rejete)
 *  - saisi_par (all|employe|chef)
 *  - nuit (0|1)
 *  - employe (recherche fuzzy nom/prénom)
 *  - chantier (numéro ou nom)
 *  - devis (numéro)
 *  - metier (id ou "all")
 *
 * Filtrage RLS côté DB garantit que le chef ne voit que son périmètre.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useEffect, useMemo, useState } from "react";
import { format, parseISO, startOfMonth, startOfWeek, subDays, subMonths } from "date-fns";
import { fr } from "date-fns/locale";
import { Download, Filter, Loader2, Moon, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";

// ============================================================================
// Search params schema
// ============================================================================

const STATUTS = ["brouillon", "soumis", "valide", "rejete"] as const;
type Statut = (typeof STATUTS)[number];

const PRESETS = ["7j", "30j", "semaine", "mois", "mois_precedent", "custom"] as const;
type PresetKey = (typeof PRESETS)[number];

const searchSchema = z.object({
  preset: fallback(z.enum(PRESETS), "30j").default("30j"),
  from: fallback(z.string(), "").default(""),
  to: fallback(z.string(), "").default(""),
  // Multi-select statut sous forme de string CSV (compact en URL)
  statut: fallback(z.array(z.enum(STATUTS)), []).default([]),
  saisi_par: fallback(z.enum(["all", "employe", "chef"]), "all").default("all"),
  nuit: fallback(z.boolean(), false).default(false),
  employe: fallback(z.string(), "").default(""),
  chantier: fallback(z.string(), "").default(""),
  devis: fallback(z.string(), "").default(""),
  metier: fallback(z.string(), "all").default("all"),
});

type SearchParams = z.infer<typeof searchSchema>;

export const Route = createFileRoute("/_app/heures-analyse")({
  validateSearch: zodValidator(searchSchema),
  component: HeuresAnalysePage,
});

// ============================================================================
// Types & helpers
// ============================================================================

interface Row {
  id: string;
  date: string;
  heures_reelles: number | null;
  heures_nuit: number;
  statut: Statut;
  commentaire: string | null;
  saisi_par_chef: boolean;
  affaire_id: string;
  devis_id: string | null;
  metier_id: number | null;
  employe_id: string;
  valide_le: string | null;
  employe?: { prenom: string; nom: string } | null;
  affaire?: { numero: string; nom: string } | null;
  devis?: { numero: string } | null;
  metier?: { libelle: string } | null;
  valideur?: { full_name: string | null; email: string } | null;
}

const STATUT_META: Record<Statut, { label: string; tone: string }> = {
  brouillon: { label: "Brouillon", tone: "bg-muted text-muted-foreground" },
  soumis: { label: "À valider", tone: "bg-indigo-500/15 text-indigo-600 border-indigo-500/30" },
  valide: { label: "Validée", tone: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
  rejete: { label: "Rejetée", tone: "bg-destructive/15 text-destructive border-destructive/30" },
};

function presetRange(key: PresetKey): { from: string; to: string } {
  const today = new Date();
  const fmt = (d: Date) => format(d, "yyyy-MM-dd");
  switch (key) {
    case "7j":
      return { from: fmt(subDays(today, 6)), to: fmt(today) };
    case "30j":
      return { from: fmt(subDays(today, 29)), to: fmt(today) };
    case "semaine":
      return { from: fmt(startOfWeek(today, { weekStartsOn: 1 })), to: fmt(today) };
    case "mois":
      return { from: fmt(startOfMonth(today)), to: fmt(today) };
    case "mois_precedent": {
      const lastMonth = subMonths(today, 1);
      return {
        from: fmt(startOfMonth(lastMonth)),
        to: fmt(new Date(today.getFullYear(), today.getMonth(), 0)),
      };
    }
    default:
      return { from: fmt(subDays(today, 29)), to: fmt(today) };
  }
}

/** Résolution from/to effectifs : si preset != custom, on dérive ; sinon on prend l'URL ou un défaut. */
function resolveRange(search: SearchParams): { from: string; to: string } {
  if (search.preset !== "custom") return presetRange(search.preset);
  const def = presetRange("30j");
  return {
    from: search.from || def.from,
    to: search.to || def.to,
  };
}

/** Compte le nombre de filtres actifs (hors période). */
function countActiveFilters(s: SearchParams): number {
  let n = 0;
  if (s.statut.length > 0) n++;
  if (s.saisi_par !== "all") n++;
  if (s.nuit) n++;
  if (s.employe.trim()) n++;
  if (s.chantier.trim()) n++;
  if (s.devis.trim()) n++;
  if (s.metier !== "all") n++;
  return n;
}

// ============================================================================
// Page
// ============================================================================

function HeuresAnalysePage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const { from, to } = resolveRange(search);

  const [rows, setRows] = useState<Row[]>([]);
  const [metiers, setMetiers] = useState<{ id: number; libelle: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // Helper update
  function updateSearch(patch: Partial<SearchParams>) {
    void navigate({ search: (prev: SearchParams) => ({ ...prev, ...patch }) });
  }

  function setPreset(p: PresetKey) {
    if (p === "custom") {
      updateSearch({ preset: "custom", from: from, to: to });
    } else {
      // On vide from/to (le preset les régénère)
      updateSearch({ preset: p, from: "", to: "" });
    }
  }

  function resetFilters() {
    void navigate({
      search: {
        preset: "30j",
        from: "",
        to: "",
        statut: [],
        saisi_par: "all",
        nuit: false,
        employe: "",
        chantier: "",
        devis: "",
        metier: "all",
      },
    });
  }

  function toggleStatut(s: Statut) {
    const has = search.statut.includes(s);
    updateSearch({
      statut: has ? search.statut.filter((x) => x !== s) : [...search.statut, s],
    });
  }

  // Charger métiers une fois
  useEffect(() => {
    void supabase
      .from("metiers")
      .select("id, libelle")
      .order("ordre")
      .then(({ data }) => setMetiers(data ?? []));
  }, []);

  // Charger heures (re-fetch sur changement de période)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const { data, error } = await supabase
        .from("heures_saisies")
        .select(
          `id, date, heures_reelles, heures_nuit, statut, commentaire, saisi_par_chef,
           affaire_id, devis_id, metier_id, employe_id, valide_le,
           employe:employes!heures_saisies_employe_id_fkey(prenom, nom),
           affaire:affaires!heures_saisies_affaire_id_fkey(numero, nom),
           devis:devis(numero),
           metier:metiers(libelle),
           valideur:profiles!heures_saisies_valide_par_fkey(full_name, email)`,
        )
        .gte("date", from)
        .lte("date", to)
        .order("date", { ascending: false })
        .limit(2000);

      if (cancelled) return;
      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }
      setRows((data ?? []) as unknown as Row[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (search.statut.length > 0 && !search.statut.includes(r.statut)) return false;
      if (search.saisi_par === "employe" && r.saisi_par_chef) return false;
      if (search.saisi_par === "chef" && !r.saisi_par_chef) return false;
      if (search.nuit && (r.heures_nuit ?? 0) <= 0) return false;
      if (search.metier !== "all" && String(r.metier_id ?? "") !== search.metier) return false;
      if (search.employe.trim()) {
        const q = search.employe.toLowerCase();
        const name = r.employe ? `${r.employe.prenom} ${r.employe.nom}`.toLowerCase() : "";
        if (!name.includes(q)) return false;
      }
      if (search.chantier.trim()) {
        const q = search.chantier.toLowerCase();
        const aff = r.affaire ? `${r.affaire.numero} ${r.affaire.nom}`.toLowerCase() : "";
        if (!aff.includes(q)) return false;
      }
      if (search.devis.trim()) {
        const q = search.devis.toLowerCase();
        const dv = r.devis?.numero?.toLowerCase() ?? "";
        if (!dv.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search]);

  const kpis = useMemo(() => {
    const total = filtered.reduce((acc, r) => acc + (r.heures_reelles ?? 0), 0);
    const validees = filtered
      .filter((r) => r.statut === "valide")
      .reduce((acc, r) => acc + (r.heures_reelles ?? 0), 0);
    const nuit = filtered.reduce((acc, r) => acc + (r.heures_nuit ?? 0), 0);
    const aValider = filtered.filter((r) => r.statut === "soumis").length;
    return {
      total,
      validees,
      pctValidees: total > 0 ? Math.round((validees / total) * 100) : 0,
      nuit,
      pctNuit: total > 0 ? Math.round((nuit / total) * 100) : 0,
      aValider,
      lignes: filtered.length,
    };
  }, [filtered]);

  const activeCount = countActiveFilters(search);

  function exportCsv() {
    const header = [
      "Date", "Employé", "Chantier", "Devis", "Métier", "Heures",
      "Dont nuit", "Statut", "Saisi par chef", "Validée le", "Validateur", "Commentaire",
    ];
    const lines = filtered.map((r) =>
      [
        r.date,
        r.employe ? `${r.employe.prenom} ${r.employe.nom}` : "",
        r.affaire ? `${r.affaire.numero} - ${r.affaire.nom}` : "",
        r.devis?.numero ?? "",
        r.metier?.libelle ?? "",
        r.heures_reelles ?? 0,
        r.heures_nuit ?? 0,
        STATUT_META[r.statut]?.label ?? r.statut,
        r.saisi_par_chef ? "oui" : "non",
        r.valide_le ? format(parseISO(r.valide_le), "yyyy-MM-dd HH:mm") : "",
        r.valideur?.full_name ?? r.valideur?.email ?? "",
        (r.commentaire ?? "").replace(/[\r\n]+/g, " "),
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(";"),
    );
    const csv = [header.join(";"), ...lines].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `heures-analyse-${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportXlsx() {
    const XLSX = await import("xlsx-js-style");
    const data = [
      ["Date", "Employé", "Chantier", "Devis", "Métier", "Heures", "Dont nuit", "Statut", "Saisi par chef", "Validée le", "Validateur", "Commentaire"],
      ...filtered.map((r) => [
        r.date,
        r.employe ? `${r.employe.prenom} ${r.employe.nom}` : "",
        r.affaire ? `${r.affaire.numero} - ${r.affaire.nom}` : "",
        r.devis?.numero ?? "",
        r.metier?.libelle ?? "",
        r.heures_reelles ?? 0,
        r.heures_nuit ?? 0,
        STATUT_META[r.statut]?.label ?? r.statut,
        r.saisi_par_chef ? "oui" : "non",
        r.valide_le ? format(parseISO(r.valide_le), "yyyy-MM-dd HH:mm") : "",
        r.valideur?.full_name ?? r.valideur?.email ?? "",
        r.commentaire ?? "",
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Heures");
    XLSX.writeFile(wb, `heures-analyse-${from}_${to}.xlsx`);
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Lien copié — filtres inclus");
    } catch {
      toast.error("Impossible de copier le lien");
    }
  }

  return (
    <RoleGuard required="chef_or_admin">
      <div className="space-y-4">
        <PageHeader
          number="03"
          eyebrow="Heures / Reporting"
          title="Centre d'analyse heures"
          description="Toutes les heures saisies, à valider et validées avec filtres et exports."
          actions={
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={copyShareLink}>
                Copier le lien
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" disabled={!filtered.length}>
                    <Download className="mr-1.5 h-4 w-4" /> Exporter
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={exportCsv}>CSV (UTF-8)</DropdownMenuItem>
                  <DropdownMenuItem onClick={exportXlsx}>Excel (.xlsx)</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          }
        />

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label="Heures totales" value={kpis.total.toFixed(1) + " h"} subline={`${kpis.lignes} saisies`} />
          <KpiCard
            label="Heures validées"
            value={kpis.validees.toFixed(1) + " h"}
            subline={`${kpis.pctValidees}% du total`}
            tone="success"
          />
          <KpiCard
            label="Heures de nuit"
            value={kpis.nuit.toFixed(1) + " h"}
            subline={`${kpis.pctNuit}% du total`}
            tone="warning"
          />
          <KpiCard label="À valider" value={String(kpis.aValider)} subline="saisies en attente" tone="info" />
        </div>

        {/* Bandeau compteur live */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="secondary" className="font-mono">
              {kpis.lignes} résultat{kpis.lignes > 1 ? "s" : ""}
            </Badge>
            <span className="text-muted-foreground">
              · Période <strong className="text-foreground">{from}</strong> → <strong className="text-foreground">{to}</strong>
            </span>
            {activeCount > 0 && (
              <Badge variant="outline" className="bg-indigo-500/15 text-indigo-600 border-indigo-500/30">
                {activeCount} filtre{activeCount > 1 ? "s" : ""} actif{activeCount > 1 ? "s" : ""}
              </Badge>
            )}
          </div>
          {activeCount > 0 && (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <X className="mr-1 h-3.5 w-3.5" /> Réinitialiser
            </Button>
          )}
        </div>

        {/* Filtres */}
        <Card>
          <CardContent className="space-y-4 pt-4">
            <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
              <div className="grid gap-1">
                <Label className="text-xs">Période</Label>
                <Select value={search.preset} onValueChange={(v) => setPreset(v as PresetKey)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7j">7 derniers jours</SelectItem>
                    <SelectItem value="30j">30 derniers jours</SelectItem>
                    <SelectItem value="semaine">Cette semaine</SelectItem>
                    <SelectItem value="mois">Ce mois</SelectItem>
                    <SelectItem value="mois_precedent">Mois précédent</SelectItem>
                    <SelectItem value="custom">Personnalisé</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Du</Label>
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => updateSearch({ preset: "custom", from: e.target.value, to })}
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Au</Label>
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => updateSearch({ preset: "custom", from, to: e.target.value })}
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Métier</Label>
                <Select value={search.metier} onValueChange={(v) => updateSearch({ metier: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous</SelectItem>
                    {metiers.map((m) => (
                      <SelectItem key={m.id} value={String(m.id)}>{m.libelle}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Saisi par</Label>
                <Select
                  value={search.saisi_par}
                  onValueChange={(v) => updateSearch({ saisi_par: v as SearchParams["saisi_par"] })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous</SelectItem>
                    <SelectItem value="employe">Employé lui-même</SelectItem>
                    <SelectItem value="chef">Chef pour employé</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Employé</Label>
                <div className="relative">
                  <Filter className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    className="pl-7"
                    placeholder="Nom / prénom"
                    value={search.employe}
                    onChange={(e) => updateSearch({ employe: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Chantier</Label>
                <Input
                  placeholder="Numéro ou nom"
                  value={search.chantier}
                  onChange={(e) => updateSearch({ chantier: e.target.value })}
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Devis</Label>
                <Input
                  placeholder="D-XXXXXX-YYYY"
                  value={search.devis}
                  onChange={(e) => updateSearch({ devis: e.target.value })}
                />
              </div>
            </div>

            {/* Statut multi + nuit */}
            <div className="flex flex-wrap items-center gap-4 border-t pt-3">
              <div className="grid gap-1">
                <Label className="text-xs">Statut (multi-sélection)</Label>
                <ToggleGroup
                  type="multiple"
                  value={search.statut}
                  onValueChange={(v) => updateSearch({ statut: v as Statut[] })}
                  variant="outline"
                  size="sm"
                >
                  {STATUTS.map((s) => (
                    <ToggleGroupItem
                      key={s}
                      value={s}
                      onClick={(e) => {
                        // ToggleGroup gère déjà via onValueChange ; pas de double toggle
                        e.preventDefault();
                        toggleStatut(s);
                      }}
                    >
                      {STATUT_META[s].label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
              <div className="flex items-center gap-2 pt-5">
                <Switch
                  id="nuit"
                  checked={search.nuit}
                  onCheckedChange={(v) => updateSearch({ nuit: v })}
                />
                <Label htmlFor="nuit" className="cursor-pointer text-sm flex items-center gap-1">
                  <Moon className="h-3.5 w-3.5" /> Nuit uniquement
                </Label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tableau */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center p-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center text-sm text-muted-foreground">
                Aucune heure trouvée pour ces filtres.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">Date</TableHead>
                      <TableHead>Employé</TableHead>
                      <TableHead>Chantier</TableHead>
                      <TableHead>Devis</TableHead>
                      <TableHead>Métier</TableHead>
                      <TableHead className="text-right">Heures</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Saisi par</TableHead>
                      <TableHead>Validée</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.slice(0, 500).map((r) => {
                      const meta = STATUT_META[r.statut];
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="text-xs">
                            {format(parseISO(r.date), "dd/MM/yy", { locale: fr })}
                          </TableCell>
                          <TableCell className="text-xs">
                            {r.employe ? `${r.employe.prenom} ${r.employe.nom}` : "—"}
                          </TableCell>
                          <TableCell className="text-xs">
                            {r.affaire ? (
                              <span>
                                <span className="font-mono font-semibold">{r.affaire.numero}</span>{" "}
                                <span className="text-muted-foreground">{r.affaire.nom}</span>
                              </span>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="text-xs font-mono">{r.devis?.numero ?? "—"}</TableCell>
                          <TableCell className="text-xs">{r.metier?.libelle ?? "—"}</TableCell>
                          <TableCell className="text-right text-xs">
                            <div className="font-semibold">{(r.heures_reelles ?? 0).toFixed(1)}h</div>
                            {(r.heures_nuit ?? 0) > 0 && (
                              <div className="flex items-center justify-end gap-0.5 text-amber-600">
                                <Moon className="h-3 w-3" /> {r.heures_nuit.toFixed(1)}h
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={meta.tone}>{meta.label}</Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            {r.saisi_par_chef ? (
                              <Badge variant="outline" className="bg-amber-500/15 text-amber-600 border-amber-500/30">
                                Chef
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">Employé</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {r.valide_le ? format(parseISO(r.valide_le), "dd/MM/yy") : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {filtered.length > 500 && (
                  <div className="border-t p-3 text-center text-xs text-muted-foreground">
                    Affichage limité à 500 lignes. Affinez les filtres ou utilisez l'export pour la liste complète ({filtered.length} résultats).
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </RoleGuard>
  );
}

function KpiCard({
  label,
  value,
  subline,
  tone = "default",
}: {
  label: string;
  value: string;
  subline?: string;
  tone?: "default" | "success" | "warning" | "info";
}) {
  const toneCls = {
    default: "text-foreground",
    success: "text-emerald-600",
    warning: "text-amber-600",
    info: "text-indigo-600",
  }[tone];
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`mt-1 text-2xl font-bold ${toneCls}`}>{value}</div>
        {subline && <div className="mt-0.5 text-xs text-muted-foreground">{subline}</div>}
      </CardContent>
    </Card>
  );
}
