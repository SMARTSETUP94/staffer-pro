/**
 * v0.49 — StafferAffaireDialog
 *
 * Ouvert depuis la sidebar « Heures restantes » via le bouton « Staffer » par
 * affaire. Propose les employés les mieux placés pour combler les heures
 * restantes, scorés selon :
 *  - Métier match (poste devisé prioritaire)
 *  - Disponibilité sur la cellule cible (pas d'absence ni de conflit slot)
 *  - Historique chantier (a déjà bossé sur cette affaire — `affaire_equipe_historique`)
 *  - Charge semaine (moins chargé = plus haut)
 *
 * Insert via `insertAssignationsBatch` (audit `created_by`). Au succès :
 *  - `onConsommationChanged()` (re-fetch ciblé sidebar — <100ms)
 *  - `onSaved()` (refresh complet planning en background)
 */
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  CalendarOff,
  Check,
  Clock,
  History,
  Info,
  List,
  Loader2,
  Search,
  Sparkles,
  UserCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { insertAssignationsBatch } from "@/lib/assignation-upsert";
import { formatBusinessError } from "@/lib/business-errors";
import { ABSENCE_LABEL, findAbsence } from "@/lib/absence-helpers";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type {
  Absence,
  Affaire,
  Assignation,
  DevisConsommation,
  Employe,
  Metier,
} from "@/hooks/use-planning-data";

type Slot = "AM" | "PM" | "JOURNEE";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  affaire: Affaire;
  consommation: DevisConsommation[]; // toutes lignes, sera filtré sur affaire
  employes: Employe[];
  metiers: Metier[];
  assignations: Assignation[]; // assignations de la semaine (pour conflits + charge)
  absences: Absence[];
  /** Date par défaut proposée (généralement lundi de la semaine affichée). */
  defaultDate: Date;
  /** Refetch ciblé v_devis_consommation (instantané sidebar). */
  onConsommationChanged: () => void | Promise<void>;
  /** Refresh complet planning. */
  onSaved: () => void;
}

interface ScoreBreakdown {
  metier: number;
  dispo: number;
  histo: number;
  charge: number;
}

interface Scored {
  employe: Employe;
  score: number;
  breakdown: ScoreBreakdown;
  metierMatch: "principal" | "renfort" | "autre";
  histoNbChantiers: number;
  histoNbDemi: number;
  heuresSemaine: number;
  blocked: { kind: "absence" | "conflict"; label: string } | null;
}

interface HistoRow {
  employe_id: string;
  nb_demi_jours: number;
  nb_jours_distincts: number;
}

const HEURES_PAR_SLOT: Record<Slot, number> = { AM: 4, PM: 4, JOURNEE: 8 };

