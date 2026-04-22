import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format, startOfMonth, addMonths } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Loader2,
  Truck,
  Search,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Filter,
  FileDown,
  Eye,
  X,
  Mail,
  Copy,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/PageHeader";
import { TrajetDialog } from "@/components/flotte/TrajetDialog";
import { ExportTrajetsSoustraitanceDialog } from "@/components/flotte/ExportTrajetsSoustraitanceDialog";
import { useVehicules, type Trajet } from "@/hooks/use-vehicules";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_app/export/demandes-devis")({
  head: () => ({ meta: [{ title: "Demandes transport — Logistique" }] }),
  component: DemandesTransportPage,
});

type StatutSousTraitance = Trajet["statut_soustraitance"];
type AffaireLite = Pick<Tables<"affaires">, "id" | "numero" | "nom" | "client" | "lieu">;
type EmployeLite = {
  id: string;
  prenom: string;
  nom: string;
  est_livreur: boolean;
  actif: boolean;
  categories_permis: Tables<"employes">["categories_permis"] | null;
};

interface TrajetEnrichi extends Trajet {
  affaire: AffaireLite | null;
  vehicule_label: string | null;
}

const STATUT_LABEL: Record<StatutSousTraitance, string> = {
  non: "Non sous-traité",
  a_sous_traiter: "Brouillon",
  devis_envoye: "Envoyé",
  confirme: "Confirmé",
};

const STATUT_VARIANT: Record<StatutSousTraitance, "outline" | "secondary" | "default"> = {
  non: "outline",
  a_sous_traiter: "outline",
  devis_envoye: "secondary",
  confirme: "default",
};

const STATUT_NEXT: Partial<Record<StatutSousTraitance, StatutSousTraitance | null>> = {
  a_sous_traiter: "devis_envoye",
  devis_envoye: "confirme",
  confirme: null,
};

const CATEGORIE_LABEL: Record<Trajet["categorie"], string> = {
  pose: "Pose",
  depose: "Dépose",
  livraison_fourniture: "Livraison fourniture",
  recuperation_materiel: "Récupération matériel",
  autre: "Autre",
};

const PAGE_SIZE = 50;

type SortKey = "date" | "reference" | "prestataire" | "statut" | "affaire";

