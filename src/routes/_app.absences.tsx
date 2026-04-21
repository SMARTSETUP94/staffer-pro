import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarOff, Loader2, Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { ABSENCE_ICON, ABSENCE_LABEL } from "@/lib/absence-helpers";
import type { AbsenceType } from "@/hooks/use-planning-data";

interface AbsenceRow {
  id: string;
  employe_id: string;
  date_debut: string;
  date_fin: string;
  type: AbsenceType;
  demi_journee: "AM" | "PM" | "JOURNEE" | null;
  motif: string | null;
  valide: boolean;
  employes: { prenom: string; nom: string } | null;
}

interface ConflictAssignation {
  id: string;
  date: string;
  demi_journee: "AM" | "PM" | "JOURNEE";
  heures: number;
  affaires: { numero: string; nom: string } | null;
}

interface EmployeOpt {
  id: string;
  prenom: string;
  nom: string;
  type_contrat: "CDI" | "Interim" | "CDD" | "Independant";
}

interface AbsencesSearch {
  employe?: string;
  date?: string;
}

export const Route = createFileRoute("/_app/absences")({
  validateSearch: (search: Record<string, unknown>): AbsencesSearch => ({
    employe: typeof search.employe === "string" ? search.employe : undefined,
    date: typeof search.date === "string" ? search.date : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Absences — Setup Paris" },
      { name: "description", content: "Gestion des absences et indisponibilités." },
    ],
  }),
  component: AbsencesPage,
});

function AbsencesPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [rows, setRows] = useState<AbsenceRow[]>([]);
  const [employes, setEmployes] = useState<EmployeOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AbsenceRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "future" | "pending">("future");
  const [prefillHandled, setPrefillHandled] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictAssignation[] | null>(null);
  const [conflictBusy, setConflictBusy] = useState(false);

  async function load() {
    setLoading(true);
    const [{ data: a, error: aErr }, { data: e }] = await Promise.all([
      supabase
        .from("absences")
        .select("id, employe_id, date_debut, date_fin, type, demi_journee, motif, valide, employes!inner(prenom, nom, type_contrat)")
        .order("date_debut", { ascending: false }),
      supabase
        .from("employes")
        .select("id, prenom, nom, type_contrat")
        .eq("actif", true)
        .order("nom"),
    ]);
    if (aErr) toast.error(aErr.message);
    setRows((a ?? []) as AbsenceRow[]);
    setEmployes((e ?? []) as EmployeOpt[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  // Pré-remplissage depuis ?employe=...&date=... (raccourci depuis le planning)
  useEffect(() => {
    if (prefillHandled || loading) return;
    if (!search.employe && !search.date) return;
    const emp = employes.find((x) => x.id === search.employe);
    if (!emp) return; // attendre que les employés soient chargés (ou employé inconnu)
    const today = format(new Date(), "yyyy-MM-dd");
    const day = search.date ?? today;
    setEditing({
      id: "",
      employe_id: emp.id,
      date_debut: day,
      date_fin: day,
      type: "conges",
      demi_journee: null,
      motif: "",
      valide: true,
      employes: { prenom: emp.prenom, nom: emp.nom },
    });
    setDialogOpen(true);
    setPrefillHandled(true);
    // Nettoie les query params pour éviter de re-déclencher
    navigate({ search: {}, replace: true });
  }, [employes, loading, search.employe, search.date, prefillHandled, navigate]);

  const filtered = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    return rows.filter((r) => {
      if (filter === "future") return r.date_fin >= today;
      if (filter === "pending") return !r.valide;
      return true;
    });
  }, [rows, filter]);

  function openNew() {
    setEditing({
      id: "",
      employe_id: employes[0]?.id ?? "",
      date_debut: format(new Date(), "yyyy-MM-dd"),
      date_fin: format(new Date(), "yyyy-MM-dd"),
      type: "conges",
      demi_journee: null,
      motif: "",
      valide: true,
      employes: null,
    });
    setDialogOpen(true);
  }

  function openEdit(r: AbsenceRow) {
    setEditing({ ...r });
    setDialogOpen(true);
  }

  // Helper : un slot d'absence chevauche-t-il un slot d'assignation ?
  // - absence sur "JOURNEE" ou null (= toute la période) → couvre AM, PM, JOURNEE
  // - absence sur "AM" → couvre AM, JOURNEE
  // - absence sur "PM" → couvre PM, JOURNEE
  function slotOverlaps(absSlot: "AM" | "PM" | "JOURNEE" | null, assSlot: "AM" | "PM" | "JOURNEE") {
    if (absSlot === null || absSlot === "JOURNEE") return true;
    if (assSlot === "JOURNEE") return true;
    return absSlot === assSlot;
  }

  async function fetchConflicts(): Promise<ConflictAssignation[]> {
    if (!editing) return [];
    const { data, error } = await supabase
      .from("assignations")
      .select("id, date, demi_journee, heures, affaires!inner(numero, nom)")
      .eq("employe_id", editing.employe_id)
      .gte("date", editing.date_debut)
      .lte("date", editing.date_fin)
      .order("date", { ascending: true });
    if (error) {
      toast.error(error.message);
      return [];
    }
    const all = (data ?? []) as unknown as ConflictAssignation[];
    return all.filter((a) => slotOverlaps(editing.demi_journee, a.demi_journee));
  }

  async function persistAbsence() {
    if (!editing) return;
    const payload = {
      employe_id: editing.employe_id,
      date_debut: editing.date_debut,
      date_fin: editing.date_fin,
      type: editing.type,
      demi_journee: editing.demi_journee,
      motif: editing.motif?.trim() || null,
      valide: editing.valide,
    };
    const res = editing.id
      ? await supabase.from("absences").update(payload).eq("id", editing.id)
      : await supabase.from("absences").insert(payload);
    if (res.error) {
      toast.error(res.error.message);
      return false;
    }
    toast.success(editing.id ? "Absence modifiée" : "Absence créée");
    return true;
  }

  async function handleSave() {
    if (!editing) return;
    if (!editing.employe_id) {
      toast.error("Sélectionne un employé");
      return;
    }
    if (editing.date_fin < editing.date_debut) {
      toast.error("La date de fin doit être après la date de début");
      return;
    }
    // 1. Vérifier les assignations qui chevauchent l'absence
    const conflictRows = await fetchConflicts();
    if (conflictRows.length > 0) {
      // Stocke les conflits → ouvre le dialog. La création se fera après décision.
      setConflicts(conflictRows);
      return;
    }
    // 2. Pas de conflit → enregistrer directement
    const ok = await persistAbsence();
    if (ok) {
      setDialogOpen(false);
      setEditing(null);
      load();
    }
  }

  async function handleConfirmKeepAssignations() {
    // L'utilisateur veut créer l'absence malgré les conflits (sans toucher au planning)
    const ok = await persistAbsence();
    if (ok) {
      setConflicts(null);
      setDialogOpen(false);
      setEditing(null);
      load();
    }
  }

  async function handleDeleteConflictsAndSave() {
    if (!conflicts || conflicts.length === 0) return;
    setConflictBusy(true);
    const ids = conflicts.map((c) => c.id);
    const { error: delErr } = await supabase.from("assignations").delete().in("id", ids);
    if (delErr) {
      toast.error(`Suppression assignations : ${delErr.message}`);
      setConflictBusy(false);
      return;
    }
    toast.success(`${ids.length} assignation${ids.length > 1 ? "s" : ""} supprimée${ids.length > 1 ? "s" : ""}`);
    const ok = await persistAbsence();
    setConflictBusy(false);
    if (ok) {
      setConflicts(null);
      setDialogOpen(false);
      setEditing(null);
      load();
    }
  }

  async function handleDelete() {
    if (!confirmDeleteId) return;
    const { error } = await supabase.from("absences").delete().eq("id", confirmDeleteId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Absence supprimée");
    setConfirmDeleteId(null);
    load();
  }

  async function toggleValide(r: AbsenceRow) {
    const { error } = await supabase
      .from("absences")
      .update({ valide: !r.valide })
      .eq("id", r.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    load();
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <CalendarOff className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Absences</h1>
        </div>
        <Button onClick={openNew} size="sm">
          <Plus className="mr-1.5 h-4 w-4" /> Nouvelle absence
        </Button>
      </div>

      <div className="mb-4 flex gap-1 rounded-lg border bg-muted/30 p-1 text-xs">
        {(["future", "pending", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-md px-3 py-1.5 font-semibold transition-colors ${
              filter === f
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {f === "future" ? "À venir / en cours" : f === "pending" ? "À valider" : "Toutes"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Aucune absence dans cette vue.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="p-3 text-left font-semibold">Employé</th>
                <th className="p-3 text-left font-semibold">Type</th>
                <th className="p-3 text-left font-semibold">Période</th>
                <th className="p-3 text-left font-semibold">Slot</th>
                <th className="p-3 text-left font-semibold">Motif</th>
                <th className="p-3 text-center font-semibold">Statut</th>
                <th className="p-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t hover:bg-muted/30">
                  <td className="p-3 font-semibold">
                    {r.employes ? `${r.employes.prenom} ${r.employes.nom}` : "—"}
                  </td>
                  <td className="p-3">
                    <span className="mr-1">{ABSENCE_ICON[r.type]}</span>
                    {ABSENCE_LABEL[r.type]}
                  </td>
                  <td className="p-3 text-xs">
                    {format(parseISO(r.date_debut), "dd MMM yyyy", { locale: fr })}
                    {r.date_debut !== r.date_fin && (
                      <> → {format(parseISO(r.date_fin), "dd MMM yyyy", { locale: fr })}</>
                    )}
                  </td>
                  <td className="p-3 text-xs">{r.demi_journee ?? "Toute la période"}</td>
                  <td className="p-3 text-xs italic text-muted-foreground">
                    {r.motif || "—"}
                  </td>
                  <td className="p-3 text-center">
                    {r.valide ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
                        <Check className="h-3 w-3" /> Validée
                      </span>
                    ) : (
                      <button
                        onClick={() => toggleValide(r)}
                        className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning hover:bg-warning/20"
                      >
                        À valider
                      </button>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => openEdit(r)}
                      className="h-7 w-7"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setConfirmDeleteId(r.id)}
                      className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Modifier l'absence" : "Nouvelle absence"}</DialogTitle>
            <DialogDescription>
              Une absence bloque automatiquement le staffing sur la période concernée.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label>Employé</Label>
                <Select
                  value={editing.employe_id}
                  onValueChange={(v) => setEditing({ ...editing, employe_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent>
                    {employes.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.prenom} {e.nom}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Type</Label>
                  <Select
                    value={editing.type}
                    onValueChange={(v) => setEditing({ ...editing, type: v as AbsenceType })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(ABSENCE_LABEL) as AbsenceType[]).map((t) => (
                        <SelectItem key={t} value={t}>
                          {ABSENCE_ICON[t]} {ABSENCE_LABEL[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Slot</Label>
                  <Select
                    value={editing.demi_journee ?? "ALL"}
                    onValueChange={(v) =>
                      setEditing({
                        ...editing,
                        demi_journee: v === "ALL" ? null : (v as "AM" | "PM" | "JOURNEE"),
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Toute la période</SelectItem>
                      <SelectItem value="JOURNEE">Journée complète</SelectItem>
                      <SelectItem value="AM">Matin</SelectItem>
                      <SelectItem value="PM">Après-midi</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Date début</Label>
                  <Input
                    type="date"
                    value={editing.date_debut}
                    onChange={(e) => setEditing({ ...editing, date_debut: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Date fin</Label>
                  <Input
                    type="date"
                    value={editing.date_fin}
                    onChange={(e) => setEditing({ ...editing, date_fin: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label>Motif (optionnel)</Label>
                <Textarea
                  rows={2}
                  value={editing.motif ?? ""}
                  onChange={(e) => setEditing({ ...editing, motif: e.target.value })}
                  maxLength={500}
                />
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing.valide}
                  onChange={(e) => setEditing({ ...editing, valide: e.target.checked })}
                  className="h-4 w-4 rounded border-input"
                />
                Validée
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              <X className="mr-1 h-4 w-4" /> Annuler
            </Button>
            <Button onClick={handleSave}>
              <Check className="mr-1 h-4 w-4" /> Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDeleteId} onOpenChange={(o) => !o && setConfirmDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette absence ?</AlertDialogTitle>
            <AlertDialogDescription>
              L'employé redeviendra disponible sur la période concernée.
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

      {/* Dialog conflits assignations chevauchant l'absence */}
      <Dialog
        open={!!conflicts}
        onOpenChange={(o) => {
          if (!o && !conflictBusy) setConflicts(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {conflicts?.length ?? 0} assignation{(conflicts?.length ?? 0) > 1 ? "s" : ""} en conflit
            </DialogTitle>
            <DialogDescription>
              Cet employé a déjà des créneaux planifiés sur la période de l'absence. Tu peux les
              supprimer en cascade ou enregistrer l'absence sans toucher au planning (à corriger
              manuellement après).
            </DialogDescription>
          </DialogHeader>
          {conflicts && conflicts.length > 0 && (
            <div className="max-h-72 overflow-y-auto rounded-md border bg-muted/20">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/60 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left font-semibold">Date</th>
                    <th className="p-2 text-left font-semibold">Slot</th>
                    <th className="p-2 text-left font-semibold">Affaire</th>
                    <th className="p-2 text-right font-semibold">H</th>
                  </tr>
                </thead>
                <tbody>
                  {conflicts.map((c) => (
                    <tr key={c.id} className="border-t">
                      <td className="p-2">
                        {format(parseISO(c.date), "EEE dd MMM", { locale: fr })}
                      </td>
                      <td className="p-2">{c.demi_journee}</td>
                      <td className="p-2">
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {c.affaires?.numero ?? "?"}
                        </span>{" "}
                        {c.affaires?.nom ?? ""}
                      </td>
                      <td className="p-2 text-right tabular-nums">{c.heures}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
            <Button
              variant="outline"
              onClick={() => setConflicts(null)}
              disabled={conflictBusy}
            >
              <X className="mr-1 h-4 w-4" /> Annuler
            </Button>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="secondary"
                onClick={handleConfirmKeepAssignations}
                disabled={conflictBusy}
              >
                Garder les assignations
              </Button>
              <Button
                onClick={handleDeleteConflictsAndSave}
                disabled={conflictBusy}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {conflictBusy ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-1 h-4 w-4" />
                )}
                Supprimer toutes les assignations conflictuelles
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
