/**
 * v0.22.2 — Centre d'analyse heures consolidé (admin + chef)
 *
 * Évolutions Option B :
 * - P0 : KPI coût estimé (heures × tarif horaire moyen 65€/h) + toggle heures sup
 *        (>8h/jour) + multi-select chantier/employé/devis + tri colonnes +
 *        pagination 50/page.
 * - Bulk actions : sélection multi-cases + barre flottante Valider / Rejeter.
 * - Modal export avec checkbox "Anonymiser noms" (admin only RGPD), appliquée
 *   à CSV / Excel / PDF.
 *
 * Backwards compat : URLs anciennes acceptées via `fallback()` (les valeurs
 * string sur chantier/employe/devis sont remplacées par tableau vide).
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useEffect, useMemo, useState } from "react";
import { format, parseISO, startOfMonth, startOfWeek, subDays, subMonths } from "date-fns";
import { fr } from "date-fns/locale";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Moon,
  ShieldAlert,
  TrendingUp,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MultiSelectCombo } from "@/components/ui/multi-select-combo";
import type { SilaeValidationReport } from "@/lib/heures-export";

// ============================================================================
// Constantes + Schema search
// ============================================================================

const STATUTS = ["brouillon", "soumis", "valide", "rejete"] as const;
type Statut = (typeof STATUTS)[number];

const PRESETS = ["7j", "30j", "semaine", "mois", "mois_precedent", "custom"] as const;
type PresetKey = (typeof PRESETS)[number];

const SORT_FIELDS = ["date", "employe", "chantier", "heures", "statut"] as const;
type SortField = (typeof SORT_FIELDS)[number];

/** Tarif horaire moyen pour estimation coût (€/h, charges comprises). */
const TARIF_HORAIRE_MOYEN = 65;
/** Seuil heures sup : > 8h sur une saisie journalière. */
const SEUIL_HEURES_SUP = 8;
const PAGE_SIZE = 50;

const arrayOfString = z
  .preprocess((v) => {
    if (Array.isArray(v)) return v.filter((x) => typeof x === "string");
    if (typeof v === "string" && v) return [v];
    return [];
  }, z.array(z.string()));