function DemandesTransportPage() {
  const [loading, setLoading] = useState(true);
  const [trajets, setTrajets] = useState<TrajetEnrichi[]>([]);
  const [affaires, setAffaires] = useState<AffaireLite[]>([]);
  const [employesLivreurs, setEmployesLivreurs] = useState<EmployeLite[]>([]);
  const { vehicules } = useVehicules();

  // Filtres
  const today = new Date();
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(today), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(addMonths(startOfMonth(today), 2), "yyyy-MM-dd"));
  const [statutFilter, setStatutFilter] = useState<StatutSousTraitance | "all">("all");
  const [prestataireFilter, setPrestataireFilter] = useState<string>("__all__");
  const [affaireFilter, setAffaireFilter] = useState<string>("__all__");
  const [search, setSearch] = useState("");

  // Tri & pagination
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);

  // Modale détail
  const [editingTrajet, setEditingTrajet] = useState<Trajet | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("trajets")
      .select(
        "*, affaire:affaire_id(id, numero, nom, client, lieu), vehicule:vehicule_id(nom, immatriculation)",
      )
      .neq("statut_soustraitance", "non")
      .gte("date", dateFrom)
      .lte("date", dateTo)
      .order("date", { ascending: true });
    if (error) {
      toast.error("Échec du chargement : " + error.message);
      setLoading(false);
      return;
    }
    type Row = Trajet & {
      affaire: AffaireLite | null;
      vehicule: { nom: string | null; immatriculation: string | null } | null;
    };
    setTrajets(
      ((data ?? []) as unknown as Row[]).map((r) => ({
        ...r,
        vehicule_label: r.vehicule?.nom
          ? `${r.vehicule.nom}${r.vehicule.immatriculation ? ` (${r.vehicule.immatriculation})` : ""}`
          : null,
      })),
    );
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo]);

  // Charge affaires + livreurs (pour TrajetDialog)
  useEffect(() => {
    void (async () => {
      const [{ data: aff }, { data: emp }] = await Promise.all([
        supabase
          .from("affaires")
          .select("id, numero, nom, client, lieu")
          .order("numero", { ascending: false })
          .limit(500),
        supabase
          .from("employes")
          .select("id, prenom, nom, est_livreur, actif, categories_permis")
          .eq("est_livreur", true)
          .eq("actif", true),
      ]);
      setAffaires((aff ?? []) as AffaireLite[]);
      setEmployesLivreurs((emp ?? []) as EmployeLite[]);
    })();
  }, []);

  // Liste prestataires distincts (pour le filtre)
  const prestataireOptions = useMemo(() => {
    const set = new Set<string>();
    trajets.forEach((t) => {
      if (t.prestataire?.trim()) set.add(t.prestataire.trim());
    });
    return Array.from(set).sort();
  }, [trajets]);

  // Filtrage côté client (déjà filtré dates côté DB)
  const filtered = useMemo(() => {
    return trajets.filter((t) => {
      if (statutFilter !== "all" && t.statut_soustraitance !== statutFilter) return false;
      if (prestataireFilter !== "__all__" && (t.prestataire ?? "").trim() !== prestataireFilter)
        return false;
      if (affaireFilter !== "__all__" && t.affaire?.id !== affaireFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const haystack = [
          t.reference ?? "",
          t.adresse_depart,
          t.adresse_arrivee,
          t.affaire?.numero ?? "",
          t.affaire?.nom ?? "",
          t.prestataire ?? "",
          t.notes ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [trajets, statutFilter, prestataireFilter, affaireFilter, search]);

  // Tri
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "reference":
          cmp = (a.reference ?? "").localeCompare(b.reference ?? "");
          break;
        case "prestataire":
          cmp = (a.prestataire ?? "").localeCompare(b.prestataire ?? "");
          break;
        case "statut":
          cmp = a.statut_soustraitance.localeCompare(b.statut_soustraitance);
          break;
        case "affaire":
          cmp = (a.affaire?.numero ?? "").localeCompare(b.affaire?.numero ?? "");
          break;
        case "date":
        default:
          cmp = a.date.localeCompare(b.date);
          if (cmp === 0)
            cmp = (a.heure_depart ?? "").localeCompare(b.heure_depart ?? "");
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = useMemo(
    () => sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [sorted, safePage],
  );

  // Compteurs par statut (sur les données filtrées par dates uniquement, ignore les autres filtres)
  const statutCounts = useMemo(() => {
    const c = { a_sous_traiter: 0, devis_envoye: 0, confirme: 0 } as Record<
      StatutSousTraitance,
      number
    >;
    trajets.forEach((t) => {
      c[t.statut_soustraitance] = (c[t.statut_soustraitance] ?? 0) + 1;
    });
    return c;
  }, [trajets]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function resetFilters() {
    setStatutFilter("all");
    setPrestataireFilter("__all__");
    setAffaireFilter("__all__");
    setSearch("");
    setPage(1);
  }

  async function changeStatut(trajetId: string, nextStatut: StatutSousTraitance) {
    setUpdatingId(trajetId);
    const patch: Partial<Trajet> = { statut_soustraitance: nextStatut };
    if (nextStatut === "devis_envoye") {
      patch.soustraitance_envoye_le = new Date().toISOString();
    }
    const { error } = await supabase.from("trajets").update(patch).eq("id", trajetId);
    setUpdatingId(null);
    if (error) {
      toast.error("Échec de la mise à jour : " + error.message);
      return;
    }
    toast.success(`Statut mis à jour : ${STATUT_LABEL[nextStatut]}`);
    await refresh();
  }

  function openDetail(t: TrajetEnrichi) {
    setEditingTrajet(t);
    setDialogOpen(true);
  }

  const hasActiveFilters =
    statutFilter !== "all" ||
    prestataireFilter !== "__all__" ||
    affaireFilter !== "__all__" ||
    search.trim().length > 0;

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        number="07"
        eyebrow="Logistique / Sous-traitance"
        title="Demandes transport"
        description="Suivi des trajets sous-traités aux transporteurs"
        actions={
          <Button variant="outline" size="sm" onClick={() => setExportDialogOpen(true)}>
            <FileDown className="mr-2 h-4 w-4" />
            Exporter CSV / Excel
          </Button>
        }
      />

      {/* Compteurs synthèse */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <CountCard
          label="Brouillon"
          value={statutCounts.a_sous_traiter}
          variant="outline"
          onClick={() => setStatutFilter("a_sous_traiter")}
          active={statutFilter === "a_sous_traiter"}
        />
        <CountCard
          label="Envoyé"
          value={statutCounts.devis_envoye}
          variant="secondary"
          onClick={() => setStatutFilter("devis_envoye")}
          active={statutFilter === "devis_envoye"}
        />
        <CountCard
          label="Confirmé"
          value={statutCounts.confirme}
          variant="default"
          onClick={() => setStatutFilter("confirme")}
          active={statutFilter === "confirme"}
        />
      </div>

      {/* Filtres */}
      <Card>
        <CardContent className="space-y-3 pt-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div>
              <Label htmlFor="from" className="text-xs">Du</Label>
              <Input
                id="from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="to" className="text-xs">Au</Label>
              <Input
                id="to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Statut</Label>
              <Select
                value={statutFilter}
                onValueChange={(v) => {
                  setStatutFilter(v as StatutSousTraitance | "all");
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  <SelectItem value="a_sous_traiter">Brouillon</SelectItem>
                  <SelectItem value="devis_envoye">Envoyé</SelectItem>
                  <SelectItem value="confirme">Confirmé</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Prestataire</Label>
              <Select
                value={prestataireFilter}
                onValueChange={(v) => {
                  setPrestataireFilter(v);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Tous prestataires</SelectItem>
                  <SelectItem value="__none__" disabled={!trajets.some((t) => !t.prestataire?.trim())}>
                    — Sans prestataire —
                  </SelectItem>
                  {prestataireOptions.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="md:col-span-2">
              <Label className="text-xs">Affaire</Label>
              <Select
                value={affaireFilter}
                onValueChange={(v) => {
                  setAffaireFilter(v);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  <SelectItem value="__all__">Toutes les affaires</SelectItem>
                  {affaires.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.numero} — {a.nom}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Recherche</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Réf, adresse, affaire…"
                  className="pl-8"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
            </div>
          </div>

          {hasActiveFilters && (
            <div className="flex items-center gap-2 pt-1">
              <Filter className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {sorted.length} résultat{sorted.length > 1 ? "s" : ""} sur {trajets.length}
              </span>
              <Button variant="ghost" size="sm" onClick={resetFilters} className="h-6 px-2 text-xs">
                <X className="mr-1 h-3 w-3" />
                Effacer
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tableau */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Truck className="h-10 w-10 text-muted-foreground" />
              <p className="text-base font-semibold">Aucun trajet sous-traité</p>
              <p className="max-w-md text-sm text-muted-foreground">
                {hasActiveFilters
                  ? "Aucun trajet ne correspond aux filtres. Réinitialise pour voir tous les trajets."
                  : "Marque un trajet comme « À sous-traiter » dans Planning Flotte (bouton +S/T)."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortHead onClick={() => toggleSort("reference")} active={sortKey === "reference"} dir={sortDir}>
                      Référence
                    </SortHead>
                    <SortHead onClick={() => toggleSort("date")} active={sortKey === "date"} dir={sortDir}>
                      Date
                    </SortHead>
                    <TableHead>Horaires</TableHead>
                    <TableHead>Trajet</TableHead>
                    <TableHead className="text-center">A/R</TableHead>
                    <TableHead>Véhicule</TableHead>
                    <SortHead onClick={() => toggleSort("affaire")} active={sortKey === "affaire"} dir={sortDir}>
                      Affaire
                    </SortHead>
                    <SortHead onClick={() => toggleSort("prestataire")} active={sortKey === "prestataire"} dir={sortDir}>
                      Prestataire
                    </SortHead>
                    <SortHead onClick={() => toggleSort("statut")} active={sortKey === "statut"} dir={sortDir}>
                      Statut
                    </SortHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map((t) => {
                    const next = STATUT_NEXT[t.statut_soustraitance];
                    const isUpdating = updatingId === t.id;
                    const isPaireRetour = !!t.parent_trajet_id;
                    return (
                      <TableRow key={t.id} className="text-xs">
                        <TableCell className="font-mono text-[11px] text-muted-foreground">
                          {t.reference ?? t.id.slice(0, 8).toUpperCase()}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {format(new Date(t.date + "T00:00:00"), "EEE d MMM", { locale: fr })}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {t.heure_depart ? t.heure_depart.slice(0, 5) : "—"}
                          {t.heure_arrivee ? ` → ${t.heure_arrivee.slice(0, 5)}` : ""}
                        </TableCell>
                        <TableCell className="max-w-[260px]">
                          <div className="truncate" title={t.adresse_depart}>{t.adresse_depart}</div>
                          <div className="truncate text-muted-foreground" title={t.adresse_arrivee}>
                            → {t.adresse_arrivee}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {CATEGORIE_LABEL[t.categorie] ?? t.categorie}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {t.aller_retour ? (
                            <Badge variant="outline" className="text-[10px]">
                              {isPaireRetour ? "Retour" : "Aller"}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[140px] truncate">
                          {t.vehicule_label ?? <span className="text-muted-foreground italic">À attribuer</span>}
                        </TableCell>
                        <TableCell className="max-w-[160px]">
                          {t.affaire ? (
                            <div>
                              <div className="font-mono text-[11px] text-primary">{t.affaire.numero}</div>
                              <div className="truncate text-muted-foreground">{t.affaire.nom}</div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground italic">—</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[140px]">
                          {t.prestataire ? (
                            <span className="truncate" title={t.prestataire}>
                              {t.prestataire}
                            </span>
                          ) : (
                            <span className="text-muted-foreground italic">À attribuer</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUT_VARIANT[t.statut_soustraitance]} className="text-[10px]">
                            {STATUT_LABEL[t.statut_soustraitance]}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2"
                              onClick={() => openDetail(t)}
                            >
                              <Eye className="h-3.5 w-3.5" />
                              <span className="ml-1 hidden md:inline">Détail</span>
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2"
                                  disabled={isUpdating}
                                >
                                  {isUpdating ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <ArrowUpDown className="h-3.5 w-3.5" />
                                  )}
                                  <span className="ml-1 hidden md:inline">Statut</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel className="text-xs">Changer le statut</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {next && (
                                  <DropdownMenuItem onClick={() => changeStatut(t.id, next)}>
                                    → {STATUT_LABEL[next]}
                                  </DropdownMenuItem>
                                )}
                                {(["a_sous_traiter", "devis_envoye", "confirme"] as StatutSousTraitance[])
                                  .filter((s) => s !== t.statut_soustraitance && s !== next)
                                  .map((s) => (
                                    <DropdownMenuItem key={s} onClick={() => changeStatut(t.id, s)}>
                                      Passer à : {STATUT_LABEL[s]}
                                    </DropdownMenuItem>
                                  ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {sorted.length > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {safePage} / {totalPages} · {sorted.length} trajet{sorted.length > 1 ? "s" : ""}
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={safePage === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={safePage === totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Modale édition trajet */}
      {dialogOpen && (
        <TrajetDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          trajet={editingTrajet}
          affaires={affaires.map((a) => ({ id: a.id, numero: a.numero, nom: a.nom }))}
          employesLivreurs={employesLivreurs}
          onSaved={() => {
            void refresh();
          }}
        />
      )}

      {/* Dialog export CSV/XLSX */}
      <ExportTrajetsSoustraitanceDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
      />

      {/* placeholder pour éviter le tree-shaking de useVehicules (futur usage) */}
      <span className="hidden">{vehicules.length}</span>
    </div>
  );
}

function CountCard({
  label,
  value,
  variant,
  onClick,
  active,
}: {
  label: string;
  value: number;
  variant: "outline" | "secondary" | "default";
  onClick: () => void;
  active: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent ${
        active ? "border-primary bg-primary/5" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <Badge variant={variant} className="text-[10px]">
          {label}
        </Badge>
        {active && <span className="text-[10px] font-semibold text-primary">Filtre actif</span>}
      </div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">trajet{value > 1 ? "s" : ""}</div>
    </button>
  );
}

function SortHead({
  children,
  active,
  dir,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <TableHead>
      <button
        type="button"
        onClick={onClick}
        className={`group flex items-center gap-1 text-xs uppercase tracking-wide ${
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        {children}
        <ArrowUpDown className={`h-3 w-3 ${active ? "text-primary" : "opacity-40"}`} />
        {active && <span className="text-[9px]">{dir === "asc" ? "↑" : "↓"}</span>}
      </button>
    </TableHead>
  );
}
