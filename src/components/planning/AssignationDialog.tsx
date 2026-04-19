import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Loader2, Trash2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AffaireCombobox } from "./AffaireCombobox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import type { Affaire, Assignation, Employe, Metier } from "@/hooks/use-planning-data";

type Slot = "AM" | "PM" | "JOURNEE";

const HEURES_DEFAUT: Record<Slot, number> = { AM: 4, PM: 4, JOURNEE: 8 };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Date ciblée (cellule cliquée) */
  date: Date;
  /** Employé concerné */
  employe: Employe;
  /** Assignations existantes pour ce jour + employé */
  existing: Assignation[];
  affaires: Affaire[];
  metiers: Metier[];
  /** Consommation devis par (affaire+métier) — passée depuis le parent */
  consommation: {
    affaire_id: string;
    metier_id: number;
    heures_prevues: number;
    heures_assignees: number;
    heures_restantes: number;
  }[];
  onSaved: () => void;
}

export function AssignationDialog({
  open,
  onOpenChange,
  date,
  employe,
  existing,
  affaires,
  metiers,
  consommation,
  onSaved,
}: Props) {
  // Édition d'une assignation existante = sélection par id ; sinon création
  const [editingId, setEditingId] = useState<string | null>(null);
  const [affaireId, setAffaireId] = useState<string>("");
  const [metierId, setMetierId] = useState<number | null>(null);
  const [slot, setSlot] = useState<Slot>("JOURNEE");
  const [heures, setHeures] = useState<number>(8);
  const [notes, setNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Réinitialise à l'ouverture
  useEffect(() => {
    if (!open) return;
    setEditingId(null);
    setAffaireId("");
    setMetierId(employe.metier_principal_id);
    setSlot("JOURNEE");
    setHeures(8);
    setNotes("");
  }, [open, employe.metier_principal_id]);

  const sortedAffaires = useMemo(
    () =>
      [...affaires].sort((a, b) => a.numero.localeCompare(b.numero, "fr", { numeric: true })),
    [affaires],
  );

  // Conso devis pour le couple (affaire + métier) sélectionné
  const consoCouple = useMemo(() => {
    if (!affaireId || !metierId) return null;
    return (
      consommation.find((c) => c.affaire_id === affaireId && c.metier_id === metierId) ?? null
    );
  }, [consommation, affaireId, metierId]);

  // Heures déjà comptabilisées dans la conso pour ce couple — on retranche celles
  // de l'assignation en cours d'édition (sinon on les compterait deux fois).
  const heuresEditees = useMemo(() => {
    if (!editingId) return 0;
    const ed = existing.find((e) => e.id === editingId);
    if (!ed) return 0;
    if (ed.affaire_id !== affaireId || ed.metier_id !== metierId) return 0;
    return Number(ed.heures || 0);
  }, [editingId, existing, affaireId, metierId]);

  const restantesApres = consoCouple
    ? consoCouple.heures_restantes + heuresEditees - heures
    : null;
  const depassement = restantesApres !== null && restantesApres < 0;

  function loadExisting(a: Assignation) {
    setEditingId(a.id);
    setAffaireId(a.affaire_id);
    setMetierId(a.metier_id);
    setSlot(a.demi_journee as Slot);
    setHeures(Number(a.heures));
    setNotes(a.notes ?? "");
  }

  function startNew() {
    setEditingId(null);
    setAffaireId("");
    setMetierId(employe.metier_principal_id);
    // Choix par défaut : premier slot libre
    const usedSlots = new Set(existing.map((e) => e.demi_journee));
    if (usedSlots.has("JOURNEE")) {
      // déjà journée complète : par défaut on propose AM (chef pourra ajuster)
      setSlot("AM");
      setHeures(4);
    } else if (!usedSlots.has("AM")) {
      setSlot(usedSlots.has("PM") ? "AM" : "JOURNEE");
      setHeures(usedSlots.has("PM") ? 4 : 8);
    } else if (!usedSlots.has("PM")) {
      setSlot("PM");
      setHeures(4);
    } else {
      setSlot("JOURNEE");
      setHeures(8);
    }
    setNotes("");
  }

  function handleSlotChange(newSlot: Slot) {
    setSlot(newSlot);
    setHeures(HEURES_DEFAUT[newSlot]);
  }

  async function handleSave() {
    if (!affaireId) {
      toast.error("Sélectionne une affaire");
      return;
    }
    if (!metierId) {
      toast.error("Sélectionne un métier");
      return;
    }
    if (heures <= 0 || heures > 12) {
      toast.error("Heures invalides (0 < h ≤ 12)");
      return;
    }

    setSaving(true);
    const dateStr = format(date, "yyyy-MM-dd");
    const payload = {
      employe_id: employe.id,
      affaire_id: affaireId,
      metier_id: metierId,
      demi_journee: slot,
      heures,
      date: dateStr,
      notes: notes.trim() || null,
    };

    const res = editingId
      ? await supabase.from("assignations").update(payload).eq("id", editingId)
      : await supabase.from("assignations").insert(payload);

    setSaving(false);
    if (res.error) {
      toast.error(`Erreur : ${res.error.message}`);
      return;
    }
    toast.success(editingId ? "Assignation modifiée" : "Assignation créée");
    onSaved();
    onOpenChange(false);
  }

  async function handleDelete() {
    if (!editingId) return;
    setSaving(true);
    const { error } = await supabase.from("assignations").delete().eq("id", editingId);
    setSaving(false);
    setConfirmDelete(false);
    if (error) {
      toast.error(`Erreur : ${error.message}`);
      return;
    }
    toast.success("Assignation supprimée");
    onSaved();
    onOpenChange(false);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {employe.prenom} {employe.nom} — {format(date, "EEEE d MMMM yyyy", { locale: fr })}
            </DialogTitle>
            <DialogDescription>
              {existing.length === 0
                ? "Créer une nouvelle assignation"
                : `${existing.length} assignation(s) ce jour`}
            </DialogDescription>
          </DialogHeader>

          {existing.length > 0 && (
            <div className="space-y-1.5 rounded-md border bg-muted/30 p-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Assignations existantes
              </div>
              <div className="flex flex-wrap gap-1.5">
                {existing.map((a) => {
                  const aff = affaires.find((x) => x.id === a.affaire_id);
                  const met = metiers.find((m) => m.id === a.metier_id);
                  const isActive = editingId === a.id;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => loadExisting(a)}
                      className={`rounded border px-2 py-1 text-left text-[11px] transition-colors hover:bg-background ${
                        isActive ? "border-primary bg-primary/10" : "border-muted-foreground/20"
                      }`}
                    >
                      <span
                        className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                        style={{ backgroundColor: met?.couleur ?? "#94a3b8" }}
                      />
                      <span className="font-mono font-semibold">{aff?.numero ?? "—"}</span>
                      <span className="ml-1 text-muted-foreground">
                        · {a.demi_journee === "JOURNEE" ? "J" : a.demi_journee} · {a.heures}h
                      </span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={startNew}
                  className={`rounded border border-dashed px-2 py-1 text-[11px] transition-colors hover:bg-background ${
                    editingId === null && affaireId === ""
                      ? "border-primary text-primary"
                      : "border-muted-foreground/30 text-muted-foreground"
                  }`}
                >
                  + Nouvelle
                </button>
              </div>
            </div>
          )}

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

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Heures</Label>
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

            <div className="grid gap-1.5">
              <Label>Notes (optionnel)</Label>
              <Textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Précisions, consignes…"
                maxLength={500}
              />
            </div>
          </div>

          {affaireId && metierId && (
            <div
              className={`rounded-md border p-2 text-[11px] ${
                !consoCouple
                  ? "border-muted-foreground/20 bg-muted/30 text-muted-foreground"
                  : depassement
                    ? "border-destructive/50 bg-destructive/10 text-destructive"
                    : "border-primary/30 bg-primary/5"
              }`}
            >
              {!consoCouple ? (
                <span>Aucun budget devis pour ce métier sur cette affaire.</span>
              ) : (
                <div className="space-y-0.5">
                  <div className="flex items-center justify-between font-semibold">
                    <span>
                      {depassement && <AlertTriangle className="mr-1 inline h-3 w-3" />}
                      Budget devis ({metiers.find((m) => m.id === metierId)?.libelle})
                    </span>
                    <span>
                      {consoCouple.heures_assignees}h / {consoCouple.heures_prevues}h
                    </span>
                  </div>
                  <div>
                    Restant après cette assignation :{" "}
                    <strong>{restantesApres?.toFixed(1)}h</strong>
                    {depassement && " — dépassement budget !"}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex-row justify-between sm:justify-between">
            <div>
              {editingId && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(true)}
                  disabled={saving}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Supprimer
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Annuler
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {editingId ? "Enregistrer" : "Créer"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette assignation ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. L'assignation sera retirée du planning.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
