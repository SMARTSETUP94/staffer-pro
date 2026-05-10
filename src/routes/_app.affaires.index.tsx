import { createFileRoute, Link, useNavigate, stripSearchParams } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Loader2, ArrowRight, Pencil, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TypologieBadge } from "@/components/typologie/TypologieBadge";
import { TypologieMultiFilter } from "@/components/typologie/TypologieMultiFilter";
import { ScopedAccessBanner } from "@/components/auth/ScopedAccessBanner";
import { useChefScope } from "@/hooks/use-chef-scope";
import { useMesAffairesChefIds } from "@/hooks/use-mes-affaires-chef";
import { Switch } from "@/components/ui/switch";
import { type AffaireTypologie, AFFAIRE_TYPOLOGIES, getAffaireTypologie } from "@/lib/affaire-typologie";
import { toast } from "sonner";

type AffaireStatut = "prospect" | "en_cours" | "termine" | "annule";

interface AffaireRow {
  id: string;
  numero: string;
  nom: string;
  client: string | null;
  lieu: string | null;
  statut: AffaireStatut;
  date_debut: string | null;
  date_fin_prevue: string | null;
  typologie: AffaireTypologie | null;
}

interface FormState {
  id?: string;
  numero: string;
  nom: string;
  client: string;
  lieu: string;
  statut: AffaireStatut;
  date_debut: string;
  date_fin_prevue: string;
  notes: string;
}

const emptyForm: FormState = {
  numero: "",
  nom: "",
  client: "",
  lieu: "",
  statut: "en_cours",
  date_debut: "",
  date_fin_prevue: "",
  notes: "",
};

const STATUTS: { value: AffaireStatut; label: string }[] = [
  { value: "prospect", label: "Prospect" },
  { value: "en_cours", label: "En cours" },
  { value: "termine", label: "Terminée" },
  { value: "annule", label: "Annulée" },
];

const SEARCH_DEFAULTS = { typo: [] as AffaireTypologie[] };

const searchSchema = z.object({
  typo: fallback(z.array(z.enum(AFFAIRE_TYPOLOGIES as [AffaireTypologie, ...AffaireTypologie[]])), []).default([]),
});

export const Route = createFileRoute("/_app/affaires/")({
  head: () => ({ meta: [{ title: "Affaires — Setup Paris" }] }),
  validateSearch: zodValidator(searchSchema),
  search: { middlewares: [stripSearchParams(SEARCH_DEFAULTS)] },
  component: AffairesPage,
});

