/**
 * v0.42.2 — Saisie en lot du poste_principal (action one-shot RH).
 *
 * Liste filtrée de tous les employés actifs avec poste_principal NULL ou vide.
 * - Auto-save sur blur (debounce ~400ms)
 * - Bouton "Sauvegarder tout" pour les modifs encore non commitées
 * - Suggestion intelligente basée sur les 3 derniers chantiers / métier principal
 * - Compteur live "X / Y fiches à compléter"
 * - Filtres : statut contrat, recherche nom, chantier récent
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef } from "react";
import { ArrowLeft, Loader2, Save, Search, Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { POSTES_SUGGESTIONS } from "@/lib/postes-suggestions";
import { useMetiers } from "@/hooks/use-metiers";
import { fuzzyMatch } from "@/lib/string-normalize";
import { fetchEmployesForExport, exportEmployesXlsx } from "@/lib/employes-excel";
import { EmployesImportPostesDialog } from "@/components/employes/EmployesImportPostesDialog";

export const Route = createFileRoute("/_app/admin/employes-poste-principal")({
  component: () => (
    <RoleGuard required="admin">
      <EmployesPostePrincipalPage />
    </RoleGuard>
  ),
});

interface EmpRow {
  id: string;
  nom: string;
  prenom: string;
  email: string | null;
  statut_contrat: string | null;
  poste_principal: string | null;
  metier_principal_id: number | null;
  recent_chantiers: { numero: string; nom: string }[];
}

const STATUTS = ["CDI", "CDDU intermittent", "CDD chantier", "Intérim", "Apprenti"] as const;

/** Heuristique métier → poste suggéré. */
function suggestPosteFromMetierLibelle(libelle: string | null): string | null {
  if (!libelle) return null;
  const m = libelle.toLowerCase();
  if (m.includes("machin")) return "Machiniste";
  if (m.includes("constr")) return "Constructeur";
  if (m.includes("peint")) return "Peintre décorateur";
  if (m.includes("tapiss")) return "Tapissier";
  if (m.includes("métall") || m.includes("metall")) return "Serrurier";
  if (m.includes("logist") || m.includes("manut")) return "Chauffeur";
  if (m.includes("numéri") || m.includes("numeri")) return "Dessinateur";
  return null;
}

