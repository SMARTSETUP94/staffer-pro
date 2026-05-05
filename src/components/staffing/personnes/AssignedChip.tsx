// Sprint 2b2.2 — chip personne déjà affectée + modale ajustement présence %.
import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import {
  unassignPersonneFromStep,
  updateAssignmentPresence,
} from "@/server/staffing-personnes.functions";
import { formatShortDate } from "../gantt-helpers";
import type { Assignment } from "./shared";

export function AssignedChip({
  assignment,
  cumul,
  onChanged,
}: {
  assignment: Assignment;
  cumul: number;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const initials = `${assignment.prenom[0] ?? "?"}${assignment.nom[0] ?? "?"}`.toUpperCase();
  const conflict = cumul > 100;

  const doRemove = async () => {
    setBusy(true);
    try {
      await unassignPersonneFromStep({ data: { id: assignment.id } });
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div
        className={`group flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs ${
          conflict ? "border-destructive/50 bg-destructive/10" : "border-border bg-background/60"
        }`}
      >
        <Avatar className="h-5 w-5">
          <AvatarFallback className="text-[8px]">{initials}</AvatarFallback>
        </Avatar>
        <span className="font-semibold">
          {assignment.prenom} {assignment.nom}
        </span>
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          className="font-mono text-[10px] text-muted-foreground hover:text-foreground"
          title="Ajuster %"
        >
          {assignment.presence_pct}%
        </button>
        {conflict && <AlertTriangle className="h-3 w-3 text-destructive" aria-label="Conflit cumul" />}
        <button
          type="button"
          onClick={doRemove}
          disabled={busy}
          data-write="1"
          className="ml-0.5 text-muted-foreground hover:text-destructive"
          title="Retirer"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      <PresenceSliderModal
        open={editOpen}
        onOpenChange={setEditOpen}
        assignment={assignment}
        cumul={cumul}
        onSaved={onChanged}
      />
    </>
  );
}

function PresenceSliderModal({
  open,
  onOpenChange,
  assignment,
  cumul,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  assignment: Assignment;
  cumul: number;
  onSaved: () => Promise<void>;
}) {
  const [pct, setPct] = useState(assignment.presence_pct);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setPct(assignment.presence_pct);
  }, [open, assignment.presence_pct]);

  const futureCumul = cumul - assignment.presence_pct + pct;
  const willConflict = futureCumul > 100;

  const save = async () => {
    setBusy(true);
    try {
      await updateAssignmentPresence({ data: { id: assignment.id, presence_pct: pct } });
      await onSaved();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {assignment.prenom} {assignment.nom} — {formatShortDate(assignment.date)}
          </DialogTitle>
          <DialogDescription>
            Ajuster la présence (%) sur cette étape. Split inter-objets autorisé : la même personne
            peut être affectée à plusieurs étapes le même jour tant que le cumul reste ≤ 100%.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex items-center gap-3">
            <Slider
              min={10}
              max={100}
              step={10}
              value={[pct]}
              onValueChange={(v) => setPct(v[0] ?? pct)}
            />
            <span className="w-12 text-right font-mono text-sm font-bold tabular-nums">{pct}%</span>
          </div>
          <div className="rounded-lg bg-muted p-3 text-xs">
            <p>
              Cumul jour après modification :{" "}
              <span className={`font-mono font-bold ${willConflict ? "text-destructive" : ""}`}>
                {futureCumul}%
              </span>
            </p>
            {willConflict && (
              <p className="mt-1 flex items-center gap-1 text-destructive">
                <AlertTriangle className="h-3 w-3" />
                Cumul &gt; 100% — la personne ne peut pas faire plus d'une journée complète.
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
