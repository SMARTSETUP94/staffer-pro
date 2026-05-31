/**
 * v0.21.0 Bloc 2 — Modale "+ Staffer en bulk".
 *
 * Permet de staffer N employés × N jours sur une affaire donnée (+ lot
 * optionnel) en une fois, avec aperçu et skip auto des cellules occupées.
 *
 * Cas type : "Tous les menuisiers, lundi-mardi-mercredi, sur l'affaire 5943,
 * en journée" → 3 clics + valider.
 */
import { useEffect, useMemo, useState } from "react";
import { addDays, format } from "date-fns";
import { fr } from "date-fns/locale";
import { AlertTriangle, Calendar as CalIcon, Loader2, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { formatBusinessError } from "@/lib/business-errors";
import { useVocab } from "@/hooks/use-vocab";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AffaireCombobox } from "./AffaireCombobox";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { isAffaireSelectable } from "@/lib/affaire-lock";
import {
  computeBulkPreview,
  HEURES_DEFAULT,
  plannedToCreate,
  type Slot,
} from "@/lib/bulk-staffer";
import type {
  Affaire,
  Assignation,
  DevisLot,
  Employe,
  Metier,
} from "@/hooks/use-planning-data";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weekStart: Date;
  employes: Employe[];
  affaires: Affaire[];
  metiers: Metier[];
  devisLots: DevisLot[];
  assignations: Assignation[];
  onSaved: () => void;
}

