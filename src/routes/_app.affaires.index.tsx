import { createFileRoute, Link, useNavigate, stripSearchParams } from "@tanstack/react-router";
import { requireCapability } from "@/lib/capability-guard";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Loader2, ArrowRight, Pencil, RotateCcw, ArrowUp, ArrowDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCapability } from "@/hooks/use-capability";
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
import { useMesAffairesChefIds } from "@/hooks/use-mes-affaires-chef";
import { Switch } from "@/components/ui/switch";
import { type AffaireTypologie, AFFAIRE_TYPOLOGIES, getAffaireTypologie } from "@/lib/affaire-typologie";
import { toast } from "sonner";
import { ClientCombobox } from "@/components/clients/ClientCombobox";
import { cn } from "@/lib/utils";

type AffaireStatut = "prospect" | "en_cours" | "termine" | "annule";

interface AffaireRow {
  id: string;
  numero: string;
  nom: string;
  client: string | null;
  client_id: string | null;
  lieu: string | null;
  statut: AffaireStatut;
  date_debut: string | null;
  date_fin_prevue: string | null;
  date_montage: string | null;
  date_demontage: string | null;
  chef_projet_id: string | null;
  charge_affaires_id: string | null;
  typologie: AffaireTypologie | null;
}

interface FormState {
  id?: string;
  numero: string;
  nom: string;
  client: string;
  client_id: string | null;
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
  client_id: null,
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

/** LOT 2 — colonnes triables. */
type TriKey = "numero" | "nom" | "client" | "montage" | "demontage" | "statut";
type TriSens = "asc" | "desc";
/** LOT 2 — filtre échéance montage. */
type EcheanceKey = "toutes" | "14j" | "1m" | "3m" | "sans";

const ECHEANCES: { value: EcheanceKey; label: string }[] = [
  { value: "toutes", label: "Toutes" },
  { value: "14j", label: "2 semaines" },
  { value: "1m", label: "1 mois" },
  { value: "3m", label: "3 mois" },
  { value: "sans", label: "Sans date" },
];

const STATUT_ORDER: Record<AffaireStatut, number> = {
  en_cours: 0, prospect: 1, termine: 2, annule: 3,
};

const SEARCH_DEFAULTS = {
  typo: [] as AffaireTypologie[],
  tri: "montage" as TriKey,
  sens: "asc" as TriSens,
  echeance: "toutes" as EcheanceKey,
};

const searchSchema = z.object({
  typo: fallback(z.array(z.enum(AFFAIRE_TYPOLOGIES as [AffaireTypologie, ...AffaireTypologie[]])), []).default([]),
  tri: fallback(z.string(), "montage").default("montage"),
  sens: fallback(z.string(), "asc").default("asc"),
  echeance: fallback(z.string(), "toutes").default("toutes"),
});

export const Route = createFileRoute("/_app/affaires/")({
  beforeLoad: () => requireCapability("section.affaires"),
  head: () => ({ meta: [{ title: "Affaires — Setup Paris" }] }),
  validateSearch: zodValidator(searchSchema),
  search: { middlewares: [stripSearchParams(SEARCH_DEFAULTS)] },
  component: AffairesPage,
});

const TRI_KEYS: TriKey[] = ["numero", "nom", "client", "montage", "demontage", "statut"];

function todayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Nombre de jours calendaires entre aujourd'hui et une date ISO (positif = futur). */
function daysUntil(iso: string): number {
  const d = new Date(iso + "T00:00:00");
  return Math.round((d.getTime() - todayISO().getTime()) / 86_400_000);
}

function AffairesPage() {
  const canManageAffaires = useCapability("section.affaires");
  const navigate = useNavigate({ from: "/affaires/" });
  const rawSearch = Route.useSearch();
  const typoFilter = rawSearch.typo;
  const tri: TriKey = TRI_KEYS.includes(rawSearch.tri as TriKey) ? (rawSearch.tri as TriKey) : "montage";
  const sens: TriSens = rawSearch.sens === "desc" ? "desc" : "asc";
  const echeance: EcheanceKey = ECHEANCES.some((e) => e.value === rawSearch.echeance)
    ? (rawSearch.echeance as EcheanceKey)
    : "toutes";
  const { ids: mesAffairesIds, isLoading: mesAffairesLoading } = useMesAffairesChefIds();
  const [onlyMine, setOnlyMine] = useState(false);
  const [rows, setRows] = useState<AffaireRow[]>([]);
  const [people, setPeople] = useState<Map<string, string>>(new Map());
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
      .select("id, numero, nom, client, client_id, lieu, statut, date_debut, date_fin_prevue, date_montage, date_demontage, chef_projet_id, charge_affaires_id, typologie")
      .order("date_montage", { ascending: true, nullsFirst: false });
    if (error) {
      toast.error("Chargement impossible", { description: error.message });
      setLoading(false);
      return;
    }
    setRows((data ?? []) as AffaireRow[]);
    setLoading(false);
  };

