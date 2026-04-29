/**
 * Bloc 1b v0.21 — Page /saisie-pour-equipe
 *
 * Grille employé × jour pour saisie chef rapide.
 * Filtres : période (semaine), employés (multi), métier, affaire.
 * Actions :
 * - Cellule vide → ouvre modale ponctuelle pré-remplie
 * - Cellule remplie → affiche heures + badge si saisi_par_chef
 * - Bouton "Saisir en bulk" en haut à droite
 */
import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, format, isWeekend, startOfWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { ClipboardList, Filter, Loader2, Plus, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { stripSearchParams } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { WeekPicker } from "@/components/planning/WeekPicker";
import { PageBreadcrumbs } from "@/components/PageBreadcrumbs";
import { SaisirPourEmployeDialog } from "@/components/heures/SaisirPourEmployeDialog";
import { BulkSaisieDialog } from "@/components/heures/BulkSaisieDialog";
import { SaisieChefBadge } from "@/components/heures/SaisieChefBadge";
import { cn } from "@/lib/utils";
import { fuzzyMatch as fuzzyMatchName, filterByTypologie } from "@/lib/saisie-equipe-filter";

const SEARCH_DEFAULTS = { type: "all" as const, q: "" };

const searchSchema = z.object({
  type: fallback(z.enum(["all", "cdi", "interim"]), SEARCH_DEFAULTS.type).default(
    SEARCH_DEFAULTS.type,
  ),
  q: fallback(z.string(), SEARCH_DEFAULTS.q).default(SEARCH_DEFAULTS.q),
});

export const Route = createFileRoute("/_app/saisie-pour-equipe")({
  head: () => ({ meta: [{ title: "Saisie équipe — Planning chantiers" }] }),
  validateSearch: zodValidator(searchSchema),
  search: { middlewares: [stripSearchParams(SEARCH_DEFAULTS)] },
  component: SaisiePourEquipePage,
});

// fuzzyMatch / filterByTypologie : importés depuis @/lib/saisie-equipe-filter (testés unitairement)

interface Employe {
  id: string;
  prenom: string;
  nom: string;
  metier_principal_id: number;
  type_contrat: "CDI" | "CDD" | "Interim" | "Independant";
}

interface Metier {
  id: number;
  libelle: string;
  couleur: string;
}

interface Affaire {
  id: string;
  numero: string;
  nom: string;
}

interface Saisie {
  id: string;
  date: string;
  employe_id: string;
  affaire_id: string;
  heures_reelles: number | null;
  saisi_par_chef: boolean;
  statut: string;
  affaire: { numero: string } | null;
}

function SaisiePourEquipePage() {
  const { isChef, isAdmin, rolesLoaded } = useAuth();
  const navigate = useNavigate({ from: "/saisie-pour-equipe" });
  const { type: typeFilter, q: searchQuery } = Route.useSearch();

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [employes, setEmployes] = useState<Employe[]>([]);
  const [metiers, setMetiers] = useState<Metier[]>([]);
  const [affaires, setAffaires] = useState<Affaire[]>([]);
  const [saisies, setSaisies] = useState<Saisie[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const [metierFilter, setMetierFilter] = useState<string>("all");
  const [affaireFilter, setAffaireFilter] = useState<string>("all");

  // Recherche debouncée 200ms
  const [searchInput, setSearchInput] = useState(searchQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setSearchInput(searchQuery);
  }, [searchQuery]);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (searchInput !== searchQuery) {
        navigate({ search: (prev) => ({ ...prev, q: searchInput }), replace: true });
      }
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const [saisieDialog, setSaisieDialog] = useState<{
    open: boolean;
    employeId?: string;
    date?: Date;
    affaireId?: string;
  }>({ open: false });
  const [bulkOpen, setBulkOpen] = useState(false);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  const startStr = format(weekStart, "yyyy-MM-dd");
  const endStr = format(addDays(weekStart, 6), "yyyy-MM-dd");

  // Refs initiales
  useEffect(() => {
    Promise.all([
      supabase
        .from("employes")
        .select("id, prenom, nom, metier_principal_id, type_contrat")
        .eq("actif", true)
        .order("nom")
        .limit(1000),
      supabase.from("metiers").select("id, libelle, couleur").order("ordre"),
      supabase.from("affaires").select("id, numero, nom").in("statut", ["en_cours", "prospect"]).order("numero", { ascending: false }).limit(500),
    ]).then(([eRes, mRes, aRes]) => {
      setEmployes((eRes.data ?? []) as Employe[]);
      setMetiers((mRes.data ?? []) as Metier[]);
      setAffaires((aRes.data ?? []) as Affaire[]);
    });
  }, []);

  // Saisies de la semaine
  useEffect(() => {
    setLoading(true);
    let q = supabase
      .from("heures_saisies")
      .select("id, date, employe_id, affaire_id, heures_reelles, saisi_par_chef, statut, affaire:affaires(numero)")
      .gte("date", startStr)
      .lte("date", endStr)
      .order("date")
      .limit(2000);
    if (affaireFilter !== "all") q = q.eq("affaire_id", affaireFilter);
    q.then(({ data, error }) => {
      if (error) toast.error(error.message);
      setSaisies((data ?? []) as unknown as Saisie[]);
      setLoading(false);
    });
  }, [startStr, endStr, affaireFilter, reloadKey]);

  // Filtres employés (métier + typologie + recherche fuzzy)
  const filteredEmployes = useMemo(() => {
    let list = employes;
    if (metierFilter !== "all") {
      const mid = Number(metierFilter);
      list = list.filter((e) => e.metier_principal_id === mid);
    }
    list = filterByTypologie(list, typeFilter);
    if (searchQuery.trim()) {
      list = list.filter((e) => fuzzyMatchName(`${e.prenom} ${e.nom}`, searchQuery));
    }
    return list;
  }, [employes, metierFilter, typeFilter, searchQuery]);

  // Index saisies par employé+date
  const saisieIndex = useMemo(() => {
    const map = new Map<string, Saisie[]>();
    for (const s of saisies) {
      const k = `${s.employe_id}|${s.date}`;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(s);
    }
    return map;
  }, [saisies]);

  const metierOf = (id: number) => metiers.find((m) => m.id === id);

  if (rolesLoaded && !isChef && !isAdmin) return <Navigate to="/dashboard" />;

  return (
    <div className="space-y-6 p-6">
      <PageBreadcrumbs steps={[{ label: "Équipes" }, { label: "Saisie pour l'équipe" }]} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ClipboardList className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Saisie pour l'équipe</h1>
            <p className="text-sm text-muted-foreground">
              Saisis les heures à la place des employés (sans smartphone, oublis, etc.).
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <WeekPicker weekStart={weekStart} onChange={setWeekStart} />
          <Button onClick={() => setBulkOpen(true)} className="gap-1.5">
            <Users className="h-4 w-4" />
            Saisir en bulk
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 py-4">
          <div className="flex items-center gap-1 text-sm font-semibold text-muted-foreground">
            <Filter className="h-4 w-4" /> Filtres :
          </div>
          <div className="min-w-[160px]">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Métier</Label>
            <Select value={metierFilter} onValueChange={setMetierFilter}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                {metiers.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>{m.libelle}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[220px]">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Affaire</Label>
            <Select value={affaireFilter} onValueChange={setAffaireFilter}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                {affaires.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    <span className="font-mono text-xs">{a.numero}</span> — {a.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Typologie</Label>
            <ToggleGroup
              type="single"
              size="sm"
              value={typeFilter}
              onValueChange={(v) => {
                const next = (v as "all" | "cdi" | "interim") || "all";
                navigate({
                  search: (prev: { type: string; q: string }) => ({ ...prev, type: next }),
                  replace: true,
                });
              }}
              className="h-9 justify-start"
            >
              <ToggleGroupItem value="all" className="px-3">Tous</ToggleGroupItem>
              <ToggleGroupItem value="cdi" className="px-3">CDI / CDD</ToggleGroupItem>
              <ToggleGroupItem value="interim" className="px-3">Intérim / Indép.</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="min-w-[220px] flex-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Recherche</Label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Nom ou prénom…"
                className="h-9 pl-7"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Chargement…
        </div>
      ) : filteredEmployes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Aucun employé ne correspond aux filtres.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="sticky left-0 z-10 bg-muted/30 px-3 py-2 text-left font-semibold min-w-[180px]">
                    Employé
                  </th>
                  {days.map((d) => (
                    <th
                      key={d.toISOString()}
                      className={cn(
                        "px-2 py-2 text-center text-xs font-semibold min-w-[110px]",
                        isWeekend(d) && "bg-muted/60",
                      )}
                    >
                      <div className="capitalize">{format(d, "EEE", { locale: fr })}</div>
                      <div className="text-[10px] text-muted-foreground">{format(d, "d MMM", { locale: fr })}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredEmployes.map((e) => {
                  const m = metierOf(e.metier_principal_id);
                  return (
                    <tr key={e.id} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="sticky left-0 z-10 bg-card px-3 py-2 font-medium">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: m?.couleur ?? "#999" }}
                          />
                          <div className="min-w-0">
                            <div className="truncate text-sm">{e.prenom} {e.nom}</div>
                            <div className="text-[10px] text-muted-foreground truncate">{m?.libelle}</div>
                          </div>
                        </div>
                      </td>
                      {days.map((d) => {
                        const dStr = format(d, "yyyy-MM-dd");
                        const cellSaisies = saisieIndex.get(`${e.id}|${dStr}`) ?? [];
                        const total = cellSaisies.reduce((acc, s) => acc + Number(s.heures_reelles ?? 0), 0);
                        return (
                          <td
                            key={dStr}
                            className={cn("px-1.5 py-1.5 align-top", isWeekend(d) && "bg-muted/30")}
                          >
                            {cellSaisies.length === 0 ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setSaisieDialog({
                                    open: true,
                                    employeId: e.id,
                                    date: d,
                                    affaireId: affaireFilter !== "all" ? affaireFilter : undefined,
                                  })
                                }
                                className="w-full rounded-md border border-dashed border-border/60 px-2 py-1.5 text-[11px] text-muted-foreground hover:border-primary hover:bg-primary/5 hover:text-primary transition-colors flex items-center justify-center gap-1"
                              >
                                <Plus className="h-3 w-3" /> Saisir
                              </button>
                            ) : (
                              <div className="space-y-1">
                                {cellSaisies.map((s) => (
                                  <div
                                    key={s.id}
                                    className="rounded-md border border-border bg-background px-2 py-1 cursor-pointer hover:bg-muted/50"
                                    onClick={() =>
                                      setSaisieDialog({
                                        open: true,
                                        employeId: e.id,
                                        date: d,
                                        affaireId: s.affaire_id,
                                      })
                                    }
                                  >
                                    <div className="flex items-center justify-between gap-1">
                                      <span className="font-semibold text-xs">{Number(s.heures_reelles ?? 0)}h</span>
                                      {s.saisi_par_chef && <SaisieChefBadge saisieId={s.id} />}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground truncate font-mono">
                                      {s.affaire?.numero ?? ""}
                                    </div>
                                  </div>
                                ))}
                                {cellSaisies.length > 1 && (
                                  <div className="text-[10px] text-center text-muted-foreground">{total}h tot.</div>
                                )}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <SaisirPourEmployeDialog
        open={saisieDialog.open}
        onOpenChange={(o) => setSaisieDialog((d) => ({ ...d, open: o }))}
        defaultEmployeId={saisieDialog.employeId}
        defaultDate={saisieDialog.date}
        defaultAffaireId={saisieDialog.affaireId}
        onCreated={() => setReloadKey((k) => k + 1)}
      />
      <BulkSaisieDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        defaultWeekStart={weekStart}
        defaultAffaireId={affaireFilter !== "all" ? affaireFilter : undefined}
        onCreated={() => setReloadKey((k) => k + 1)}
      />
    </div>
  );
}