function AffairesPage() {
  const { isAdminOrChef } = useAuth();
  const navigate = useNavigate({ from: "/affaires/" });
  const { typo: typoFilter } = Route.useSearch();
  const { isScoped } = useChefScope();
  const { ids: mesAffairesIds, isLoading: mesAffairesLoading } = useMesAffairesChefIds();
  const [onlyMine, setOnlyMine] = useState(isScoped);
  useEffect(() => { if (isScoped) setOnlyMine(true); }, [isScoped]);
  const [rows, setRows] = useState<AffaireRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | AffaireStatut>("en_cours");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("affaires")
      .select("id, numero, nom, client, lieu, statut, date_debut, date_fin_prevue, typologie")
      .order("date_debut", { ascending: false, nullsFirst: false });
    if (error) {
      toast.error("Chargement impossible", { description: error.message });
      setLoading(false);
      return;
    }
    setRows((data ?? []) as AffaireRow[]);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const typoCounts = useMemo(() => {
    const counts: Partial<Record<AffaireTypologie, number>> = {};
    for (const r of rows) {
      if (r.typologie) counts[r.typologie] = (counts[r.typologie] ?? 0) + 1;
    }
    return counts;
  }, [rows]);

  const typoSet = useMemo(() => new Set(typoFilter), [typoFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyMine && !mesAffairesIds.has(r.id)) return false;
      if (filter !== "all" && r.statut !== filter) return false;
      if (typoSet.size > 0 && (!r.typologie || !typoSet.has(r.typologie))) return false;
      if (!q) return true;
      return `${r.numero} ${r.nom} ${r.client ?? ""} ${r.lieu ?? ""}`.toLowerCase().includes(q);
    });
  }, [rows, search, filter, typoSet, onlyMine, mesAffairesIds]);

  const setTypoFilter = (next: AffaireTypologie[]) => {
    navigate({ search: { typo: next }, replace: true });
  };

  const openCreate = () => { setForm(emptyForm); setOpen(true); };
  const openEdit = (r: AffaireRow) => {
    setForm({
      id: r.id,
      numero: r.numero,
      nom: r.nom,
      client: r.client ?? "",
      lieu: r.lieu ?? "",
      statut: r.statut,
      date_debut: r.date_debut ?? "",
      date_fin_prevue: r.date_fin_prevue ?? "",
      notes: "",
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.numero.trim() || !form.nom.trim()) {
      toast.error("Champs requis", { description: "Numéro et nom de l'affaire." });
      return;
    }
    setSaving(true);
    const payload = {
      numero: form.numero.trim(),
      nom: form.nom.trim(),
      client: form.client.trim() || null,
      lieu: form.lieu.trim() || null,
      statut: form.statut,
      date_debut: form.date_debut || null,
      date_fin_prevue: form.date_fin_prevue || null,
      notes: form.notes.trim() || null,
    };
    if (form.id) {
      const { error } = await supabase.from("affaires").update(payload).eq("id", form.id);
      if (error) { toast.error("Mise à jour impossible", { description: error.message }); setSaving(false); return; }
      toast.success("Affaire mise à jour");
    } else {
      const { error } = await supabase.from("affaires").insert(payload);
      if (error) { toast.error("Création impossible", { description: error.message }); setSaving(false); return; }
      toast.success("Affaire créée");
    }
    setOpen(false);
    setSaving(false);
    fetchAll();
  };

  const handleReopen = async (r: AffaireRow) => {
    const { error } = await supabase.from("affaires").update({ statut: "en_cours" }).eq("id", r.id);
    if (error) { toast.error("Réouverture impossible", { description: error.message }); return; }
    toast.success(`Affaire ${r.numero} réouverte`);
    fetchAll();
  };

  const handleChangeStatut = async (r: AffaireRow, statut: AffaireStatut) => {
    if (r.statut === statut) return;
    const { error } = await supabase.from("affaires").update({ statut }).eq("id", r.id);
    if (error) { toast.error("Changement de statut impossible", { description: error.message }); return; }
    const labels: Record<AffaireStatut, string> = { prospect: "Prospect", en_cours: "En cours", termine: "Terminée", annule: "Annulée" };
    toast.success(`Affaire ${r.numero} → ${labels[statut]}`);
    fetchAll();
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <PageHeader
        number="02"
        eyebrow="Données / Affaires"
        title="Affaires"
        description={`${rows.filter((r) => r.statut === "en_cours").length} en cours sur ${rows.length} fiche(s).`}
        actions={
          isAdminOrChef && (
            <Button onClick={openCreate} className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="mr-2 h-4 w-4" /> Nouvelle affaire
            </Button>
          )
        }
      />

      <ScopedAccessBanner />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher (numéro, nom, client, lieu)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 rounded-xl pl-9"
          />
        </div>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <TabsList className="rounded-xl bg-muted">
            <TabsTrigger value="en_cours" className="rounded-lg">
              En cours ({rows.filter((r) => r.statut === "en_cours").length})
            </TabsTrigger>
            <TabsTrigger value="prospect" className="rounded-lg">
              Prospect ({rows.filter((r) => r.statut === "prospect").length})
            </TabsTrigger>
            <TabsTrigger value="termine" className="rounded-lg">
              Clôturées ({rows.filter((r) => r.statut === "termine").length})
            </TabsTrigger>
            <TabsTrigger value="annule" className="rounded-lg">
              Annulées ({rows.filter((r) => r.statut === "annule").length})
            </TabsTrigger>
            <TabsTrigger value="all" className="rounded-lg">Toutes</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="rounded-2xl border border-border bg-card p-3">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Typologie
        </div>
        <TypologieMultiFilter
          value={typoFilter}
          onChange={setTypoFilter}
          counts={typoCounts}
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            Aucune affaire ne correspond aux filtres.
          </div>
        ) : (
          <Table className="min-w-[820px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[110px]">N°</TableHead>
                <TableHead className="w-[140px]">Typologie</TableHead>
                <TableHead className="min-w-[200px]">Nom</TableHead>
                <TableHead className="min-w-[140px]">Client</TableHead>
                <TableHead className="min-w-[120px]">Lieu</TableHead>
                <TableHead className="w-[170px]">Période</TableHead>
                <TableHead className="w-[110px]">Statut</TableHead>
                <TableHead className="w-[160px] text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const isClotured = r.statut === "termine";
                return (
                <TableRow key={r.id} className={isClotured ? "opacity-60" : undefined}>
                  <TableCell className="p-0">
                    <Link to="/affaires/$affaireId" params={{ affaireId: r.id }}
                      className="block px-4 py-3 font-mono text-xs font-semibold text-primary hover:underline">
                      {r.numero}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <TypologieBadge typologie={r.typologie ?? getAffaireTypologie(r.numero)} />
                  </TableCell>
                  <TableCell className="p-0">
                    <Link to="/affaires/$affaireId" params={{ affaireId: r.id }}
                      className="block px-4 py-3 font-semibold text-foreground hover:text-primary hover:underline">
                      {r.nom}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">{r.client ?? "—"}</TableCell>
                  <TableCell className="text-sm">{r.lieu ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatPeriode(r.date_debut, r.date_fin_prevue)}
                  </TableCell>
                  <TableCell>
                    {isAdminOrChef ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button type="button" className="cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-full" title="Changer le statut">
                            <StatutPill statut={r.statut} />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-44">
                          <DropdownMenuLabel className="text-xs">Changer le statut</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {STATUTS.map((s) => (
                            <DropdownMenuItem
                              key={s.value}
                              onClick={() => handleChangeStatut(r, s.value)}
                              disabled={s.value === r.statut}
                              className="gap-2"
                            >
                              <StatutPill statut={s.value} />
                              {s.value === r.statut && <span className="ml-auto text-xs text-muted-foreground">actuel</span>}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <StatutPill statut={r.statut} />
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {isAdminOrChef && isClotured && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="rounded-lg text-primary hover:bg-primary/10"
                          onClick={() => handleReopen(r)}
                          title="Repasser cette affaire en cours"
                        >
                          <RotateCcw className="mr-1 h-3.5 w-3.5" /> Réouvrir
                        </Button>
                      )}
                      {isAdminOrChef && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => openEdit(r)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      <Button asChild variant="ghost" size="sm" className="rounded-lg">
                        <Link to="/affaires/$affaireId" params={{ affaireId: r.id }}>
                          Ouvrir <ArrowRight className="ml-1 h-3 w-3" />
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Modifier l'affaire" : "Nouvelle affaire"}</DialogTitle>
            <DialogDescription>
              Le numéro est l'identifiant interne (ex. 2026-018). Les devis et le staffing s'ajoutent depuis la page détail.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Numéro</Label>
              <Input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} className="h-10 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Statut</Label>
              <Select value={form.statut} onValueChange={(v) => setForm({ ...form, statut: v as AffaireStatut })}>
                <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Nom de l'affaire</Label>
              <Input value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} className="h-10 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Client</Label>
              <Input value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} className="h-10 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Lieu</Label>
              <Input value={form.lieu} onChange={(e) => setForm({ ...form, lieu: e.target.value })} className="h-10 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Date de début</Label>
              <Input type="date" value={form.date_debut} onChange={(e) => setForm({ ...form, date_debut: e.target.value })} className="h-10 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Date de fin prévue</Label>
              <Input type="date" value={form.date_fin_prevue} onChange={(e) => setForm({ ...form, date_fin_prevue: e.target.value })} className="h-10 rounded-xl" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="rounded-xl" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} className="rounded-xl">Annuler</Button>
            <Button onClick={handleSave} disabled={saving} className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {form.id ? "Enregistrer" : "Créer l'affaire"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function StatutPill({ statut }: { statut: AffaireStatut }) {
  const map: Record<AffaireStatut, { label: string; cls: string }> = {
    prospect:  { label: "Prospect",  cls: "bg-[var(--cream-deep)] text-foreground" },
    en_cours:  { label: "En cours",  cls: "bg-[var(--indigo-soft)] text-primary" },
    termine:   { label: "Terminée",  cls: "bg-emerald-100 text-emerald-700" },
    annule:    { label: "Annulée",   cls: "bg-rose-100 text-rose-700" },
  };
  const v = map[statut];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${v.cls}`}>
      {v.label}
    </span>
  );
}

function formatPeriode(start: string | null, end: string | null) {
  if (!start && !end) return "—";
  const fmt = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "2-digit" });
  if (start && end) return `${fmt(start)} → ${fmt(end)}`;
  if (start) return `dès ${fmt(start)}`;
  return `→ ${fmt(end!)}`;
}