const searchSchema = z.object({
  preset: fallback(z.enum(PRESETS), "30j").default("30j"),
  from: fallback(z.string(), "").default(""),
  to: fallback(z.string(), "").default(""),
  statut: fallback(z.array(z.enum(STATUTS)), []).default([]),
  saisi_par: fallback(z.enum(["all", "employe", "chef"]), "all").default("all"),
  nuit: fallback(z.boolean(), false).default(false),
  heures_sup: fallback(z.boolean(), false).default(false),
  employe: fallback(arrayOfString, []).default([]),
  chantier: fallback(arrayOfString, []).default([]),
  devis: fallback(arrayOfString, []).default([]),
  metier: fallback(z.string(), "all").default("all"),
  sort: fallback(z.enum(SORT_FIELDS), "date").default("date"),
  dir: fallback(z.enum(["asc", "desc"]), "desc").default("desc"),
  page: fallback(z.number().int().min(1), 1).default(1),
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
  heure_debut: string | null;
  heure_fin: string | null;
  heures_reelles: number | null;
  heures_nuit: number;
  statut: Statut;
  commentaire: string | null;
  motif_rejet: string | null;
  saisi_par_chef: boolean;
  affaire_id: string;
  devis_id: string | null;
  metier_id: number | null;
  employe_id: string;
  valide_le: string | null;
  employe?: {
    prenom: string;
    nom: string;
    type_contrat: string | null;
    metier_principal: { libelle: string } | null;
    profile: { matricule_silae: string | null } | null;
  } | null;
  affaire?: { numero: string; nom: string; lieu: string | null; phase: string | null } | null;
  devis?: { numero: string } | null;
  metier?: { libelle: string } | null;
  assignation?: { metier: { libelle: string } | null } | null;
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

function resolveRange(search: SearchParams): { from: string; to: string } {
  if (search.preset !== "custom") return presetRange(search.preset);
  const def = presetRange("30j");
  return {
    from: search.from || def.from,
    to: search.to || def.to,
  };
}

function countActiveFilters(s: SearchParams): number {
  let n = 0;
  if (s.statut.length > 0) n++;
  if (s.saisi_par !== "all") n++;
  if (s.nuit) n++;
  if (s.heures_sup) n++;
  if (s.employe.length > 0) n++;
  if (s.chantier.length > 0) n++;
  if (s.devis.length > 0) n++;
  if (s.metier !== "all") n++;
  return n;
}

/** Identifiant anonyme stable pour un employé (matricule SILAE → fallback hash id). */
function anonId(r: Row): string {
  const matricule = r.employe?.profile?.matricule_silae?.trim();
  if (matricule) return `EMP-${matricule}`;
  return `EMP-${r.employe_id.slice(0, 6).toUpperCase()}`;
}

// ============================================================================
// Page
// ============================================================================

function HeuresAnalysePage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { isAdmin } = useAuth();

  const { from, to } = resolveRange(search);

  const [rows, setRows] = useState<Row[]>([]);
  const [metiers, setMetiers] = useState<{ id: number; libelle: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [silaeReport, setSilaeReport] = useState<SilaeValidationReport | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Bulk + export state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectMotif, setRejectMotif] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<"csv" | "xlsx" | "pdf" | "silae">("csv");
  const [anonymise, setAnonymise] = useState(false);

  function updateSearch(patch: Partial<SearchParams>) {
    void navigate({ search: (prev: SearchParams) => ({ ...prev, ...patch, page: patch.page ?? 1 }) });
  }

  function setPreset(p: PresetKey) {
    if (p === "custom") {
      updateSearch({ preset: "custom", from: from, to: to });
    } else {
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
        heures_sup: false,
        employe: [],
        chantier: [],
        devis: [],
        metier: "all",
        sort: "date",
        dir: "desc",
        page: 1,
      },
    });
  }

  function toggleStatut(s: Statut) {
    const has = search.statut.includes(s);
    updateSearch({
      statut: has ? search.statut.filter((x: Statut) => x !== s) : [...search.statut, s],
    });
  }

  function toggleSort(field: SortField) {
    if (search.sort === field) {
      void navigate({
        search: (prev: SearchParams) => ({ ...prev, dir: prev.dir === "asc" ? "desc" : "asc" }),
      });
    } else {
      void navigate({
        search: (prev: SearchParams) => ({ ...prev, sort: field, dir: "desc" }),
      });
    }
  }

  // Charger métiers une fois
  useEffect(() => {
    void supabase
      .from("metiers")
      .select("id, libelle")
      .order("ordre")
      .then(({ data }) => setMetiers(data ?? []));
  }, []);

  // Charger heures
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const { data, error } = await supabase
        .from("heures_saisies")
        .select(
          `id, date, heure_debut, heure_fin, heures_reelles, heures_nuit, statut, commentaire, motif_rejet, saisi_par_chef,
           affaire_id, devis_id, metier_id, employe_id, valide_le,
           employe:employes(prenom, nom, type_contrat,
             metier_principal:metiers!employes_metier_principal_id_fkey(libelle),
             profile:profiles(matricule_silae)),
           affaire:affaires!heures_saisies_affaire_id_fkey(numero, nom, lieu, phase),
           devis:devis(numero),
           metier:metiers(libelle),
           valideur:profiles!heures_saisies_valide_par_fkey(full_name, email)`,
        )
        .gte("date", from)
        .lte("date", to)
        .order("date", { ascending: false })
        .limit(5000);

      if (cancelled) return;
      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }
      setRows((data ?? []) as unknown as Row[]);
      setSelectedIds(new Set()); // reset sélection au refetch
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [from, to, refreshKey]);

  // Options multi-select dérivées des données chargées
  const employeOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string; hint?: string }>();
    rows.forEach((r) => {
      if (!r.employe || map.has(r.employe_id)) return;
      map.set(r.employe_id, {
        value: r.employe_id,
        label: `${r.employe.prenom} ${r.employe.nom}`,
        hint: r.employe.type_contrat ?? undefined,
      });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  const chantierOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string; hint?: string }>();
    rows.forEach((r) => {
      if (!r.affaire || map.has(r.affaire_id)) return;
      map.set(r.affaire_id, {
        value: r.affaire_id,
        label: r.affaire.nom,
        hint: r.affaire.numero,
      });
    });
    return Array.from(map.values()).sort((a, b) =>
      (a.hint ?? "").localeCompare(b.hint ?? ""),
    );
  }, [rows]);

  const devisOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string }>();
    rows.forEach((r) => {
      if (!r.devis_id || !r.devis?.numero || map.has(r.devis_id)) return;
      map.set(r.devis_id, { value: r.devis_id, label: r.devis.numero });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  const filtered = useMemo(() => {
    const list = rows.filter((r) => {
      if (search.statut.length > 0 && !search.statut.includes(r.statut)) return false;
      if (search.saisi_par === "employe" && r.saisi_par_chef) return false;
      if (search.saisi_par === "chef" && !r.saisi_par_chef) return false;
      if (search.nuit && (r.heures_nuit ?? 0) <= 0) return false;
      if (search.heures_sup && (r.heures_reelles ?? 0) <= SEUIL_HEURES_SUP) return false;
      if (search.metier !== "all" && String(r.metier_id ?? "") !== search.metier) return false;
      if (search.employe.length > 0 && !search.employe.includes(r.employe_id)) return false;
      if (search.chantier.length > 0 && !search.chantier.includes(r.affaire_id)) return false;
      if (search.devis.length > 0 && (!r.devis_id || !search.devis.includes(r.devis_id))) return false;
      return true;
    });

    const dirMul = search.dir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      let cmp = 0;
      switch (search.sort) {
        case "date":
          cmp = a.date.localeCompare(b.date);
          break;
        case "employe": {
          const an = a.employe ? `${a.employe.nom} ${a.employe.prenom}` : "";
          const bn = b.employe ? `${b.employe.nom} ${b.employe.prenom}` : "";
          cmp = an.localeCompare(bn);
          break;
        }
        case "chantier":
          cmp = (a.affaire?.numero ?? "").localeCompare(b.affaire?.numero ?? "");
          break;
        case "heures":
          cmp = (a.heures_reelles ?? 0) - (b.heures_reelles ?? 0);
          break;
        case "statut":
          cmp = a.statut.localeCompare(b.statut);
          break;
      }
      return cmp * dirMul;
    });
    return list;
  }, [rows, search]);

  const kpis = useMemo(() => {
    const total = filtered.reduce((acc, r) => acc + (r.heures_reelles ?? 0), 0);
    const validees = filtered
      .filter((r) => r.statut === "valide")
      .reduce((acc, r) => acc + (r.heures_reelles ?? 0), 0);
    const nuit = filtered.reduce((acc, r) => acc + (r.heures_nuit ?? 0), 0);
    const aValider = filtered.filter((r) => r.statut === "soumis").length;
    const cout = total * TARIF_HORAIRE_MOYEN;
    return {
      total,
      validees,
      pctValidees: total > 0 ? Math.round((validees / total) * 100) : 0,
      nuit,
      pctNuit: total > 0 ? Math.round((nuit / total) * 100) : 0,
      aValider,
      cout,
      lignes: filtered.length,
    };
  }, [filtered]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(search.page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const paginated = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  const activeCount = countActiveFilters(search);

  // Sélection bulk
  const allPageSelected = paginated.length > 0 && paginated.every((r) => selectedIds.has(r.id));
  function togglePageSelection() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) paginated.forEach((r) => next.delete(r.id));
      else paginated.forEach((r) => next.add(r.id));
      return next;
    });
  }
  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function clearSelection() {
    setSelectedIds(new Set());
  }

  const selectedRows = useMemo(
    () => filtered.filter((r) => selectedIds.has(r.id)),
    [filtered, selectedIds],
  );
  const selectableForValidate = selectedRows.filter((r) => r.statut === "soumis").length;
  const selectableForReject = selectedRows.filter((r) => r.statut === "soumis").length;

  async function bulkValidate() {
    const ids = selectedRows.filter((r) => r.statut === "soumis").map((r) => r.id);
    if (ids.length === 0) {
      toast.warning("Aucune saisie 'À valider' dans la sélection.");
      return;
    }
    setBulkBusy(true);
    const { error, count } = await supabase
      .from("heures_saisies")
      .update({ statut: "valide" }, { count: "exact" })
      .in("id", ids)
      .eq("statut", "soumis");
    setBulkBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${count ?? ids.length} saisie(s) validée(s)`);
    clearSelection();
    setRefreshKey((k) => k + 1);
  }

  async function bulkReject() {
    const ids = selectedRows.filter((r) => r.statut === "soumis").map((r) => r.id);
    if (ids.length === 0) {
      toast.warning("Aucune saisie 'À valider' dans la sélection.");
      return;
    }
    if (!rejectMotif.trim()) {
      toast.error("Motif de rejet obligatoire.");
      return;
    }
    setBulkBusy(true);
    const { error, count } = await supabase
      .from("heures_saisies")
      .update({ statut: "rejete", motif_rejet: rejectMotif.trim() }, { count: "exact" })
      .in("id", ids)
      .eq("statut", "soumis");
    setBulkBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${count ?? ids.length} saisie(s) rejetée(s)`);
    setRejectOpen(false);
    setRejectMotif("");
    clearSelection();
    setRefreshKey((k) => k + 1);
  }

  // ============================================================================
  // Exports (avec option anonymisation)
  // ============================================================================

  function rowEmployeName(r: Row, anon: boolean): string {
    if (anon) return anonId(r);
    return r.employe ? `${r.employe.prenom} ${r.employe.nom}` : "";
  }

  function exportCsv(anon: boolean) {
    const header = [
      "Date", "Employé", "Chantier", "Devis", "Métier", "Heures",
      "Dont nuit", "Heures sup", "Statut", "Saisi par chef", "Validée le",
      anon ? "Validateur (anonymisé)" : "Validateur", "Commentaire",
    ];
    const lines = filtered.map((r) =>
      [
        r.date,
        rowEmployeName(r, anon),
        r.affaire ? `${r.affaire.numero} - ${r.affaire.nom}` : "",
        r.devis?.numero ?? "",
        r.metier?.libelle ?? "",
        r.heures_reelles ?? 0,
        r.heures_nuit ?? 0,
        (r.heures_reelles ?? 0) > SEUIL_HEURES_SUP ? "oui" : "",
        STATUT_META[r.statut]?.label ?? r.statut,
        r.saisi_par_chef ? "oui" : "non",
        r.valide_le ? format(parseISO(r.valide_le), "yyyy-MM-dd HH:mm") : "",
        anon ? (r.valideur ? "VAL-***" : "") : (r.valideur?.full_name ?? r.valideur?.email ?? ""),
        anon ? "" : (r.commentaire ?? "").replace(/[\r\n]+/g, " "),
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(";"),
    );
    const csv = [header.join(";"), ...lines].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `heures-analyse-${from}_${to}${anon ? "-anonyme" : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportXlsx(anon: boolean) {
    const XLSX = await import("xlsx-js-style");
    const data = [
      ["Date", "Employé", "Chantier", "Devis", "Métier", "Heures", "Dont nuit", "Heures sup", "Statut", "Saisi par chef", "Validée le", anon ? "Validateur (anon.)" : "Validateur", "Commentaire"],
      ...filtered.map((r) => [
        r.date,
        rowEmployeName(r, anon),
        r.affaire ? `${r.affaire.numero} - ${r.affaire.nom}` : "",
        r.devis?.numero ?? "",
        r.metier?.libelle ?? "",
        r.heures_reelles ?? 0,
        r.heures_nuit ?? 0,
        (r.heures_reelles ?? 0) > SEUIL_HEURES_SUP ? "oui" : "",
        STATUT_META[r.statut]?.label ?? r.statut,
        r.saisi_par_chef ? "oui" : "non",
        r.valide_le ? format(parseISO(r.valide_le), "yyyy-MM-dd HH:mm") : "",
        anon ? (r.valideur ? "VAL-***" : "") : (r.valideur?.full_name ?? r.valideur?.email ?? ""),
        anon ? "" : (r.commentaire ?? ""),
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws["!cols"] = [
      { wch: 11 }, { wch: 22 }, { wch: 28 }, { wch: 10 }, { wch: 14 },
      { wch: 8 }, { wch: 9 }, { wch: 10 }, { wch: 11 }, { wch: 14 }, { wch: 16 },
      { wch: 22 }, { wch: 30 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Heures");
    XLSX.writeFile(wb, `heures-analyse-${from}_${to}${anon ? "-anonyme" : ""}.xlsx`);
  }

  async function exportPdf(anon: boolean) {
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(`Centre d'analyse heures${anon ? " (anonymisé)" : ""}`, 40, 40);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(110);
    const filterParts: string[] = [`Période : ${from} → ${to}`];
    if (search.statut.length) filterParts.push(`Statut : ${search.statut.map((s: Statut) => STATUT_META[s].label).join(", ")}`);
    if (search.saisi_par !== "all") filterParts.push(`Saisi par : ${search.saisi_par}`);
    if (search.nuit) filterParts.push("Nuit uniquement");
    if (search.heures_sup) filterParts.push(`Heures sup (>${SEUIL_HEURES_SUP}h)`);
    if (search.metier !== "all") filterParts.push(`Métier : ${metiers.find((m) => String(m.id) === search.metier)?.libelle ?? search.metier}`);
    if (search.employe.length) filterParts.push(`Employé : ${search.employe.length} sélectionné(s)`);
    if (search.chantier.length) filterParts.push(`Chantier : ${search.chantier.length} sélectionné(s)`);
    if (search.devis.length) filterParts.push(`Devis : ${search.devis.length} sélectionné(s)`);
    doc.text(filterParts.join("  ·  "), 40, 56, { maxWidth: pageWidth - 80 });
    doc.text(
      `Total : ${kpis.total.toFixed(1)} h  ·  Validées : ${kpis.validees.toFixed(1)} h (${kpis.pctValidees}%)  ·  Nuit : ${kpis.nuit.toFixed(1)} h  ·  À valider : ${kpis.aValider}  ·  Coût estimé : ${formatEuro(kpis.cout)}  ·  ${kpis.lignes} ligne(s)`,
      40,
      70,
    );
    doc.setTextColor(0);

    autoTable(doc, {
      startY: 84,
      head: [["Date", "Employé", "Chantier", "Devis", "Métier", "H", "Nuit", "Sup", "Statut", "Saisie", "Validée le", anon ? "Validateur (anon.)" : "Validateur"]],
      body: filtered.map((r) => [
        r.date,
        rowEmployeName(r, anon),
        r.affaire ? `${r.affaire.numero} — ${r.affaire.nom}` : "",
        r.devis?.numero ?? "",
        r.metier?.libelle ?? "",
        (r.heures_reelles ?? 0).toFixed(1),
        (r.heures_nuit ?? 0) > 0 ? (r.heures_nuit ?? 0).toFixed(1) : "—",
        (r.heures_reelles ?? 0) > SEUIL_HEURES_SUP ? "✓" : "",
        STATUT_META[r.statut]?.label ?? r.statut,
        r.saisi_par_chef ? "Chef" : "Employé",
        r.valide_le ? format(parseISO(r.valide_le), "dd/MM/yy HH:mm") : "",
        anon ? (r.valideur ? "VAL-***" : "") : (r.valideur?.full_name ?? r.valideur?.email ?? ""),
      ]),
      styles: { fontSize: 7, cellPadding: 3, overflow: "linebreak" },
      headStyles: { fillColor: [37, 37, 37], textColor: 255, fontSize: 7.5 },
      alternateRowStyles: { fillColor: [248, 248, 250] },
      margin: { left: 30, right: 30 },
      didDrawPage: (data) => {
        const pageHeight = doc.internal.pageSize.getHeight();
        doc.setFontSize(8);
        doc.setTextColor(120);
        doc.text(
          `Page ${data.pageNumber}  ·  Généré le ${format(new Date(), "dd/MM/yyyy HH:mm")}${anon ? "  ·  RGPD anonymisé" : ""}`,
          pageWidth / 2,
          pageHeight - 14,
          { align: "center" },
        );
        doc.setTextColor(0);
      },
    });

    doc.save(`heures-analyse-${from}_${to}${anon ? "-anonyme" : ""}.pdf`);
  }

  function buildSilaeRows() {
    return filtered.map((r) => ({
      id: r.id,
      date: r.date,
      heure_debut: r.heure_debut,
      heure_fin: r.heure_fin,
      heures_reelles: r.heures_reelles,
      heures_nuit: r.heures_nuit,
      commentaire: r.commentaire,
      statut: r.statut,
      valide_le: r.valide_le,
      motif_rejet: r.motif_rejet,
      employe: r.employe
        ? {
            prenom: r.employe.prenom,
            nom: r.employe.nom,
            type_contrat: r.employe.type_contrat ?? null,
            metier_principal: r.employe.metier_principal ?? null,
            profile: r.employe.profile ?? null,
          }
        : null,
      affaire: r.affaire
        ? {
            numero: r.affaire.numero,
            nom: r.affaire.nom,
            lieu: r.affaire.lieu ?? null,
            phase: r.affaire.phase ?? null,
          }
        : null,
      assignation: r.assignation ?? null,
      valideur: r.valideur ?? null,
      devis_id: r.devis_id,
    }));
  }

  async function performSilaeExport() {
    const { exportHeuresSilae } = await import("@/lib/heures-export");
    try {
      const res = await exportHeuresSilae(buildSilaeRows(), {
        weekStart: parseISO(from),
        weekEnd: parseISO(to),
      });
      toast.success(`Export SILAE généré (${res.count} lignes)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec export SILAE");
    }
  }

  async function exportSilae() {
    const { validateHeuresForSilae } = await import("@/lib/heures-export");
    const report = validateHeuresForSilae(buildSilaeRows());
    if (report.errors.length > 0 || report.warnings.length > 0) {
      setSilaeReport(report);
      return;
    }
    await performSilaeExport();
  }

  async function runExport() {
    setExportOpen(false);
    if (exportFormat === "csv") exportCsv(anonymise);
    else if (exportFormat === "xlsx") await exportXlsx(anonymise);
    else if (exportFormat === "pdf") await exportPdf(anonymise);
    else if (exportFormat === "silae") await exportSilae();
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
    <RoleGuard required="admin">
      <div className="space-y-4 pb-24">
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
              <Button variant="outline" disabled={!filtered.length} onClick={() => setExportOpen(true)}>
                <Download className="mr-1.5 h-4 w-4" /> Exporter
              </Button>
            </div>
          }
        />

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
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
          <KpiCard
            label="Coût estimé"
            value={formatEuro(kpis.cout)}
            subline={`${TARIF_HORAIRE_MOYEN} €/h moyen`}
            tone="default"
            icon={<TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />}
          />
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
                <Label className="text-xs">Employé(s)</Label>
                <MultiSelectCombo
                  options={employeOptions}
                  selected={search.employe}
                  onChange={(v) => updateSearch({ employe: v })}
                  placeholder="Tous les employés"
                  searchPlaceholder="Rechercher un employé…"
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Chantier(s)</Label>
                <MultiSelectCombo
                  options={chantierOptions}
                  selected={search.chantier}
                  onChange={(v) => updateSearch({ chantier: v })}
                  placeholder="Tous les chantiers"
                  searchPlaceholder="Rechercher (numéro / nom)…"
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Devis</Label>
                <MultiSelectCombo
                  options={devisOptions}
                  selected={search.devis}
                  onChange={(v) => updateSearch({ devis: v })}
                  placeholder="Tous les devis"
                  searchPlaceholder="Rechercher un devis…"
                />
              </div>
            </div>

            {/* Statut + nuit + heures sup */}
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
              <div className="flex items-center gap-2 pt-5">
                <Switch
                  id="heures-sup"
                  checked={search.heures_sup}
                  onCheckedChange={(v) => updateSearch({ heures_sup: v })}
                />
                <Label htmlFor="heures-sup" className="cursor-pointer text-sm flex items-center gap-1">
                  <TrendingUp className="h-3.5 w-3.5" /> Heures sup (&gt;{SEUIL_HEURES_SUP}h)
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
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allPageSelected}
                          onCheckedChange={togglePageSelection}
                          aria-label="Tout sélectionner"
                        />
                      </TableHead>
                      <SortHeader field="date" current={search.sort} dir={search.dir} onSort={toggleSort} className="w-24">
                        Date
                      </SortHeader>
                      <SortHeader field="employe" current={search.sort} dir={search.dir} onSort={toggleSort}>
                        Employé
                      </SortHeader>
                      <SortHeader field="chantier" current={search.sort} dir={search.dir} onSort={toggleSort}>
                        Chantier
                      </SortHeader>
                      <TableHead>Devis</TableHead>
                      <TableHead>Métier</TableHead>
                      <SortHeader field="heures" current={search.sort} dir={search.dir} onSort={toggleSort} className="text-right">
                        Heures
                      </SortHeader>
                      <SortHeader field="statut" current={search.sort} dir={search.dir} onSort={toggleSort}>
                        Statut
                      </SortHeader>
                      <TableHead>Saisi par</TableHead>
                      <TableHead>Validée</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginated.map((r) => {
                      const meta = STATUT_META[r.statut];
                      const isSup = (r.heures_reelles ?? 0) > SEUIL_HEURES_SUP;
                      const checked = selectedIds.has(r.id);
                      return (
                        <TableRow key={r.id} data-state={checked ? "selected" : undefined}>
                          <TableCell>
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => toggleRow(r.id)}
                              aria-label={`Sélectionner ${r.date}`}
                            />
                          </TableCell>
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
                            <div className="flex items-center justify-end gap-1.5">
                              <span className="font-semibold">{(r.heures_reelles ?? 0).toFixed(1)}h</span>
                              {isSup && (
                                <Badge variant="outline" className="bg-amber-500/15 text-amber-600 border-amber-500/30 px-1 py-0 text-[10px]">
                                  Sup
                                </Badge>
                              )}
                            </div>
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
                {/* Pagination */}
                <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
                  <div>
                    {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filtered.length)} sur {filtered.length}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={currentPage <= 1}
                      onClick={() => updateSearch({ page: currentPage - 1 })}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <span className="font-mono">
                      {currentPage} / {totalPages}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={currentPage >= totalPages}
                      onClick={() => updateSearch({ page: currentPage + 1 })}
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Barre d'actions bulk flottante */}
        {selectedIds.size > 0 && (
          <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-lg border bg-background/95 p-2 pl-3 shadow-lg backdrop-blur">
            <Badge variant="secondary" className="font-mono">
              {selectedIds.size} sélectionné{selectedIds.size > 1 ? "s" : ""}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {selectableForValidate} à valider
            </span>
            <div className="mx-1 h-5 w-px bg-border" />
            <Button
              size="sm"
              onClick={bulkValidate}
              disabled={bulkBusy || selectableForValidate === 0}
            >
              <Check className="mr-1 h-3.5 w-3.5" /> Valider
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setRejectOpen(true)}
              disabled={bulkBusy || selectableForReject === 0}
            >
              <X className="mr-1 h-3.5 w-3.5" /> Rejeter
            </Button>
            <Button size="sm" variant="ghost" onClick={clearSelection}>
              Annuler
            </Button>
          </div>
        )}

        {/* Dialog rejet bulk */}
        <Dialog open={rejectOpen} onOpenChange={(o) => { if (!o) { setRejectOpen(false); setRejectMotif(""); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rejeter {selectableForReject} saisie(s)</DialogTitle>
              <DialogDescription>
                Le motif sera envoyé à l'employé. Seules les saisies "À valider" seront rejetées.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="motif-bulk">Motif de rejet (obligatoire)</Label>
              <Textarea
                id="motif-bulk"
                value={rejectMotif}
                onChange={(e) => setRejectMotif(e.target.value)}
                placeholder="Ex : heures incorrectes, à reprendre…"
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setRejectOpen(false); setRejectMotif(""); }}>
                Annuler
              </Button>
              <Button variant="destructive" onClick={bulkReject} disabled={bulkBusy || !rejectMotif.trim()}>
                Confirmer le rejet
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog export */}
        <Dialog open={exportOpen} onOpenChange={setExportOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Exporter les heures</DialogTitle>
              <DialogDescription>
                {filtered.length} ligne(s) seront exportées avec les filtres actifs.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid gap-1">
                <Label className="text-xs">Format</Label>
                <Select value={exportFormat} onValueChange={(v) => setExportFormat(v as typeof exportFormat)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="csv">CSV (UTF-8 ; séparateur ;)</SelectItem>
                    <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
                    <SelectItem value="pdf">PDF (A4 paysage)</SelectItem>
                    <SelectItem value="silae">Format SILAE (paie)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {isAdmin && exportFormat !== "silae" && (
                <div className="rounded-md border bg-muted/30 p-3">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <Checkbox
                      checked={anonymise}
                      onCheckedChange={(v) => setAnonymise(v === true)}
                      className="mt-0.5"
                    />
                    <div className="space-y-0.5">
                      <div className="text-sm font-medium flex items-center gap-1">
                        <ShieldAlert className="h-3.5 w-3.5 text-indigo-600" />
                        Anonymiser les noms (RGPD)
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Remplace les noms par un identifiant stable (matricule SILAE ou EMP-XXXXXX). Commentaires retirés.
                      </div>
                    </div>
                  </label>
                </div>
              )}
              {exportFormat === "silae" && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700">
                  L'export SILAE conserve les noms (requis pour la paie) et n'accepte pas l'anonymisation.
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setExportOpen(false)}>Annuler</Button>
              <Button onClick={runExport}>
                <Download className="mr-1.5 h-4 w-4" /> Exporter
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <SilaeValidationDialog
          report={silaeReport}
          rows={filtered}
          onCancel={() => setSilaeReport(null)}
          onConfirm={async () => {
            setSilaeReport(null);
            await performSilaeExport();
          }}
        />
      </div>
    </RoleGuard>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function SortHeader({
  field,
  current,
  dir,
  onSort,
  children,
  className,
}: {
  field: SortField;
  current: SortField;
  dir: "asc" | "desc";
  onSort: (f: SortField) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const active = current === field;
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className="inline-flex items-center gap-1 hover:text-foreground"
      >
        {children}
        <Icon className={`h-3 w-3 ${active ? "text-foreground" : "text-muted-foreground/50"}`} />
      </button>
    </TableHead>
  );
}

function formatEuro(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

function SilaeValidationDialog({
  report,
  rows,
  onCancel,
  onConfirm,
}: {
  report: SilaeValidationReport | null;
  rows: Row[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!report) return null;
  const hasErrors = report.errors.length > 0;
  const merged = [...report.errors.map((e) => ({ ...e, severity: "error" as const })),
                  ...report.warnings.map((e) => ({ ...e, severity: "warning" as const }))];

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {hasErrors ? "Validation SILAE — erreurs détectées" : "Validation SILAE — avertissements"}
          </DialogTitle>
          <DialogDescription>
            {report.totalRows} ligne(s) à exporter ·{" "}
            <span className="text-destructive font-semibold">{report.errorRows} en erreur</span>
            {" · "}
            <span className="text-amber-600 font-semibold">{report.warningRows} avec avertissement</span>
          </DialogDescription>
        </DialogHeader>

        {hasErrors && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            Des champs requis sont manquants ou invalides. L'export est bloqué tant que ces lignes ne sont pas corrigées.
          </div>
        )}
        {!hasErrors && report.warnings.length > 0 && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700">
            Les avertissements n'empêchent pas l'export — vérifiez avant transmission RH.
          </div>
        )}

        <div className="max-h-[50vh] overflow-y-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">Ligne</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Employé</TableHead>
                <TableHead>Chantier</TableHead>
                <TableHead>Sévérité</TableHead>
                <TableHead>Champ</TableHead>
                <TableHead>Erreur</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {merged.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                    Aucune erreur.
                  </TableCell>
                </TableRow>
              )}
              {merged.map((e, idx) => {
                const r = rows[e.rowIndex];
                return (
                  <TableRow key={`${e.rowIndex}-${e.code}-${idx}`}>
                    <TableCell className="font-mono text-xs">#{e.rowIndex + 1}</TableCell>
                    <TableCell className="text-xs">{e.context.date || (r?.date ?? "—")}</TableCell>
                    <TableCell className="text-xs">{e.context.employe}</TableCell>
                    <TableCell className="text-xs">{e.context.affaire}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          e.severity === "error"
                            ? "border-destructive/40 bg-destructive/15 text-destructive"
                            : "border-amber-500/40 bg-amber-500/15 text-amber-700"
                        }
                      >
                        {e.severity === "error" ? "Erreur" : "Warning"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{e.field}</TableCell>
                    <TableCell className="text-xs">{e.message}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {hasErrors ? "Fermer" : "Annuler"}
          </Button>
          {!hasErrors && (
            <Button onClick={onConfirm}>
              Exporter quand même ({report.totalRows} lignes)
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KpiCard({
  label,
  value,
  subline,
  tone = "default",
  icon,
}: {
  label: string;
  value: string;
  subline?: string;
  tone?: "default" | "success" | "warning" | "info";
  icon?: React.ReactNode;
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
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{label}</span>
          {icon}
        </div>
        <div className={`mt-1 text-2xl font-bold ${toneCls}`}>{value}</div>
        {subline && <div className="mt-0.5 text-xs text-muted-foreground">{subline}</div>}
      </CardContent>
    </Card>
  );
}
