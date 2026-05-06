/**
 * v0.22 — Centre d'analyse heures consolidé (admin + chef)
 *
 * Tableau complet des `heures_saisies` avec filtres combinables,
 * KPIs et exports CSV / Excel. Spec : mem://features/centre-analyse-heures.
 *
 * Filtres :
 *  - Période (presets + custom)
 *  - Chantier (multi via recherche)
 *  - Employé (recherche fuzzy nom/prénom)
 *  - Devis
 *  - Métier
 *  - Statut (multi)
 *  - Heures de nuit (toggle)
 *  - Saisi par (employé / chef / tous)
 *
 * Filtrage RLS côté DB (heures_saisies_self_select) garantit que le chef
 * ne voit que les heures de son périmètre. Pas de logique de RBAC
 * supplémentaire ici, RoleGuard `chef_or_admin` suffit pour l'UI.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format, parseISO, startOfMonth, startOfWeek, subDays, subMonths } from "date-fns";
import { fr } from "date-fns/locale";
import { Download, Filter, Loader2, Moon } from "lucide-react";
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

export const Route = createFileRoute("/_app/heures-analyse")({
  component: HeuresAnalysePage,
});

type Statut = "brouillon" | "soumis" | "valide" | "rejete";

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
  // joined
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

type PresetKey = "7j" | "30j" | "semaine" | "mois" | "mois_precedent" | "custom";

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

function HeuresAnalysePage() {
  const [preset, setPreset] = useState<PresetKey>("30j");
  const initial = presetRange("30j");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [statutFilter, setStatutFilter] = useState<"all" | Statut>("all");
  const [saisiParFilter, setSaisiParFilter] = useState<"all" | "employe" | "chef">("all");
  const [nuitOnly, setNuitOnly] = useState(false);
  const [employeQuery, setEmployeQuery] = useState("");
  const [chantierQuery, setChantierQuery] = useState("");
  const [devisQuery, setDevisQuery] = useState("");
  const [metierFilter, setMetierFilter] = useState<string>("all");

  const [rows, setRows] = useState<Row[]>([]);
  const [metiers, setMetiers] = useState<{ id: number; libelle: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // Charger métiers une fois
  useEffect(() => {
    void supabase
      .from("metiers")
      .select("id, libelle")
      .order("ordre")
      .then(({ data }) => setMetiers(data ?? []));
  }, []);

  // Quand on change preset, mettre à jour from/to (sauf custom)
  useEffect(() => {
    if (preset === "custom") return;
    const r = presetRange(preset);
    setFrom(r.from);
    setTo(r.to);
  }, [preset]);

  // Charger données
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
      if (statutFilter !== "all" && r.statut !== statutFilter) return false;
      if (saisiParFilter === "employe" && r.saisi_par_chef) return false;
      if (saisiParFilter === "chef" && !r.saisi_par_chef) return false;
      if (nuitOnly && (r.heures_nuit ?? 0) <= 0) return false;
      if (metierFilter !== "all" && String(r.metier_id ?? "") !== metierFilter) return false;
      if (employeQuery.trim()) {
        const q = employeQuery.toLowerCase();
        const name = r.employe ? `${r.employe.prenom} ${r.employe.nom}`.toLowerCase() : "";
        if (!name.includes(q)) return false;
      }
      if (chantierQuery.trim()) {
        const q = chantierQuery.toLowerCase();
        const aff = r.affaire ? `${r.affaire.numero} ${r.affaire.nom}`.toLowerCase() : "";
        if (!aff.includes(q)) return false;
      }
      if (devisQuery.trim()) {
        const q = devisQuery.toLowerCase();
        const dv = r.devis?.numero?.toLowerCase() ?? "";
        if (!dv.includes(q)) return false;
      }
      return true;
    });
  }, [rows, statutFilter, saisiParFilter, nuitOnly, metierFilter, employeQuery, chantierQuery, devisQuery]);

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

  return (
    <RoleGuard required="chef_or_admin">
      <div className="space-y-4">
        <PageHeader
          number="03"
          eyebrow="Heures / Reporting"
          title="Centre d'analyse heures"
          description="Toutes les heures saisies, à valider et validées avec filtres et exports."
          actions={
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
          }
        />

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

        <Card>
          <CardContent className="grid gap-3 pt-4 md:grid-cols-3 lg:grid-cols-4">
            <div className="grid gap-1">
              <Label className="text-xs">Période</Label>
              <Select value={preset} onValueChange={(v) => setPreset(v as PresetKey)}>
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
                onChange={(e) => {
                  setPreset("custom");
                  setFrom(e.target.value);
                }}
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Au</Label>
              <Input
                type="date"
                value={to}
                onChange={(e) => {
                  setPreset("custom");
                  setTo(e.target.value);
                }}
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Statut</Label>
              <Select value={statutFilter} onValueChange={(v) => setStatutFilter(v as typeof statutFilter)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  <SelectItem value="brouillon">Brouillon</SelectItem>
                  <SelectItem value="soumis">À valider</SelectItem>
                  <SelectItem value="valide">Validée</SelectItem>
                  <SelectItem value="rejete">Rejetée</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Métier</Label>
              <Select value={metierFilter} onValueChange={setMetierFilter}>
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
              <Select value={saisiParFilter} onValueChange={(v) => setSaisiParFilter(v as typeof saisiParFilter)}>
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
                  value={employeQuery}
                  onChange={(e) => setEmployeQuery(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Chantier</Label>
              <Input
                placeholder="Numéro ou nom"
                value={chantierQuery}
                onChange={(e) => setChantierQuery(e.target.value)}
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Devis</Label>
              <Input
                placeholder="D-XXXXXX-YYYY"
                value={devisQuery}
                onChange={(e) => setDevisQuery(e.target.value)}
              />
            </div>
            <div className="flex items-end gap-2 pb-1">
              <Switch id="nuit" checked={nuitOnly} onCheckedChange={setNuitOnly} />
              <Label htmlFor="nuit" className="cursor-pointer text-sm">
                Nuit uniquement
              </Label>
            </div>
          </CardContent>
        </Card>

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