export function StafferAffaireDialog({
  open,
  onOpenChange,
  affaire,
  consommation,
  employes,
  metiers,
  assignations,
  absences,
  defaultDate,
  onConsommationChanged,
  onSaved,
}: Props) {
  // Lignes devis restantes sur cette affaire (heures_restantes > 0)
  const lignesAffaire = useMemo(
    () =>
      consommation
        .filter((c) => c.affaire_id === affaire.id)
        .sort((a, b) => b.heures_restantes - a.heures_restantes),
    [consommation, affaire.id],
  );

  // Métiers disponibles : ceux qui ont des heures devisées sur l'affaire (priorité aux restantes > 0)
  const metierOptions = useMemo(() => {
    const byMetier = new Map<number, { devisIds: Set<string>; restantes: number; metier: string }>();
    lignesAffaire.forEach((l) => {
      const cur = byMetier.get(l.metier_id) ?? { devisIds: new Set(), restantes: 0, metier: l.metier };
      cur.devisIds.add(l.devis_id);
      cur.restantes += l.heures_restantes;
      byMetier.set(l.metier_id, cur);
    });
    return Array.from(byMetier.entries())
      .map(([id, v]) => ({ id, libelle: v.metier, restantes: v.restantes, devisIds: Array.from(v.devisIds) }))
      .sort((a, b) => b.restantes - a.restantes);
  }, [lignesAffaire]);

  const [metierId, setMetierId] = useState<number | null>(null);
  const [dateStr, setDateStr] = useState<string>(() => format(defaultDate, "yyyy-MM-dd"));
  const [slot, setSlot] = useState<Slot>("JOURNEE");
  const [heures, setHeures] = useState<number>(8);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [breakdownSearch, setBreakdownSearch] = useState("");
  const [breakdownMetierFilter, setBreakdownMetierFilter] = useState<string>("all");
  const [breakdownContratFilter, setBreakdownContratFilter] = useState<string>("all");
  const [breakdownDispoFilter, setBreakdownDispoFilter] = useState<"all" | "dispo" | "bloque">("all");
  const [historique, setHistorique] = useState<Map<string, HistoRow>>(new Map());
  const [loadingHisto, setLoadingHisto] = useState(false);

  // Reset à l'ouverture / changement d'affaire
  useEffect(() => {
    if (!open) return;
    setDateStr(format(defaultDate, "yyyy-MM-dd"));
    setSlot("JOURNEE");
    setHeures(8);
    setMetierId((prev) => prev ?? metierOptions[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, affaire.id]);

  useEffect(() => {
    if (!open) return;
    if (metierId == null && metierOptions.length > 0) setMetierId(metierOptions[0].id);
  }, [open, metierOptions, metierId]);

  useEffect(() => {
    setHeures(HEURES_PAR_SLOT[slot]);
  }, [slot]);

  // Fetch historique chantier (1× à l'ouverture)
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingHisto(true);
    supabase
      .from("affaire_equipe_historique")
      .select("employe_id, nb_demi_jours, nb_jours_distincts")
      .eq("affaire_id", affaire.id)
      .then(({ data, error }) => {
        if (cancelled) return;
        const map = new Map<string, HistoRow>();
        if (!error && data) {
          (data as HistoRow[]).forEach((r) => {
            const cur = map.get(r.employe_id);
            if (!cur) map.set(r.employe_id, r);
            else {
              cur.nb_demi_jours += r.nb_demi_jours;
              cur.nb_jours_distincts += r.nb_jours_distincts;
            }
          });
        }
        setHistorique(map);
        setLoadingHisto(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, affaire.id]);

  // Renforts : employés ayant déjà metier_id en assignation cette semaine
  const renfortMetiersByEmploye = useMemo(() => {
    const map = new Map<string, Set<number>>();
    assignations.forEach((a) => {
      const set = map.get(a.employe_id) ?? new Set();
      set.add(a.metier_id);
      map.set(a.employe_id, set);
    });
    return map;
  }, [assignations]);

  // Charge semaine par employé (heures totales déjà assignées)
  const chargeByEmploye = useMemo(() => {
    const map = new Map<string, number>();
    assignations.forEach((a) => {
      map.set(a.employe_id, (map.get(a.employe_id) ?? 0) + Number(a.heures || 0));
    });
    return map;
  }, [assignations]);

  // Conflits sur la cellule cible
  const conflictByEmploye = useMemo(() => {
    const map = new Map<string, Set<string>>();
    assignations.forEach((a) => {
      if (a.date !== dateStr) return;
      const set = map.get(a.employe_id) ?? new Set();
      set.add(a.demi_journee);
      map.set(a.employe_id, set);
    });
    return map;
  }, [assignations, dateStr]);

  const scored = useMemo<Scored[]>(() => {
    if (metierId == null) return [];
    return employes
      .map((e) => {
        const breakdown: ScoreBreakdown = { metier: 0, dispo: 0, histo: 0, charge: 0 };
        let metierMatch: Scored["metierMatch"] = "autre";

        // 1. Métier
        if (e.metier_principal_id === metierId) {
          breakdown.metier = 100;
          metierMatch = "principal";
        } else {
          const rset = renfortMetiersByEmploye.get(e.id);
          if (rset && rset.has(metierId)) {
            breakdown.metier = 35;
            metierMatch = "renfort";
          }
        }

        // 2. Disponibilité (absence + conflit slot)
        const abs = findAbsence(absences, e.id, dateStr, slot);
        let blocked: Scored["blocked"] = null;
        if (abs && abs.valide) {
          blocked = { kind: "absence", label: `Absence (${ABSENCE_LABEL[abs.type]})` };
        }
        const occupied = conflictByEmploye.get(e.id);
        if (!blocked && occupied) {
          const conflict =
            slot === "JOURNEE"
              ? occupied.size > 0
              : occupied.has("JOURNEE") || occupied.has(slot);
          if (conflict) blocked = { kind: "conflict", label: "Déjà assigné sur ce créneau" };
        }
        if (!blocked) breakdown.dispo = 40;

        // 3. Historique chantier (borné, ln pour éviter saturation)
        const histo = historique.get(e.id);
        const histoNbChantiers = histo?.nb_jours_distincts ?? 0;
        const histoNbDemi = histo?.nb_demi_jours ?? 0;
        if (histo && histoNbDemi > 0) {
          breakdown.histo = Math.round(Math.min(40, 5 + Math.log(histoNbDemi + 1) * 8));
        }

        // 4. Charge semaine (moins = mieux ; pénalité max -20)
        const heuresSemaine = chargeByEmploye.get(e.id) ?? 0;
        breakdown.charge = -Math.round(Math.min(20, heuresSemaine * 0.5));

        const score =
          breakdown.metier + breakdown.dispo + breakdown.histo + breakdown.charge;

        return {
          employe: e,
          score,
          breakdown,
          metierMatch,
          histoNbChantiers,
          histoNbDemi,
          heuresSemaine,
          blocked,
        };
      })
      .sort((a, b) => {
        // Bloqués en bas, puis tri explicable : métier > dispo > histo > -charge
        if (!!a.blocked !== !!b.blocked) return a.blocked ? 1 : -1;
        if (b.breakdown.metier !== a.breakdown.metier) return b.breakdown.metier - a.breakdown.metier;
        if (b.breakdown.dispo !== a.breakdown.dispo) return b.breakdown.dispo - a.breakdown.dispo;
        if (b.breakdown.histo !== a.breakdown.histo) return b.breakdown.histo - a.breakdown.histo;
        if (b.breakdown.charge !== a.breakdown.charge) return b.breakdown.charge - a.breakdown.charge;
        return b.score - a.score;
      });
  }, [
    employes,
    metierId,
    renfortMetiersByEmploye,
    absences,
    dateStr,
    slot,
    conflictByEmploye,
    historique,
    chargeByEmploye,
  ]);

  const filteredScored = useMemo(() => {
    const q = breakdownSearch.trim().toLowerCase();
    return scored
      .map((s, idx) => ({ scored: s, rank: idx + 1 }))
      .filter(({ scored: s }) => {
        if (q && !`${s.employe.prenom} ${s.employe.nom}`.toLowerCase().includes(q)) return false;
        if (breakdownMetierFilter !== "all" && s.employe.metier_principal_id !== Number(breakdownMetierFilter)) return false;
        if (breakdownContratFilter !== "all" && s.employe.type_contrat !== breakdownContratFilter) return false;
        if (breakdownDispoFilter === "dispo" && s.blocked) return false;
        if (breakdownDispoFilter === "bloque" && !s.blocked) return false;
        return true;
      });
  }, [scored, breakdownSearch, breakdownMetierFilter, breakdownContratFilter, breakdownDispoFilter]);

  // Options dérivées pour les filtres du breakdown
  const breakdownMetierOptions = useMemo(() => {
    const ids = new Set(scored.map((s) => s.employe.metier_principal_id).filter(Boolean));
    return Array.from(ids)
      .map((id) => metiers.find((m) => m.id === id))
      .filter(Boolean)
      .sort((a, b) => (a?.libelle ?? "").localeCompare(b?.libelle ?? ""));
  }, [scored, metiers]);

  const breakdownContratOptions = useMemo(() => {
    const vals = new Set(scored.map((s) => s.employe.type_contrat));
    return Array.from(vals).sort();
  }, [scored]);

  const eligibleTop = scored.filter((s) => !s.blocked).slice(0, 10);
  const blocked = scored.filter((s) => s.blocked);

  const selectedMetier = metierOptions.find((m) => m.id === metierId);
  const devisIdForInsert = selectedMetier?.devisIds[0] ?? null;

  async function handleStaffer(s: Scored) {
    if (s.blocked || metierId == null) return;
    setSavingId(s.employe.id);
    try {
      const { error } = await insertAssignationsBatch([
        {
          affaire_id: affaire.id,
          employe_id: s.employe.id,
          metier_id: metierId,
          devis_id: devisIdForInsert,
          date: dateStr,
          demi_journee: slot,
          heures,
          notes: null,
        },
      ]);
      if (error) throw error;
      toast.success(`${s.employe.prenom} ${s.employe.nom} staffé`);
      // Re-fetch ciblé sidebar (instantané)
      void onConsommationChanged();
      // Refresh complet en background
      onSaved();
    } catch (e) {
      console.error(e);
      toast.error(...formatBusinessError(e));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Staffer {affaire.numero}
          </DialogTitle>
          <DialogDescription>
            {affaire.nom}
            {affaire.client && <span className="text-muted-foreground"> · {affaire.client}</span>}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Métier (poste devisé)</Label>
            <Select
              value={metierId != null ? String(metierId) : ""}
              onValueChange={(v) => setMetierId(Number(v))}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Choisir un métier…" />
              </SelectTrigger>
              <SelectContent>
                {metierOptions.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    Aucun poste devisé sur cette affaire.
                  </div>
                ) : (
                  metierOptions.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      <span className="flex items-center justify-between gap-2">
                        <span>{m.libelle}</span>
                        <span
                          className={cn(
                            "text-[10px] font-mono",
                            m.restantes > 0 ? "text-foreground" : "text-destructive",
                          )}
                        >
                          {m.restantes > 0 ? `${m.restantes.toFixed(0)}h restantes` : "complet"}
                        </span>
                      </span>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Date</Label>
            <Input
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className="h-9"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Créneau</Label>
            <Select value={slot} onValueChange={(v) => setSlot(v as Slot)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="JOURNEE">Journée (8h)</SelectItem>
                <SelectItem value="AM">Matin (4h)</SelectItem>
                <SelectItem value="PM">Après-midi (4h)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="-mb-1 flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <UserCheck className="h-3.5 w-3.5" />
            {loadingHisto ? "Calcul des suggestions…" : `${eligibleTop.length} suggestion${eligibleTop.length > 1 ? "s" : ""}`}
            {blocked.length > 0 && (
              <span className="text-[10px] italic opacity-70">
                · {blocked.length} non dispo
              </span>
            )}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] hover:bg-muted"
                  aria-label="Détail du score"
                >
                  <Info className="h-3 w-3" /> score
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 text-xs">
                <p className="mb-2 font-semibold">Comment on classe les employés</p>
                <ol className="space-y-1.5 text-muted-foreground">
                  <li><span className="font-mono text-foreground">1. Métier</span> · principal +100 / renfort +35</li>
                  <li><span className="font-mono text-foreground">2. Dispo</span> · libre sur le créneau +40 (sinon bloqué)</li>
                  <li><span className="font-mono text-foreground">3. Histo</span> · jusqu'à +40 si déjà bossé sur l'affaire</li>
                  <li><span className="font-mono text-foreground">4. Charge</span> · jusqu'à −20 si déjà chargé cette semaine</li>
                </ol>
                <p className="mt-2 text-[10px] italic">
                  Ordre : Métier &gt; Dispo &gt; Histo &gt; Charge faible &gt; score total.
                </p>
              </PopoverContent>
            </Popover>
          </span>
          <span className="text-[10px]">
            {format(new Date(dateStr), "EEEE d MMM", { locale: fr })} · {slot === "JOURNEE" ? "Journée" : slot} · {heures}h
          </span>
        </div>

        <ScrollArea className="h-[380px] rounded-md border">
          {metierId == null ? (
            <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
              Choisis un métier pour afficher les suggestions.
            </div>
          ) : eligibleTop.length === 0 && !loadingHisto ? (
            <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
              Aucun employé disponible sur ce créneau pour ce métier.
            </div>
          ) : (
            <ul className="divide-y">
              {eligibleTop.map((s, idx) => (
                <SuggestionRow
                  key={s.employe.id}
                  rank={idx + 1}
                  scored={s}
                  metier={metiers.find((m) => m.id === s.employe.metier_principal_id)}
                  onStaffer={() => handleStaffer(s)}
                  saving={savingId === s.employe.id}
                  disabled={savingId !== null}
                />
              ))}
              {blocked.length > 0 && (
                <li className="bg-muted/30 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Non disponibles
                </li>
              )}
              {blocked.map((s) => (
                <SuggestionRow
                  key={s.employe.id}
                  scored={s}
                  metier={metiers.find((m) => m.id === s.employe.metier_principal_id)}
                  onStaffer={() => {}}
                  saving={false}
                  disabled
                />
              ))}
            </ul>
          )}
        </ScrollArea>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBreakdownOpen(true)}
            className="gap-1.5"
          >
            <List className="h-3.5 w-3.5" />
            Voir le détail complet
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Breakdown audit modal */}
      <Dialog open={breakdownOpen} onOpenChange={setBreakdownOpen}>
        <DialogContent className="max-w-5xl p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle className="flex items-center gap-2 text-base">
              <List className="h-4 w-4 text-primary" />
              Breakdown du classement — {affaire.numero}
            </DialogTitle>
            <DialogDescription>
              {affaire.nom}
              {selectedMetier ? ` · ${selectedMetier.libelle}` : ""}
              {` · ${format(new Date(dateStr), "EEEE d MMM", { locale: fr })} · ${slot === "JOURNEE" ? "Journée" : slot}`}
            </DialogDescription>
          </DialogHeader>

          {/* Barre de filtres */}
          <div className="flex flex-wrap items-center gap-2 border-b px-6 py-3">
            <div className="relative flex-1 basis-[220px]">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Rechercher un employé…"
                value={breakdownSearch}
                onChange={(e) => setBreakdownSearch(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>
            <Select value={breakdownMetierFilter} onValueChange={setBreakdownMetierFilter}>
              <SelectTrigger className="h-8 w-[160px] text-xs">
                <SelectValue placeholder="Métier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les métiers</SelectItem>
                {breakdownMetierOptions.map((m) => (
                  <SelectItem key={m!.id} value={String(m!.id)}>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: m!.couleur ?? "#94a3b8" }} />
                      {m!.libelle}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={breakdownContratFilter} onValueChange={setBreakdownContratFilter}>
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue placeholder="Contrat" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous contrats</SelectItem>
                {breakdownContratOptions.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1 rounded-md border p-0.5">
              {(["all", "dispo", "bloque"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setBreakdownDispoFilter(v)}
                  className={cn(
                    "rounded px-2 py-1 text-[10px] font-medium transition-colors",
                    breakdownDispoFilter === v
                      ? v === "bloque"
                        ? "bg-destructive/10 text-destructive"
                        : v === "dispo"
                          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                          : "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {v === "all" ? "Tous" : v === "dispo" ? "Dispo" : "Bloqué"}
                </button>
              ))}
            </div>
            {(breakdownSearch || breakdownMetierFilter !== "all" || breakdownContratFilter !== "all" || breakdownDispoFilter !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-[10px] text-muted-foreground"
                onClick={() => {
                  setBreakdownSearch("");
                  setBreakdownMetierFilter("all");
                  setBreakdownContratFilter("all");
                  setBreakdownDispoFilter("all");
                }}
              >
                <X className="mr-1 h-3 w-3" />
                Réinitialiser
              </Button>
            )}
          </div>

          <ScrollArea className="max-h-[55vh] px-6">
            <div className="py-2 text-[10px] text-muted-foreground">
              {filteredScored.length} affiché(s) sur {scored.length}
            </div>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10 text-center">#</TableHead>
                  <TableHead>Employé</TableHead>
                  <TableHead className="text-right">Métier</TableHead>
                  <TableHead className="text-right">Dispo</TableHead>
                  <TableHead className="text-right">Histo</TableHead>
                  <TableHead className="text-right">Charge</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Semaine</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredScored.map(({ scored: s, rank }) => {
                  const empMetier = metiers.find((m) => m.id === s.employe.metier_principal_id);
                  return (
                    <TableRow
                      key={s.employe.id}
                      className={cn(s.blocked && "opacity-50")}
                    >
                      <TableCell className="text-center font-mono text-xs">{rank}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: empMetier?.couleur ?? "#94a3b8" }}
                          />
                          <div>
                            <div className="text-sm font-medium">
                              {s.employe.prenom} {s.employe.nom}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {s.employe.type_contrat} · {empMetier?.libelle ?? "—"}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <BreakdownCell
                          value={s.breakdown.metier}
                          detail={
                            s.metierMatch === "principal"
                              ? "principal"
                              : s.metierMatch === "renfort"
                                ? "renfort"
                                : "—"
                          }
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <BreakdownCell
                          value={s.breakdown.dispo}
                          detail={s.blocked ? s.blocked.label : "libre"}
                          muted={s.breakdown.dispo === 0}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <BreakdownCell
                          value={s.breakdown.histo}
                          detail={s.histoNbDemi > 0 ? `${s.histoNbDemi} ½j` : "—"}
                          muted={s.breakdown.histo === 0}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <BreakdownCell
                          value={s.breakdown.charge}
                          detail={`${s.heuresSemaine.toFixed(0)}h`}
                          muted={s.breakdown.charge === 0}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={cn(
                            "font-mono text-sm font-semibold",
                            s.score > 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : s.score < 0
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-muted-foreground",
                          )}
                        >
                          {s.score}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {s.heuresSemaine.toFixed(0)}h
                      </TableCell>
                      <TableCell>
                        {s.blocked ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-destructive">
                            <CalendarOff className="h-3 w-3" />
                            {s.blocked.label}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                            <UserCheck className="h-3 w-3" />
                            Disponible
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredScored.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-6 text-center text-sm text-muted-foreground">
                      Aucun employé ne correspond aux filtres.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>

          <DialogFooter className="px-6 pb-6">
            <Button variant="ghost" size="sm" onClick={() => setBreakdownOpen(false)}>
              <X className="mr-1.5 h-3.5 w-3.5" />
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

interface RowProps {
  rank?: number;
  scored: Scored;
  metier?: Metier;
  onStaffer: () => void;
  saving: boolean;
  disabled: boolean;
}

function SuggestionRow({ rank, scored: s, metier, onStaffer, saving, disabled }: RowProps) {
  return (
    <li
      className={cn(
        "flex items-center justify-between gap-3 px-3 py-2 text-sm",
        s.blocked && "opacity-60",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {rank != null && (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-[10px] font-semibold text-primary">
            {rank}
          </span>
        )}
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: metier?.couleur ?? "#94a3b8" }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate font-medium">
              {s.employe.prenom} {s.employe.nom}
            </span>
            <span className="rounded bg-muted px-1 text-[9px] font-mono uppercase tracking-wide text-muted-foreground">
              {s.employe.type_contrat}
            </span>
            {s.metierMatch === "principal" && (
              <Badge variant="default" className="h-4 px-1 text-[9px]">
                {metier?.libelle ?? "Métier"}
              </Badge>
            )}
            {s.metierMatch === "renfort" && (
              <Badge variant="secondary" className="h-4 px-1 text-[9px]">
                Renfort
              </Badge>
            )}
            {s.histoNbDemi > 0 && (
              <Badge variant="outline" className="h-4 gap-0.5 px-1 text-[9px]">
                <History className="h-2.5 w-2.5" /> {s.histoNbDemi}½j
              </Badge>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
            <ScoreChip label="Métier" value={s.breakdown.metier} tone={s.breakdown.metier > 0 ? "good" : "muted"} />
            <ScoreChip label="Dispo" value={s.breakdown.dispo} tone={s.breakdown.dispo > 0 ? "good" : "bad"} />
            <ScoreChip label="Histo" value={s.breakdown.histo} tone={s.breakdown.histo > 0 ? "good" : "muted"} />
            <ScoreChip label="Charge" value={s.breakdown.charge} tone={s.breakdown.charge < 0 ? "warn" : "muted"} />
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="ml-0.5 inline-flex items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary hover:bg-primary/20"
                  aria-label="Détail du score"
                >
                  = {s.score} <Info className="h-2.5 w-2.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 text-xs">
                <p className="mb-2 font-semibold">
                  {s.employe.prenom} {s.employe.nom} · score {s.score}
                </p>
                <ScoreLine label="Métier" value={s.breakdown.metier} detail={
                  s.metierMatch === "principal" ? "principal" : s.metierMatch === "renfort" ? "renfort" : "—"
                } />
                <ScoreLine label="Dispo" value={s.breakdown.dispo} detail={
                  s.blocked ? s.blocked.label : "libre sur le créneau"
                } />
                <ScoreLine label="Histo" value={s.breakdown.histo} detail={
                  s.histoNbDemi > 0 ? `${s.histoNbDemi} ½j sur l'affaire` : "jamais bossé ici"
                } />
                <ScoreLine label="Charge" value={s.breakdown.charge} detail={
                  `${s.heuresSemaine.toFixed(0)}h cette semaine`
                } />
              </PopoverContent>
            </Popover>
            <span className="ml-auto inline-flex items-center gap-0.5">
              <Clock className="h-2.5 w-2.5" /> {s.heuresSemaine.toFixed(0)}h cette semaine
            </span>
            {s.blocked && (
              <span className="inline-flex items-center gap-0.5 text-destructive">
                <CalendarOff className="h-2.5 w-2.5" /> {s.blocked.label}
              </span>
            )}
          </div>
        </div>
      </div>
      <Button
        size="sm"
        onClick={onStaffer}
        disabled={disabled || !!s.blocked}
        className="h-7 shrink-0 px-2 text-xs"
      >
        {saving ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <>
            <Check className="mr-1 h-3.5 w-3.5" />
            Staffer
          </>
        )}
      </Button>
    </li>
  );
}

type ChipTone = "good" | "bad" | "warn" | "muted";

function ScoreChip({ label, value, tone }: { label: string; value: number; tone: ChipTone }) {
  const cls =
    tone === "good"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : tone === "bad"
        ? "bg-destructive/10 text-destructive"
        : tone === "warn"
          ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
          : "bg-muted text-muted-foreground";
  const sign = value > 0 ? `+${value}` : `${value}`;
  return (
    <span className={cn("inline-flex items-center gap-0.5 rounded px-1 py-0.5 font-mono text-[10px]", cls)}>
      {label} <span className="font-semibold">{sign}</span>
    </span>
  );
}

function ScoreLine({ label, value, detail }: { label: string; value: number; detail: string }) {
  const sign = value > 0 ? `+${value}` : `${value}`;
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span>
        <span className="font-semibold">{label}</span>{" "}
        <span className="text-muted-foreground">· {detail}</span>
      </span>
      <span
        className={cn(
          "font-mono text-[11px] font-semibold",
          value > 0 ? "text-emerald-600 dark:text-emerald-400" : value < 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
        )}
      >
        {sign}
      </span>
    </div>
  );
}

function BreakdownCell({
  value,
  detail,
  muted,
}: {
  value: number;
  detail: string;
  muted?: boolean;
}) {
  const sign = value > 0 ? `+${value}` : `${value}`;
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span
        className={cn(
          "font-mono text-xs font-semibold",
          value > 0
            ? "text-emerald-600 dark:text-emerald-400"
            : value < 0
              ? "text-amber-600 dark:text-amber-400"
              : "text-muted-foreground",
        )}
      >
        {sign}
      </span>
      <span className={cn("text-[10px] text-muted-foreground", muted && "opacity-60")}>{detail}</span>
    </div>
  );
}
