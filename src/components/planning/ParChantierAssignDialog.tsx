/**
 * v0.21.0 Bloc 6 — Modale d'affectation depuis "Planning par chantier".
 *
 * Pré-remplie avec :
 *   - Affaire = celle de la ligne (imposée, non modifiable)
 *   - Date(s) = jour(s) de la/les colonne(s) cliquée(s)
 *   - Lot devis = auto si 1 seul lot actif, sinon dropdown
 *   - Métier = vide à choisir
 *   - Employés = multi-select
 *   - Créneau = journée par défaut
 */
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Loader2, Search, Users } from "lucide-react";
import { toast } from "sonner";
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
import { supabase } from "@/integrations/supabase/client";
import { buildParChantierPayloads, autoPickDevisLot } from "@/lib/parchantier-edit";
import type { Slot } from "@/lib/bulk-staffer";
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
  affaire: Affaire;
  /** Dates yyyy-MM-dd ciblées (1+ pour Ctrl+clic) */
  dates: string[];
  employes: Employe[];
  metiers: Metier[];
  devisLots: DevisLot[];
  assignations: Assignation[];
  onSaved: () => void;
}

export function ParChantierAssignDialog({
  open,
  onOpenChange,
  affaire,
  dates,
  employes,
  metiers,
  devisLots,
  assignations,
  onSaved,
}: Props) {
  const [metierId, setMetierId] = useState<number | null>(null);
  const [devisId, setDevisId] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot>("JOURNEE");
  const [selectedEmployes, setSelectedEmployes] = useState<Set<string>>(new Set());
  const [employeFilter, setEmployeFilter] = useState("");
  const [saving, setSaving] = useState(false);

  const lotsActifs = useMemo(
    () => devisLots.filter(
      (d) => d.affaire_id === affaire.id && d.statut !== "termine" && d.statut !== "cloture",
    ),
    [devisLots, affaire.id],
  );

  useEffect(() => {
    if (!open) return;
    setMetierId(null);
    setDevisId(autoPickDevisLot(affaire.id, devisLots));
    setSlot("JOURNEE");
    setSelectedEmployes(new Set());
    setEmployeFilter("");
  }, [open, affaire.id, devisLots]);

  const employesFiltered = useMemo(() => {
    const q = employeFilter.trim().toLowerCase();
    return employes.filter((e) =>
      q === "" ? true : `${e.prenom} ${e.nom}`.toLowerCase().includes(q),
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

  function toggleEmploye(id: string) {
    setSelectedEmployes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Auto métier sur sélection (majorité)
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
    counts.forEach((n, m) => { if (n > bestN) { bestN = n; best = m; } });
    if (best !== null) setMetierId(best);
  }, [selectedEmployes, employes, metierId]);

  const sortedDates = useMemo(() => [...dates].sort(), [dates]);

  async function handleConfirm() {
    if (!metierId) {
      toast.error("Choisis un métier");
      return;
    }
    if (selectedEmployes.size === 0) {
      toast.error("Sélectionne au moins un employé");
      return;
    }
    const { payloads, skipped } = buildParChantierPayloads({
      affaireId: affaire.id,
      metierId,
      devisId,
      slot,
      employeIds: Array.from(selectedEmployes),
      dates: sortedDates,
      existing: assignations,
    });
    if (payloads.length === 0) {
      toast.error("Toutes les cellules sont déjà occupées");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("assignations").insert(payloads);
    setSaving(false);
    if (error) {
      toast.error(`Erreur : ${error.message}`);
      return;
    }
    toast.success(
      `${payloads.length} affectation(s) créée(s)${skipped > 0 ? ` (${skipped} skippée(s))` : ""}`,
    );
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Affecter sur {affaire.numero} — {affaire.nom}
          </DialogTitle>
          <DialogDescription>
            {sortedDates.length === 1
              ? `Jour : ${format(new Date(sortedDates[0]), "EEEE d MMMM yyyy", { locale: fr })}`
              : `${sortedDates.length} jours sélectionnés (${format(new Date(sortedDates[0]), "dd/MM", { locale: fr })} → ${format(new Date(sortedDates[sortedDates.length - 1]), "dd/MM", { locale: fr })})`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          <div className="grid gap-3 md:grid-cols-2">
            {lotsActifs.length > 0 && (
              <div className="grid gap-1.5">
                <Label>
                  Lot devis{" "}
                  {lotsActifs.length === 1 && (
                    <span className="text-[10px] font-normal text-muted-foreground">(auto)</span>
                  )}
                </Label>
                <Select
                  value={devisId ?? "none"}
                  onValueChange={(v) => setDevisId(v === "none" ? null : v)}
                  disabled={lotsActifs.length === 1}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir un lot…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Non rattaché —</SelectItem>
                    {lotsActifs.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.numero}{l.libelle ? ` — ${l.libelle}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
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

          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" /> Employés ({selectedEmployes.size})
              </Label>
              <Button size="sm" variant="ghost" onClick={() => setSelectedEmployes(new Set())}>
                Aucun
              </Button>
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
            <ScrollArea className="h-56">
              <div className="space-y-2 pr-2">
                {groupedByMetier.map(({ metier, emps }) => (
                  <div key={metier.id}>
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: metier.couleur }}
                      />
                      {metier.libelle} ({emps.length})
                    </div>
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
                          <span>{e.prenom} {e.nom}</span>
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={handleConfirm} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Créer {selectedEmployes.size * sortedDates.length} affectation(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