function EmployesPostePrincipalPage() {
  const { byId } = useMetiers();
  const [rows, setRows] = useState<EmpRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statutFilter, setStatutFilter] = useState<Set<string>>(new Set());
  const [chantierFilter, setChantierFilter] = useState("");
  const [drafts, setDrafts] = useState<Map<string, string>>(new Map());
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [bulkSaving, setBulkSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const debounceRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const fetchAll = async () => {
    setLoading(true);
    const { data: emps, error } = await supabase
      .from("employes")
      .select("id, nom, prenom, email, statut_contrat, poste_principal, metier_principal_id")
      .eq("actif", true)
      .or("poste_principal.is.null,poste_principal.eq.")
      .order("nom", { ascending: true })
      .limit(2000);
    if (error) {
      toast.error("Chargement impossible", { description: error.message });
      setLoading(false);
      return;
    }
    const ids = (emps ?? []).map((e) => e.id);
    let recentMap: Record<string, EmpRow["recent_chantiers"]> = {};
    if (ids.length) {
      const { data: assigns } = await supabase
        .from("assignations")
        .select("employe_id, date, affaires:affaire_id(numero, nom)")
        .in("employe_id", ids)
        .order("date", { ascending: false })
        .limit(5000);
      for (const a of (assigns ?? []) as Array<{ employe_id: string; affaires: { numero: string; nom: string } | null }>) {
        const arr = (recentMap[a.employe_id] ??= []);
        if (arr.length >= 3) continue;
        if (!a.affaires) continue;
        if (arr.some((x) => x.numero === a.affaires!.numero)) continue;
        arr.push(a.affaires);
      }
    }
    setRows((emps ?? []).map((e) => ({ ...e, recent_chantiers: recentMap[e.id] ?? [] }) as EmpRow));
    setLoading(false);
  };

  useEffect(() => { void fetchAll(); }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (statutFilter.size > 0 && !statutFilter.has(r.statut_contrat ?? "")) return false;
      if (search.trim() && !fuzzyMatch(`${r.nom} ${r.prenom} ${r.email ?? ""}`, search)) return false;
      if (chantierFilter.trim()) {
        const has = r.recent_chantiers.some((c) =>
          fuzzyMatch(`${c.numero} ${c.nom}`, chantierFilter),
        );
        if (!has) return false;
      }
      return true;
    });
  }, [rows, statutFilter, search, chantierFilter]);

  const totalToFill = rows.length;
  const remaining = filtered.filter((r) => !(drafts.get(r.id) ?? r.poste_principal ?? "").trim()).length;
  const dirtyCount = useMemo(() => {
    let n = 0;
    for (const [id, val] of drafts) {
      const row = rows.find((r) => r.id === id);
      if (!row) continue;
      if ((val ?? "").trim() !== (row.poste_principal ?? "").trim()) n++;
    }
    return n;
  }, [drafts, rows]);

  const persistOne = async (id: string, value: string) => {
    setSavingIds((s) => new Set(s).add(id));
    const { error } = await supabase
      .from("employes")
      .update({ poste_principal: value.trim() || null })
      .eq("id", id);
    setSavingIds((s) => { const n = new Set(s); n.delete(id); return n; });
    if (error) {
      toast.error("Sauvegarde impossible", { description: error.message });
      return;
    }
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, poste_principal: value.trim() || null } : r)));
  };

  const handleChange = (id: string, value: string) => {
    setDrafts((d) => { const n = new Map(d); n.set(id, value); return n; });
    // Debounce autosave
    const existing = debounceRef.current.get(id);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      void persistOne(id, value);
      debounceRef.current.delete(id);
    }, 800);
    debounceRef.current.set(id, t);
  };

  const handleBlur = (id: string, value: string) => {
    const existing = debounceRef.current.get(id);
    if (existing) { clearTimeout(existing); debounceRef.current.delete(id); }
    void persistOne(id, value);
  };

  const handleBulkSave = async () => {
    setBulkSaving(true);
    const entries = Array.from(drafts.entries()).filter(([id, val]) => {
      const row = rows.find((r) => r.id === id);
      return row && (val ?? "").trim() !== (row.poste_principal ?? "").trim();
    });
    let ok = 0, ko = 0;
    for (const [id, val] of entries) {
      const { error } = await supabase
        .from("employes")
        .update({ poste_principal: val.trim() || null })
        .eq("id", id);
      if (error) ko++; else ok++;
    }
    setBulkSaving(false);
    if (ko > 0) toast.warning(`${ok} sauvegardé(s), ${ko} échec(s)`);
    else toast.success(`${ok} poste(s) sauvegardé(s)`);
    void fetchAll();
  };

  const handleExport = async () => {
    try {
      const data = await fetchEmployesForExport();
      await exportEmployesXlsx(data);
      toast.success(`${data.length} employés exportés`);
    } catch (e) {
      toast.error("Export impossible", { description: (e as Error).message });
    }
  };

  const toggleStatut = (s: string) => {
    setStatutFilter((cur) => {
      const n = new Set(cur);
      if (n.has(s)) n.delete(s); else n.add(s);
      return n;
    });
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Postes principaux"
        description="Saisie en lot pour les fiches employés sans poste défini"
        actions={
          <div className="flex gap-2">
            <Button asChild variant="ghost">
              <Link to="/employes"><ArrowLeft className="mr-1 h-4 w-4" />Retour Employés</Link>
            </Button>
            <Button variant="outline" onClick={handleExport}><Download className="mr-1 h-4 w-4" />Exporter Excel</Button>
            <Button variant="outline" onClick={() => setImportOpen(true)}><Upload className="mr-1 h-4 w-4" />Importer postes</Button>
          </div>
        }
      />

      {/* Compteur sticky */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
          <div>
            <div className="text-sm text-muted-foreground">Restant à compléter</div>
            <div className="text-3xl font-bold tabular-nums">{remaining} <span className="text-base font-normal text-muted-foreground">/ {totalToFill} fiches</span></div>
          </div>
          {dirtyCount > 0 && (
            <Button onClick={handleBulkSave} disabled={bulkSaving}>
              {bulkSaving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
              Sauvegarder tous ({dirtyCount})
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher (nom, email)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Input
          placeholder="Filtrer par chantier récent…"
          value={chantierFilter}
          onChange={(e) => setChantierFilter(e.target.value)}
          className="max-w-xs"
        />
        <div className="flex flex-wrap gap-1">
          {STATUTS.map((s) => (
            <Badge
              key={s}
              variant={statutFilter.has(s) ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => toggleStatut(s)}
            >
              {s}
            </Badge>
          ))}
        </div>
      </div>

      {/* Datalist global */}
      <datalist id="postes-principaux-suggestions">
        {POSTES_SUGGESTIONS.map((p) => <option key={p} value={p} />)}
      </datalist>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          {totalToFill === 0 ? "🎉 Toutes les fiches ont un poste principal renseigné !" : "Aucun employé ne correspond aux filtres."}
        </CardContent></Card>
      ) : (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Prénom</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>3 derniers chantiers</TableHead>
              <TableHead className="w-[260px]">Poste principal</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const draft = drafts.get(r.id) ?? r.poste_principal ?? "";
                const metier = byId(r.metier_principal_id ?? undefined);
                const placeholder = suggestPosteFromMetierLibelle(metier?.libelle ?? null) ?? "Saisir le poste…";
                const saving = savingIds.has(r.id);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.nom.toUpperCase()}</TableCell>
                    <TableCell>{r.prenom}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.email ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{r.statut_contrat ?? "—"}</Badge></TableCell>
                    <TableCell className="text-xs">
                      {r.recent_chantiers.length === 0 ? <span className="text-muted-foreground">—</span> : (
                        <div className="space-y-0.5">
                          {r.recent_chantiers.map((c, i) => (
                            <div key={i} className="font-mono">{c.numero} <span className="font-sans text-muted-foreground">— {c.nom.slice(0, 30)}{c.nom.length > 30 ? "…" : ""}</span></div>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Input
                          list="postes-principaux-suggestions"
                          value={draft}
                          placeholder={placeholder}
                          onChange={(e) => handleChange(r.id, e.target.value)}
                          onBlur={(e) => handleBlur(r.id, e.target.value)}
                          className="h-8"
                        />
                        {saving && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}

      <EmployesImportPostesDialog open={importOpen} onOpenChange={setImportOpen} onApplied={fetchAll} />
    </div>
  );
}
