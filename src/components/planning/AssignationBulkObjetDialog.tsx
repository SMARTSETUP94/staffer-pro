/**
 * v0.29.0 — AssignationBulkObjetDialog.
 *
 * Staffe N employés × N jours sur un objet de fabrication précis, avec :
 *  - choix du métier (parmi ceux où objet.heures_prevues_X > 0)
 *  - filtrage employés par métier_principal + flag rôle
 *  - calcul heures par jour (créneau JOURNEE/AM/PM)
 *  - récap budget vivant (vert/jaune/rouge)
 */
import { useEffect, useMemo, useState } from "react";
import { addDays, format } from "date-fns";
import { fr } from "date-fns/locale";
import { Calendar as CalIcon, Loader2, Search, Users } from "lucide-react";
import { toast } from "sonner";
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
import { cn } from "@/lib/utils";
import { normalizeName } from "@/lib/string-normalize";
import type { Slot } from "@/lib/bulk-staffer";
import {
  budgetStatus,
  computeTotalHeures,
  employesForMetier,
  heuresDejaStaffeesForObjet,
  heuresForSlot,
  heuresPrevuesForMetier,
  metiersDisponiblesForObjet,
  autoSuggestMetier,
  type EmployeForBulk,
} from "@/lib/bulk-objet-helpers";
import type {
  Assignation,
  Employe,
  Metier,
} from "@/hooks/use-planning-data";
import { useBulkAssignObjet } from "@/hooks/use-bulk-assign-objet";

