import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import type { Affaire, Assignation, DevisLot, Employe, Metier } from "@/hooks/use-planning-data";

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
  /** v0.15.1 — Tous les lots/devis chargés (pour sélecteur si ≥2 lots actifs sur l'affaire). */
  devisLots?: DevisLot[];
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
  devisLots = [],
  onSaved,
}: Props) {
  // Édition d'une assignation existante = sélection par id ; sinon création
  const [editingId, setEditingId] = useState<string | null>(null);
  const [affaireId, setAffaireId] = useState<string>("");
  const [metierId, setMetierId] = useState<number | null>(null);
  const [devisId, setDevisId] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot>("JOURNEE");
  const [heures, setHeures] = useState<number>(8);
  const [notes, setNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmOpportunite, setConfirmOpportunite] = useState(false);
  const [secondairesIds, setSecondairesIds] = useState<number[]>([]);
  const [showAllMetiers, setShowAllMetiers] = useState(false);

  // Réinitialise à l'ouverture
  useEffect(() => {
    if (!open) return;
    setEditingId(null);
    setAffaireId("");
    setMetierId(employe.metier_principal_id);
    setDevisId(null);
    setSlot("JOURNEE");
    setHeures(8);
    setNotes("");
    setShowAllMetiers(false);
  }, [open, employe.metier_principal_id]);

  // Charge les compétences secondaires de l'employé
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    supabase
      .from("employe_metiers")
      .select("metier_id")
      .eq("employe_id", employe.id)
      .then(({ data }) => {
        if (cancelled) return;
        setSecondairesIds((data ?? []).map((r) => r.metier_id));
      });
    return () => {
      cancelled = true;
    };
  }, [open, employe.id]);

  // Métiers de compétence (principal + secondaires)
  const metiersCompetence = useMemo(() => {
    const ids = new Set<number>([employe.metier_principal_id, ...secondairesIds]);
    return metiers.filter((m) => ids.has(m.id));
  }, [metiers, employe.metier_principal_id, secondairesIds]);

  // Si le métier sélectionné n'est pas une compétence, on bascule en "tous"
  const metiersAffichesBase = showAllMetiers ? metiers : metiersCompetence;
  const metiersAffiches = useMemo(() => {
    if (metierId && !metiersAffichesBase.some((m) => m.id === metierId)) {
      const extra = metiers.find((m) => m.id === metierId);
      return extra ? [...metiersAffichesBase, extra] : metiersAffichesBase;
    }
    return metiersAffichesBase;
  }, [metiersAffichesBase, metierId, metiers]);

  const sortedAffaires = useMemo(
    () =>
      [...affaires].sort((a, b) => a.numero.localeCompare(b.numero, "fr", { numeric: true })),
    [affaires],
  );

  // v0.15.1 — Lots actifs (non terminés/clôturés) pour l'affaire sélectionnée
  const lotsActifs = useMemo(() => {
    if (!affaireId) return [];
    return devisLots
      .filter((d) => d.affaire_id === affaireId && d.statut !== "termine" && d.statut !== "cloture")
      .sort((a, b) => a.numero.localeCompare(b.numero, "fr", { numeric: true }));
  }, [devisLots, affaireId]);

  // Autofill devis_id quand 1 seul lot actif et qu'on n'est pas en édition
  useEffect(() => {
    if (editingId) return;
    if (!affaireId) {
      setDevisId(null);
      return;
    }
    if (lotsActifs.length === 1) {
      setDevisId(lotsActifs[0].id);
    } else if (lotsActifs.length === 0) {
      setDevisId(null);
    } else if (devisId && !lotsActifs.some((l) => l.id === devisId)) {
      // Lot précédemment choisi n'est plus dans les actifs (changement d'affaire)
      setDevisId(null);
    }
  }, [editingId, affaireId, lotsActifs, devisId]);

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
    setDevisId(a.devis_id ?? null);
    setSlot(a.demi_journee as Slot);
    setHeures(Number(a.heures));
    setNotes(a.notes ?? "");
  }

  function startNew() {
    setEditingId(null);
    setAffaireId("");
    setMetierId(employe.metier_principal_id);
    setDevisId(null);
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

  async function performSave() {
    if (!metierId) return; // garde TS — déjà checké dans handleSave
    setSaving(true);
    const dateStr = format(date, "yyyy-MM-dd");
    const payload = {
      employe_id: employe.id,
      affaire_id: affaireId,
      metier_id: metierId,
      devis_id: devisId,
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

    // v0.17 — Si affaire est une opportunité non signée, demander confirmation
    const aff = affaires.find((a) => a.id === affaireId);
    if (aff?.phase === "opportunite" && !editingId) {
      setConfirmOpportunite(true);
      return;
    }

    await performSave();
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

          {/* v0.17 — Bannière PROTO si l'affaire sélectionnée est une opportunité */}
          {affaireId &&
            (() => {
              const aff = affaires.find((a) => a.id === affaireId);
              if (aff?.phase !== "opportunite") return null;
              return (
                <div className="flex items-start gap-2 rounded-md border border-warning/50 bg-warning/10 p-2 text-[11px]">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                  <div>
                    <strong className="text-warning-foreground">Opportunité non signée</strong> ·{" "}
                    Tu staffes une affaire en phase étude (proto).
                  </div>
                </div>
              );
            })()}

          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Affaire</Label>
              <AffaireCombobox
                affaires={sortedAffaires}
                value={affaireId}
                onChange={setAffaireId}
                showOpportuniteToggle
              />
            </div>

            {/* v0.15.1 — Sélecteur de lot/devis : visible si ≥1 lot actif sur l'affaire */}
            {affaireId && lotsActifs.length > 0 && (
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <Label>
                    Lot / devis{" "}
                    {lotsActifs.length === 1 && (
                      <span className="text-[10px] font-normal text-muted-foreground">
                        (auto)
                      </span>
                    )}
                  </Label>
                  {lotsActifs.length >= 2 && (
                    <span className="text-[10px] text-muted-foreground">
                      {lotsActifs.length} lots actifs
                    </span>
                  )}
                </div>
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
                        <span className="font-mono font-semibold">{l.numero}</span>
                        {l.libelle && (
                          <span className="ml-1.5 text-muted-foreground">— {l.libelle}</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <Label
                    title="Métier sur lequel l'employé est mobilisé. Si différent du métier principal = renfort."
                  >
                    Métier mobilisé
                  </Label>
                  {metiersCompetence.length < metiers.length && (
                    <button
                      type="button"
                      onClick={() => setShowAllMetiers((v) => !v)}
                      className="text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    >
                      {showAllMetiers ? "Compétences" : "Tous"}
                    </button>
                  )}
                </div>
                <Select
                  value={metierId?.toString() ?? ""}
                  onValueChange={(v) => setMetierId(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Métier" />
                  </SelectTrigger>
                  <SelectContent>
                    {metiersAffiches.map((m) => {
                      const isPrincipal = m.id === employe.metier_principal_id;
                      const isCompetence = metiersCompetence.some((mc) => mc.id === m.id);
                      return (
                        <SelectItem key={m.id} value={m.id.toString()}>
                          <span
                            className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                            style={{ backgroundColor: m.couleur }}
                          />
                          {m.libelle}
                          {isPrincipal && (
                            <span className="ml-1 text-[10px] text-muted-foreground">
                              (principal)
                            </span>
                          )}
                          {!isCompetence && showAllMetiers && (
                            <span className="ml-1 text-[10px] text-muted-foreground">
                              (hors compétence)
                            </span>
                          )}
                        </SelectItem>
                      );
                    })}
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

      {/* v0.17 — Confirmation staffing sur opportunité non signée */}
      <AlertDialog open={confirmOpportunite} onOpenChange={setConfirmOpportunite}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Staffer sur une opportunité non signée ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Cette affaire est en phase étude (code 9XXX). L'assignation sera créée mais
              marquée comme staffing prototype, à reconfirmer après signature.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setConfirmOpportunite(false);
                await performSave();
              }}
            >
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