export function BulkStafferDialog({
  open,
  onOpenChange,
  weekStart,
  employes,
  affaires,
  metiers,
  devisLots,
  assignations,
  onSaved,
}: Props) {
  const vocab = useVocab();
  // état formulaire
  const [affaireId, setAffaireId] = useState<string>("");
  const [devisId, setDevisId] = useState<string>("");
  const [metierId, setMetierId] = useState<number | null>(null);
  const [slot, setSlot] = useState<Slot>("JOURNEE");
  const [selectedEmployes, setSelectedEmployes] = useState<Set<string>>(new Set());
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [employeFilter, setEmployeFilter] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  // décalage de semaine (flèches scroller)
  const [weekOffset, setWeekOffset] = useState(0);

  // reset à l'ouverture
  useEffect(() => {
    if (!open) return;
    setAffaireId("");
    setDevisId("");
    setMetierId(null);
    setSlot("JOURNEE");
    setSelectedEmployes(new Set());
    setSelectedDates(new Set());
    setEmployeFilter("");
    setShowPreview(false);
    setWeekOffset(0);
  }, [open]);

  // Affaires sélectionnables (ouvertes uniquement, via helper Bloc 4)
  const affairesOuvertes = useMemo(
    () =>
      affaires
        .filter(isAffaireSelectable)
        .sort((a, b) => a.numero.localeCompare(b.numero, "fr", { numeric: true })),
    [affaires],
  );

  // Lots devis pour l'affaire choisie
  const lotsForAffaire = useMemo(
    () => devisLots.filter((l) => l.affaire_id === affaireId),
    [devisLots, affaireId],
  );

  // Employés filtrés (recherche + groupés par métier)
  const employesFiltered = useMemo(() => {
    const q = employeFilter.trim().toLowerCase();
    return employes.filter((e) =>
      q === ""
        ? true
        : `${e.prenom} ${e.nom} ${e.sous_type_contrat ?? ""} ${e.agence_interim ?? ""}`
            .toLowerCase()
            .includes(q),
    );
  }, [employes, employeFilter]);

  const groupedByMetier = useMemo(() => {
    const byMetier = new Map<number, Employe[]>();
    for (const e of employesFiltered) {
      const arr = byMetier.get(e.metier_principal_id) ?? [];
      arr.push(e);
      byMetier.set(e.metier_principal_id, arr);
    }
    return metiers
      .filter((m) => byMetier.has(m.id))
      .map((m) => ({ metier: m, emps: byMetier.get(m.id) ?? [] }));
  }, [employesFiltered, metiers]);

  // Jours affichés (semaine courante + offset, 7 jours)
  const days = useMemo(() => {
    const start = addDays(weekStart, weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [weekStart, weekOffset]);

  // Calcul aperçu
  const preview = useMemo(() => {
    if (!showPreview) return [];
    return computeBulkPreview({
      employeIds: Array.from(selectedEmployes),
      dates: Array.from(selectedDates).sort(),
      slot,
      existing: assignations.map((a) => ({
        employe_id: a.employe_id,
        date: a.date,
        demi_journee: a.demi_journee,
      })),
    });
  }, [showPreview, selectedEmployes, selectedDates, slot, assignations]);

  const previewToCreate = useMemo(() => plannedToCreate(preview), [preview]);
  const previewSkipped = preview.length - previewToCreate.length;

  // helpers UI
  function toggleEmploye(id: string) {
    setSelectedEmployes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleDate(d: string) {
    setSelectedDates((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  }

  function selectAllCDI() {
    const ids = employes
      .filter((e) => e.type_contrat === "CDI" || e.type_contrat === "CDD")
      .map((e) => e.id);
    setSelectedEmployes(new Set(ids));
  }
  function selectAllInterim() {
    const ids = employes
      .filter((e) => e.type_contrat === "Interim" || e.type_contrat === "Independant")
      .map((e) => e.id);
    setSelectedEmployes(new Set(ids));
  }
  function selectMetier(metierId: number) {
    setSelectedEmployes((prev) => {
      const next = new Set(prev);
      employes
        .filter((e) => e.metier_principal_id === metierId)
        .forEach((e) => next.add(e.id));
      return next;
    });
  }

  // métier auto = celui de la majorité des sélectionnés (si non défini)
  useEffect(() => {
    if (metierId !== null) return;
    if (selectedEmployes.size === 0) return;
    const counts = new Map<number, number>();
    for (const id of selectedEmployes) {
      const e = employes.find((x) => x.id === id);
      if (!e) continue;
      counts.set(e.metier_principal_id, (counts.get(e.metier_principal_id) ?? 0) + 1);
    }
    let best: number | null = null;
    let bestN = 0;
    counts.forEach((n, m) => {
      if (n > bestN) {
        bestN = n;
        best = m;
      }
    });
    if (best !== null) setMetierId(best);
  }, [selectedEmployes, employes, metierId]);

  function canPreview(): boolean {
    return (
      affaireId !== "" &&
      metierId !== null &&
      selectedEmployes.size > 0 &&
      selectedDates.size > 0
    );
  }

  async function handleConfirm() {
    if (previewToCreate.length === 0) {
      toast.error("Aucune cellule à créer");
      return;
    }
    setSaving(true);
    const heures = HEURES_DEFAULT[slot];
    const payloads = previewToCreate.map((p) => ({
      employe_id: p.employe_id,
      date: p.date,
      affaire_id: affaireId,
      metier_id: metierId!,
      devis_id: devisId || null,
      demi_journee: p.demi_journee,
      heures,
      notes: null,
    }));
    const { error } = await insertAssignationsBatch(payloads);
    setSaving(false);
    if (error) {
      toast.error(...formatBusinessError(error));
      return;
    }
    toast.success(
      `${previewToCreate.length} affectation(s) créée(s)${previewSkipped > 0 ? ` (${previewSkipped} skippée(s))` : ""}`,
    );
    onSaved();
    onOpenChange(false);
  }

  const employesById = useMemo(
    () => new Map(employes.map((e) => [e.id, e])),
    [employes],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            {vocab.assignerEnLot}
          </DialogTitle>
          <DialogDescription>
            Affecte plusieurs employés sur plusieurs jours d'un même chantier en une fois.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {!showPreview ? (
            <>
              {/* Affaire + lot */}
              <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Affaire *</Label>
                  <AffaireCombobox
                    affaires={affairesOuvertes}
                    value={affaireId}
                    onChange={(v) => {
                      setAffaireId(v);
                      setDevisId("");
                    }}
                  />
                </div>
                {lotsForAffaire.length > 0 && (
                  <div className="grid gap-1.5">
                    <Label>Lot devis (optionnel)</Label>
                    <Select value={devisId || "none"} onValueChange={(v) => setDevisId(v === "none" ? "" : v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Aucun lot" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Aucun —</SelectItem>
                        {lotsForAffaire.map((l) => (
                          <SelectItem key={l.id} value={l.id}>
                            {l.numero}
                            {l.libelle ? ` — ${l.libelle}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Métier + créneau */}
              <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Métier mobilisé *</Label>
                  <Select
                    value={metierId?.toString() ?? ""}
                    onValueChange={(v) => setMetierId(Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Métier" />
                    </SelectTrigger>
                    <SelectContent>
                      {metiers.map((m) => (
                        <SelectItem key={m.id} value={m.id.toString()}>
                          <span
                            className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                            style={{ backgroundColor: m.couleur }}
                          />
                          {m.libelle}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Créneau</Label>
                  <Tabs value={slot} onValueChange={(v) => setSlot(v as Slot)}>
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="JOURNEE">Journée (8h)</TabsTrigger>
                      <TabsTrigger value="AM">Matin (4h)</TabsTrigger>
                      <TabsTrigger value="PM">Après-midi (4h)</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </div>

              {/* Employés */}
              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <Label className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" /> Employés ({selectedEmployes.size})
                  </Label>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={selectAllCDI}>Tous CDI</Button>
                    <Button size="sm" variant="ghost" onClick={selectAllInterim}>Tous Intermittent</Button>
                    <Button size="sm" variant="ghost" onClick={() => setSelectedEmployes(new Set())}>Aucun</Button>
                  </div>
                </div>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher un employé…"
                    value={employeFilter}
                    onChange={(e) => setEmployeFilter(e.target.value)}
                    className="h-8 pl-7 text-xs"
                  />
                </div>
                <ScrollArea className="h-48">
                  <div className="space-y-2 pr-2">
                    {groupedByMetier.map(({ metier, emps }) => (
                      <div key={metier.id}>
                        <button
                          type="button"
                          onClick={() => selectMetier(metier.id)}
                          className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                          title="Sélectionner tous"
                        >
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{ backgroundColor: metier.couleur }}
                          />
                          {metier.libelle} ({emps.length})
                        </button>
                        <div className="ml-3 mt-1 grid grid-cols-2 gap-1">
                          {emps.map((e) => (
                            <label
                              key={e.id}
                              className="flex cursor-pointer items-center gap-1.5 rounded p-1 text-xs hover:bg-muted/50"
                            >
                              <Checkbox
                                checked={selectedEmployes.has(e.id)}
                                onCheckedChange={() => toggleEmploye(e.id)}
                              />
                              <span>
                                {e.prenom} {e.nom}
                              </span>
                              <Badge variant="outline" className="ml-auto h-4 text-[9px]">
                                {e.type_contrat}
                              </Badge>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {/* Jours */}
              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5">
                    <CalIcon className="h-3.5 w-3.5" /> Jours ({selectedDates.size})
                  </Label>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setWeekOffset((o) => o - 1)}>‹</Button>
                    <span className="text-[10px] text-muted-foreground">
                      Semaine du {format(days[0], "dd/MM", { locale: fr })}
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => setWeekOffset((o) => o + 1)}>›</Button>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {days.map((d) => {
                    const ds = format(d, "yyyy-MM-dd");
                    const isSel = selectedDates.has(ds);
                    const isWE = d.getDay() === 0 || d.getDay() === 6;
                    return (
                      <button
                        key={ds}
                        type="button"
                        onClick={() => toggleDate(ds)}
                        className={cn(
                          "rounded border p-1.5 text-center text-[11px] transition-colors",
                          isSel
                            ? "border-primary bg-primary/15 font-semibold"
                            : "border-border hover:bg-muted/50",
                          isWE && !isSel && "bg-muted/30 text-muted-foreground",
                        )}
                      >
                        <div className="uppercase">{format(d, "EEE", { locale: fr })}</div>
                        <div className="font-mono">{format(d, "dd/MM")}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            /* Aperçu */
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  <div>
                    <span className="text-muted-foreground">Affaire :</span>{" "}
                    <strong>
                      {affaires.find((a) => a.id === affaireId)?.numero} —{" "}
                      {affaires.find((a) => a.id === affaireId)?.nom}
                    </strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Créneau :</span>{" "}
                    <strong>
                      {slot === "JOURNEE" ? "Journée (8h)" : slot === "AM" ? "Matin (4h)" : "Après-midi (4h)"}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold">
                  {previewToCreate.length} affectation(s) à créer
                </span>
                {previewSkipped > 0 && (
                  <span className="flex items-center gap-1 text-warning text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {previewSkipped} cellule(s) déjà occupée(s) — skippée(s)
                  </span>
                )}
              </div>

              <ScrollArea className="h-72 rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                    <tr>
                      <th className="p-2 text-left">Employé</th>
                      <th className="p-2 text-left">Date</th>
                      <th className="p-2 text-left">Créneau</th>
                      <th className="p-2 text-left">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {preview.map((p, i) => {
                      const emp = employesById.get(p.employe_id);
                      return (
                        <tr
                          key={`${p.employe_id}::${p.date}::${i}`}
                          className={cn(p.skipped && "bg-amber-500/10")}
                        >
                          <td className="p-2">
                            {emp ? `${emp.prenom} ${emp.nom}` : p.employe_id}
                          </td>
                          <td className="p-2 font-mono">{format(new Date(p.date), "EEE dd/MM", { locale: fr })}</td>
                          <td className="p-2">{p.demi_journee}</td>
                          <td className="p-2">
                            {p.skipped ? (
                              <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400">
                                <AlertTriangle className="h-3 w-3" />
                                {p.skipReason}
                              </span>
                            ) : (
                              <span className="text-emerald-700 dark:text-emerald-400">À créer</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter>
          {!showPreview ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Annuler
              </Button>
              <Button onClick={() => setShowPreview(true)} disabled={!canPreview()}>
                Aperçu {selectedEmployes.size * selectedDates.size} affectation(s)
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setShowPreview(false)} disabled={saving}>
                Retour
              </Button>
              <Button onClick={handleConfirm} disabled={saving || previewToCreate.length === 0}>
                {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Confirmer {previewToCreate.length} affectation(s)
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