export interface BulkObjetForDialog {
  id: string;
  affaire_id: string;
  reference: string;
  nom: string;
  raw: {
    heures_prevues_be?: number | null;
    heures_prevues_numerique?: number | null;
    heures_prevues_bois?: number | null;
    heures_prevues_metal?: number | null;
    heures_prevues_peinture?: number | null;
    heures_prevues_tapisserie?: number | null;
    heures_prevues_manutention?: number | null;
    quantite?: number | null;
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  objet: BulkObjetForDialog | null;
  weekStart: Date;
  showWeekend: boolean;
  employes: Employe[];
  metiers: Metier[];
  /** Toutes les assignations chargées sur la semaine (pour budget déjà-staffé). */
  assignations: Assignation[];
  /** Liens assignation_objets (pour budget déjà-staffé). */
  links: ReadonlyArray<{ assignation_id: string; objet_id: string }>;
  onSaved: () => void;
}

export function AssignationBulkObjetDialog({
  open,
  onOpenChange,
  objet,
  weekStart,
  showWeekend,
  employes,
  metiers,
  assignations,
  links,
  onSaved,
}: Props) {
  const vocab = useVocab();
  const [metierId, setMetierId] = useState<number | null>(null);
  const [slot, setSlot] = useState<Slot>("JOURNEE");
  const [heuresParJour, setHeuresParJour] = useState(8);
  const [selectedEmployes, setSelectedEmployes] = useState<Set<string>>(new Set());
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [employeFilter, setEmployeFilter] = useState("");

  const mutation = useBulkAssignObjet();

  const metiersDispo = useMemo(
    () => (objet ? metiersDisponiblesForObjet(objet.raw, metiers) : []),
    [objet, metiers],
  );

  // Reset à l'ouverture + auto-suggest métier
  useEffect(() => {
    if (!open) return;
    setSelectedEmployes(new Set());
    setSelectedDates(new Set());
    setEmployeFilter("");
    setSlot("JOURNEE");
    setHeuresParJour(8);
    setMetierId(autoSuggestMetier(metiersDispo));
  }, [open, metiersDispo]);

  // Quand le slot change, ajuste heures par défaut
  useEffect(() => {
    setHeuresParJour(heuresForSlot(slot));
  }, [slot]);

  const days = useMemo(
    () => Array.from({ length: showWeekend ? 7 : 5 }, (_, i) => addDays(weekStart, i)),
    [weekStart.getTime(), showWeekend],
  );

  const employesEligibles = useMemo<EmployeForBulk[]>(() => {
    if (metierId == null) return [];
    return employesForMetier(employes as unknown as EmployeForBulk[], metierId, metiers);
  }, [employes, metierId, metiers]);

  const employesAffiches = useMemo(() => {
    const q = normalizeName(employeFilter.trim());
    if (!q) return employesEligibles;
    return employesEligibles.filter((e) =>
      normalizeName(`${e.prenom} ${e.nom}`).includes(q),
    );
  }, [employesEligibles, employeFilter]);

  const totalHeures = useMemo(
    () =>
      computeTotalHeures(selectedEmployes.size, selectedDates.size, heuresParJour),
    [selectedEmployes.size, selectedDates.size, heuresParJour],
  );

  const heuresPrevues = useMemo(
    () => (objet && metierId ? heuresPrevuesForMetier(objet.raw, metierId, metiers) : 0),
    [objet, metierId, metiers],
  );

  const heuresDejaStaffees = useMemo(() => {
    if (!objet || metierId == null) return 0;
    return heuresDejaStaffeesForObjet({
      objetId: objet.id,
      metierId,
      links,
      assignations: assignations.map((a) => ({
        id: a.id,
        metier_id: a.metier_id,
        heures: Number(a.heures || 0),
      })),
    });
  }, [objet, metierId, links, assignations]);

  const restant = Math.max(0, heuresPrevues - heuresDejaStaffees);
  const status = budgetStatus({
    totalHeuresAjout: totalHeures,
    heuresDejaStaffees,
    heuresPrevues,
  });

  const totalAssignsACreer = selectedEmployes.size * selectedDates.size;
  const canSubmit =
    metierId != null &&
    selectedEmployes.size > 0 &&
    selectedDates.size > 0 &&
    heuresParJour > 0 &&
    !mutation.isPending;

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

  async function handleSubmit() {
    if (!objet || metierId == null || !canSubmit) return;
    if (status === "danger") {
      const ok = window.confirm(
        `Dépassement de budget supérieur à 20%. Confirmer la création de ${totalAssignsACreer} assignation(s) ?`,
      );
      if (!ok) return;
    }
    const cells: Array<{ employe_id: string; date: string }> = [];
    for (const e of selectedEmployes) {
      for (const d of selectedDates) {
        cells.push({ employe_id: e, date: d });
      }
    }
    try {
      const res = await mutation.mutateAsync({
        affaireId: objet.affaire_id,
        objetId: objet.id,
        metierId,
        slot,
        heuresParJour,
        cells,
      });
      toast.success(`${res.created} assignation${res.created > 1 ? "s" : ""} créée${res.created > 1 ? "s" : ""}`);
      onSaved();
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur inconnue";
      toast.error(`Échec : ${msg}`);
    }
  }

  if (!objet) return null;

  const noMetier = metiersDispo.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            {vocab.assignerEnLot} — {objet.reference} {objet.nom}
          </DialogTitle>
          <DialogDescription>
            Affectez plusieurs employés sur plusieurs jours pour cet objet.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {noMetier ? (
            <div className="rounded-lg border border-dashed border-amber-500 bg-amber-50 p-4 text-sm text-amber-900">
              Cet objet n'a pas d'heures prévues par métier — paramétrer les heures avant de staffer.
            </div>
          ) : (
            <>
              {/* Section 1 — Métier */}
              <div className="grid gap-1.5">
                <Label>Métier mobilisé *</Label>
                <Select
                  value={metierId?.toString() ?? ""}
                  onValueChange={(v) => setMetierId(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir un métier" />
                  </SelectTrigger>
                  <SelectContent>
                    {metiersDispo.map((m) => (
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

              {/* Section 2 — Employés */}
              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <Label className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" /> Employés ({selectedEmployes.size})
                  </Label>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setSelectedEmployes(new Set(employesAffiches.map((e) => e.id)))
                      }
                    >
                      Tous
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedEmployes(new Set())}
                    >
                      Aucun
                    </Button>
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
                <ScrollArea className="h-44">
                  <div className="space-y-1 pr-2">
                    {employesAffiches.length === 0 ? (
                      <div className="py-4 text-center text-xs text-muted-foreground">
                        Aucun employé éligible pour ce métier.
                      </div>
                    ) : (
                      employesAffiches.map((e) => {
                        const metierLib =
                          metiers.find((m) => m.id === e.metier_principal_id)?.libelle ?? "";
                        return (
                          <label
                            key={e.id}
                            className={cn(
                              "flex cursor-pointer items-center gap-2 rounded p-1.5 text-xs hover:bg-muted/50",
                              !e.actif && "opacity-60",
                            )}
                          >
                            <Checkbox
                              checked={selectedEmployes.has(e.id)}
                              onCheckedChange={() => toggleEmploye(e.id)}
                            />
                            <span className="font-medium">
                              {e.prenom} {e.nom}
                            </span>
                            <Badge variant="outline" className="ml-auto h-4 text-[9px]">
                              {metierLib}
                            </Badge>
                          </label>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
              </div>

              {/* Section 3 — Jours */}
              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5">
                    <CalIcon className="h-3.5 w-3.5" /> Jours ({selectedDates.size})
                  </Label>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setSelectedDates(
                          new Set(days.map((d) => format(d, "yyyy-MM-dd"))),
                        )
                      }
                    >
                      Tous
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedDates(new Set())}
                    >
                      Aucun
                    </Button>
                  </div>
                </div>
                <div
                  className={cn(
                    "grid gap-1",
                    showWeekend ? "grid-cols-7" : "grid-cols-5",
                  )}
                >
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

              {/* Section 4 — Heures par jour + créneau */}
              <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Créneau</Label>
                  <Tabs value={slot} onValueChange={(v) => setSlot(v as Slot)}>
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="JOURNEE">Journée</TabsTrigger>
                      <TabsTrigger value="AM">Matin</TabsTrigger>
                      <TabsTrigger value="PM">Après-midi</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                <div className="grid gap-1.5">
                  <Label>Heures par jour *</Label>
                  <Input
                    type="number"
                    min={0.5}
                    max={24}
                    step={0.5}
                    value={heuresParJour}
                    onChange={(e) =>
                      setHeuresParJour(Math.max(0, Number(e.target.value) || 0))
                    }
                  />
                </div>
              </div>

              {/* Section 5 — Récap budget */}
              {metierId != null && (
                <div
                  className={cn(
                    "rounded-lg border p-3 text-sm",
                    status === "ok" && "border-green-500/50 bg-green-50 text-green-900",
                    status === "warn" && "border-amber-500/50 bg-amber-50 text-amber-900",
                    status === "danger" && "border-red-500/50 bg-red-50 text-red-900",
                    status === "no-budget" &&
                      "border-muted bg-muted/30 text-muted-foreground",
                  )}
                >
                  <div className="font-semibold">
                    {selectedEmployes.size} emp × {selectedDates.size} jour(s) × {heuresParJour}h
                    {" = "}
                    <span className="text-base">{totalHeures}h</span> à staffer
                  </div>
                  {status === "no-budget" ? (
                    <div className="mt-1 text-xs">
                      Aucun budget prévu pour ce métier sur cet objet.
                    </div>
                  ) : (
                    <div className="mt-1 text-xs">
                      Budget {metiers.find((m) => m.id === metierId)?.libelle} :{" "}
                      <strong>{heuresDejaStaffees}h</strong> déjà staffées /{" "}
                      <strong>{heuresPrevues}h</strong> prévues — restant {restant}h
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {mutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Création…
              </>
            ) : (
              `Staffer ${totalAssignsACreer} assignation${totalAssignsACreer > 1 ? "s" : ""}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