  const fetchPeople = async () => {
    const { data } = await supabase.from("employes").select("id, prenom, nom");
    const map = new Map<string, string>();
    for (const e of data ?? []) {
      const prenom = (e.prenom ?? "").trim();
      const nom = (e.nom ?? "").trim();
      const label = [prenom, nom ? `${nom.charAt(0).toUpperCase()}.` : ""].filter(Boolean).join(" ");
      map.set(e.id, label || "—");
    }
    setPeople(map);
  };

  useEffect(() => { fetchAll(); fetchPeople(); }, []);

  const typoCounts = useMemo(() => {
    const counts: Partial<Record<AffaireTypologie, number>> = {};
    for (const r of rows) {
      if (r.typologie) counts[r.typologie] = (counts[r.typologie] ?? 0) + 1;
    }
    return counts;
  }, [rows]);

  const typoSet = useMemo(() => new Set(typoFilter), [typoFilter]);

  /** Filtres hors échéance — sert au compteur « sans date de montage ». */
  const baseFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyMine && !mesAffairesIds.has(r.id)) return false;
      if (filter !== "all" && r.statut !== filter) return false;
      if (typoSet.size > 0 && (!r.typologie || !typoSet.has(r.typologie))) return false;
      if (!q) return true;
      return `${r.numero} ${r.nom} ${r.client ?? ""} ${r.lieu ?? ""}`.toLowerCase().includes(q);
    });
  }, [rows, search, filter, typoSet, onlyMine, mesAffairesIds]);

  const sansDateCount = useMemo(
    () => baseFiltered.filter((r) => !r.date_montage).length,
    [baseFiltered],
  );

  const filtered = useMemo(() => {
    const horizonDays: Partial<Record<EcheanceKey, number>> = { "14j": 14, "1m": 31, "3m": 92 };
    const withEcheance = baseFiltered.filter((r) => {
      if (echeance === "toutes") return true;
      if (echeance === "sans") return !r.date_montage;
      const max = horizonDays[echeance]!;
      if (!r.date_montage) return false;
      const d = daysUntil(r.date_montage);
      return d >= 0 && d <= max;
    });

    const dir = sens === "asc" ? 1 : -1;
    const cmpText = (a: string, b: string) => a.localeCompare(b, "fr", { numeric: true, sensitivity: "base" });
    const cmpDate = (a: string | null, b: string | null) => {
      // Nulls toujours en dernier, quel que soit le sens.
      if (!a && !b) return 0;
      if (!a) return 1;
      if (!b) return -1;
      return (a < b ? -1 : a > b ? 1 : 0) * dir;
    };

    return [...withEcheance].sort((a, b) => {
      switch (tri) {
        case "numero": return cmpText(a.numero, b.numero) * dir;
        case "nom": return cmpText(a.nom, b.nom) * dir;
        case "client": return cmpText(a.client ?? "", b.client ?? "") * dir;
        case "demontage": return cmpDate(a.date_demontage, b.date_demontage);
        case "statut": return (STATUT_ORDER[a.statut] - STATUT_ORDER[b.statut]) * dir;
        case "montage":
        default: return cmpDate(a.date_montage, b.date_montage);
      }
    });
  }, [baseFiltered, echeance, tri, sens]);

  const setTypoFilter = (next: AffaireTypologie[]) => {
    navigate({ search: { typo: next, tri, sens, echeance }, replace: true });
  };

  const setEcheance = (next: EcheanceKey) => {
    navigate({ search: { typo: typoFilter, tri, sens, echeance: next }, replace: true });
  };

  const toggleTri = (key: TriKey) => {
    navigate({
      search: {
        typo: typoFilter,
        echeance,
        tri: key,
        sens: tri === key && sens === "asc" ? "desc" : "asc",
      },
      replace: true,
    });

  };


  const openCreate = () => { setForm(emptyForm); setOpen(true); };
  const openEdit = (r: AffaireRow) => {
    setForm({
      id: r.id,
      numero: r.numero,
      nom: r.nom,
      client: r.client ?? "",
      client_id: r.client_id ?? null,
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
      client_id: form.client_id,
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
          canManageAffaires && (
            <Button onClick={openCreate} className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="mr-2 h-4 w-4" /> Nouvelle affaire
            </Button>
          )
        }
      />

      {mesAffairesIds.size > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
          <Switch
            id="only-mine"
            checked={onlyMine}
            onCheckedChange={setOnlyMine}
            disabled={mesAffairesLoading}
          />
          <Label htmlFor="only-mine" className="cursor-pointer text-sm">
            Mes chantiers uniquement
            <span className="ml-1.5 text-xs text-muted-foreground">
              ({mesAffairesIds.size})
            </span>
          </Label>
        </div>
      )}

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

      {/* LOT 2 — indicateur de complétude des dates de montage */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <span>{baseFiltered.length} affaire{baseFiltered.length > 1 ? "s" : ""}</span>
        <span>·</span>
        {sansDateCount > 0 ? (
          <button
            type="button"
            onClick={() => setEcheance("sans")}
            className="font-semibold text-amber-600 underline-offset-2 hover:underline"
          >
            {sansDateCount} sans date de montage
          </button>
        ) : (
          <span>toutes avec une date de montage</span>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex-1">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Typologie
          </div>
          <TypologieMultiFilter
            value={typoFilter}
            onChange={setTypoFilter}
            counts={typoCounts}
          />
        </div>
        <div className="sm:w-52">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Montage dans…
          </div>
          <Select value={echeance} onValueChange={(v) => setEcheance(v as EcheanceKey)}>
            <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ECHEANCES.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
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
          <Table className="min-w-[1100px]">
            <TableHeader>
              <TableRow>
                <SortableHead label="N°" col="numero" tri={tri} sens={sens} onSort={toggleTri} className="w-[110px]" />
                <TableHead className="w-[130px]">Typologie</TableHead>
                <SortableHead label="Nom" col="nom" tri={tri} sens={sens} onSort={toggleTri} className="min-w-[190px]" />
                <SortableHead label="Client" col="client" tri={tri} sens={sens} onSort={toggleTri} className="min-w-[130px]" />
                <TableHead className="hidden min-w-[110px] lg:table-cell">Lieu</TableHead>
                <SortableHead label="Montage" col="montage" tri={tri} sens={sens} onSort={toggleTri} className="w-[120px]" />
                <SortableHead label="Démontage" col="demontage" tri={tri} sens={sens} onSort={toggleTri} className="w-[110px]" />
                <TableHead className="w-[120px]">Chef de projet</TableHead>
                <TableHead className="hidden w-[130px] xl:table-cell">Chargé d'affaires</TableHead>
                <SortableHead label="Statut" col="statut" tri={tri} sens={sens} onSort={toggleTri} className="w-[110px]" />
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
                  <TableCell className="hidden text-sm lg:table-cell">{r.lieu ?? "—"}</TableCell>
                  <TableCell><DateMontageCell date={r.date_montage} /></TableCell>
                  <TableCell>
                    {r.date_demontage
                      ? <span className="text-xs font-medium">{formatCourt(r.date_demontage)}</span>
                      : <span className="text-xs text-muted-foreground/50">—</span>}
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.chef_projet_id ? (people.get(r.chef_projet_id) ?? "—")
                      : <span className="text-muted-foreground/50">—</span>}
                  </TableCell>
                  <TableCell className="hidden text-xs xl:table-cell">
                    {r.charge_affaires_id ? (people.get(r.charge_affaires_id) ?? "—")
                      : <span className="text-muted-foreground/50">—</span>}
                  </TableCell>

                  <TableCell>
                    {canManageAffaires ? (
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
                      {canManageAffaires && isClotured && (
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
                      {canManageAffaires && (
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
              <ClientCombobox
                value={form.client}
                clientId={form.client_id}
                onChange={(id, nom) => setForm({ ...form, client_id: id, client: nom })}
              />
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

/** LOT 2 — « 27 août » */
function formatCourt(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

/** LOT 2 — en-tête de colonne triable. */
function SortableHead({
  label, col, tri, sens, onSort, className,
}: {
  label: string;
  col: TriKey;
  tri: TriKey;
  sens: TriSens;
  onSort: (c: TriKey) => void;
  className?: string;
}) {
  const active = tri === col;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(col)}
        className={cn(
          "inline-flex items-center gap-1 text-left hover:text-foreground",
          active ? "font-semibold text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
        {active && (sens === "asc"
          ? <ArrowUp className="h-3 w-3" />
          : <ArrowDown className="h-3 w-3" />)}
      </button>
    </TableHead>
  );
}

/** LOT 2 — date de montage + compte à rebours. */
function DateMontageCell({ date }: { date: string | null }) {
  if (!date) return <span className="text-xs text-muted-foreground/50">—</span>;
  const d = daysUntil(date);
  const label = d === 0 ? "Aujourd'hui" : d > 0 ? `J−${d}` : `J+${Math.abs(d)}`;
  return (
    <div className="leading-tight">
      <div className="text-xs font-semibold text-foreground">{formatCourt(date)}</div>
      <div
        className={cn(
          "text-[10px]",
          d < 0 ? "text-muted-foreground/60"
            : d > 60 ? "text-muted-foreground/70"
            : d <= 7 ? "font-semibold text-amber-600"
            : "text-muted-foreground",
        )}
      >
        {label}
      </div>
    </div>
  );
}

