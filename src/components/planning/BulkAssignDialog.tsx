import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatBusinessError } from "@/lib/business-errors";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AffaireCombobox } from "./AffaireCombobox";
import { insertAssignationsBatch } from "@/lib/assignation-upsert";
import type { Affaire, Employe, Metier } from "@/hooks/use-planning-data";

type Slot = "AM" | "PM" | "JOURNEE";
const HEURES_DEFAUT: Record<Slot, number> = { AM: 4, PM: 4, JOURNEE: 8 };

interface CellRef {
  employeId: string;
  date: string; // yyyy-MM-dd
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cells: CellRef[];
  employes: Employe[];
  affaires: Affaire[];
  metiers: Metier[];
  onSaved: () => void;
}

export function BulkAssignDialog({
  open,
  onOpenChange,
  cells,
  employes,
  affaires,
  metiers,
  onSaved,
}: Props) {
  const [affaireId, setAffaireId] = useState<string>("");
  const [metierId, setMetierId] = useState<number | null>(null);
  const [slot, setSlot] = useState<Slot>("JOURNEE");
  const [heures, setHeures] = useState<number>(8);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAffaireId("");
    setMetierId(null);
    setSlot("JOURNEE");
    setHeures(8);
  }, [open]);

  const sortedAffaires = useMemo(
    () => [...affaires].sort((a, b) => a.numero.localeCompare(b.numero, "fr", { numeric: true })),
    [affaires],
  );

  const employesById = useMemo(() => new Map(employes.map((e) => [e.id, e])), [employes]);

  const recap = useMemo(() => {
    const byEmp = new Map<string, string[]>();
    cells.forEach((c) => {
      const arr = byEmp.get(c.employeId) ?? [];
      arr.push(c.date);
      byEmp.set(c.employeId, arr);
    });
    return Array.from(byEmp.entries()).map(([empId, dates]) => {
      const emp = employesById.get(empId);
      return {
        nom: emp ? `${emp.prenom} ${emp.nom}` : empId,
        dates: dates.sort().map((d) => format(parseISO(d), "EEE dd/MM", { locale: fr })),
      };
    });
  }, [cells, employesById]);

  function handleSlotChange(s: Slot) {
    setSlot(s);
    setHeures(HEURES_DEFAUT[s]);
  }

  async function handleSave() {
    if (!affaireId || !metierId) {
      toast.error("Sélectionne affaire et métier");
      return;
    }
    if (heures <= 0 || heures > 12) {
      toast.error("Heures invalides");
      return;
    }
    setSaving(true);
    const payloads = cells.map((c) => ({
      employe_id: c.employeId,
      date: c.date,
      affaire_id: affaireId,
      metier_id: metierId,
      demi_journee: slot,
      heures,
      notes: null,
    }));
    const { error } = await insertAssignationsBatch(payloads);
    setSaving(false);
    if (error) {
      toast.error(...formatBusinessError(error));
      return;
    }
    toast.success(`${cells.length} assignations créées`);
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Assignation groupée — {cells.length} cellules</DialogTitle>
          <DialogDescription>
            Crée la même assignation sur toutes les cellules sélectionnées.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-32 overflow-y-auto rounded-md border bg-muted/30 p-2 text-[11px]">
          {recap.map((r) => (
            <div key={r.nom} className="flex flex-wrap gap-1 py-0.5">
              <span className="font-semibold">{r.nom} :</span>
              <span className="text-muted-foreground">{r.dates.join(", ")}</span>
            </div>
          ))}
        </div>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Affaire</Label>
            <AffaireCombobox
              affaires={sortedAffaires}
              value={affaireId}
              onChange={setAffaireId}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Métier</Label>
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
              <Label>Demi-journée</Label>
              <Select value={slot} onValueChange={(v) => handleSlotChange(v as Slot)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="JOURNEE">Journée complète</SelectItem>
                  <SelectItem value="AM">Matin (AM)</SelectItem>
                  <SelectItem value="PM">Après-midi (PM)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Heures (par cellule)</Label>
            <Input
              type="number"
              min={0.5}
              max={12}
              step={0.5}
              value={heures}
              onChange={(e) => setHeures(Number(e.target.value))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Créer {cells.length} assignations
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
