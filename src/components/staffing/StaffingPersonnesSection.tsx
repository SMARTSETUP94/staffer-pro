// v0.35.3 — Section Staffing Personnes : suggestions tier-based + assignation + split presence
import { useEffect, useMemo, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RefreshCw, UserPlus, X, AlertTriangle, Sliders, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { autoStaffStep } from "@/server/staffing-autostaff.functions";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getPersonnelSuggestions,
  assignPersonneToStep,
  unassignPersonneFromStep,
  updateAssignmentPresence,
  getPlanAssignments,
} from "@/server/staffing-personnes.functions";
import { METIER_KEY_BY_ID, type PlanStep } from "@/lib/staffing/types";
import { METIER_COLOR, METIER_LABEL, formatShortDate, formatDayName } from "./gantt-helpers";

interface Suggestion {
  employe: { id: string; nom: string; prenom: string; metier_principal_id: number; type_contrat: string };
  score: number;
  tier: 1 | 2 | 3;
  dispo_pct: number;
}
interface Assignment {
  id: string;
  step_id: string;
  employe_id: string;
  date: string;
  presence_pct: number;
  nom: string;
  prenom: string;
  type_contrat: string;
}

const TIER_COLORS: Record<1 | 2 | 3, { bg: string; text: string; label: string }> = {
  1: { bg: "bg-emerald-500/15", text: "text-emerald-700 dark:text-emerald-300", label: "Tier 1" },
  2: { bg: "bg-sky-500/15", text: "text-sky-700 dark:text-sky-300", label: "Tier 2" },
  3: { bg: "bg-amber-500/15", text: "text-amber-700 dark:text-amber-300", label: "Tier 3" },
};

interface Props {
  planId: string;
  steps: PlanStep[];
  /** Trigger pour réinvalider le Gantt parent après changement (heatmap) */
  onAssignmentsChanged?: () => void;
  objetsLabel: Record<string, string>;
}

export function StaffingPersonnesSection({ planId, steps, onAssignmentsChanged, objetsLabel }: Props) {
  const fetchAssignments = useServerFn(getPlanAssignments);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchAssignments({ data: { planId } });
      setAssignments(r.assignments);
    } finally {
      setLoading(false);
    }
  }, [fetchAssignments, planId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** Liste plate (step × jour) — pour chaque step on génère 1 entrée par jour ouvré du step */
  const stepDayRows = useMemo(() => {
    const rows: Array<{ step: PlanStep; date: string; key: string }> = [];
    for (const s of steps) {
      if (s.start_date === "TBD") continue;
      const start = new Date(s.start_date + "T00:00:00Z");
      for (let i = 0; i < s.span_days; i++) {
        const d = new Date(start);
        d.setUTCDate(d.getUTCDate() + i);
        const dow = d.getUTCDay();
        if (dow >= 1 && dow <= 5) {
          const iso = d.toISOString().slice(0, 10);
          rows.push({ step: s, date: iso, key: `${s.id}|${iso}` });
        }
      }
    }
    return rows;
  }, [steps]);

  /** Cumul presence_pct par (employe_id × date) — pour conflits */
  const cumulByEmpDate = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of assignments) {
      const k = `${a.employe_id}|${a.date}`;
      m[k] = (m[k] ?? 0) + a.presence_pct;
    }
    return m;
  }, [assignments]);

  const handleChanged = useCallback(async () => {
    await reload();
    onAssignmentsChanged?.();
  }, [reload, onAssignmentsChanged]);

  /** Group rows by step for accordion */
  const groupedBySteps = useMemo(() => {
    const groups = new Map<string, { step: PlanStep; days: Array<{ date: string; key: string }> }>();
    for (const r of stepDayRows) {
      if (!groups.has(r.step.id)) groups.set(r.step.id, { step: r.step, days: [] });
      groups.get(r.step.id)!.days.push({ date: r.date, key: r.key });
    }
    return Array.from(groups.values());
  }, [stepDayRows]);

  if (loading && assignments.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 rounded-2xl border border-border bg-card">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Staffing personnes (tier-based)
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {assignments.length} affectation{assignments.length > 1 ? "s" : ""} ·{" "}
            {groupedBySteps.length} étape{groupedBySteps.length > 1 ? "s" : ""}
          </p>
        </div>
        <Button onClick={reload} variant="ghost" size="sm">
          <RefreshCw className="mr-1 h-3 w-3" /> Rafraîchir
        </Button>
      </div>

      {groupedBySteps.length === 0 ? (
        <p className="py-6 text-center text-sm italic text-muted-foreground">
          Aucune étape planifiée. Recalculez le plan d'abord.
        </p>
      ) : (
        <Accordion type="multiple" className="w-full">
          {groupedBySteps.map(({ step, days }) => {
            const k = METIER_KEY_BY_ID[step.metier_id] ?? "Manut";
            const objLabel = step.objet_id ? (objetsLabel[step.objet_id] ?? step.objet_id) : "Global";
            const stepAssigns = assignments.filter((a) => a.step_id === step.id);
            // v0.35.x audit UX #4 — couverture en équivalent-personnes-jour (Σ presence_pct/100)
            // au lieu du count brut, qui surestime quand presence_pct < 100%.
            const targetPersDays = step.pers * step.span_days;
            const coverPersDays =
              stepAssigns.reduce((s, a) => s + a.presence_pct, 0) / 100;
            const coverRounded = Math.round(coverPersDays * 10) / 10;
            const partialCount = stepAssigns.filter((a) => a.presence_pct < 100).length;
            const isFull = coverPersDays >= targetPersDays;
            return (
              <AccordionItem key={step.id} value={step.id}>
                <div className="flex items-center gap-1">
                  <AccordionTrigger className="flex-1 hover:no-underline">
                    <div className="flex flex-1 items-center gap-3 pr-4">
                      <span
                        className="inline-block h-3 w-3 rounded-sm"
                        style={{ backgroundColor: METIER_COLOR[k] }}
                      />
                      <span className="font-bold text-sm">{METIER_LABEL[k]}</span>
                      <span className="text-xs text-muted-foreground truncate max-w-[260px]">
                        {objLabel}
                      </span>
                      <span className="ml-auto flex items-center gap-2 text-xs">
                        <span className="font-mono">{step.pers}p × {step.span_days}j</span>
                        <Badge
                          variant={isFull ? "secondary" : "outline"}
                          className={`text-[10px] ${isFull ? "" : "border-amber-500/60 text-amber-700 dark:text-amber-300"}`}
                          title={
                            `${stepAssigns.length} affectation${stepAssigns.length > 1 ? "s" : ""}` +
                            (partialCount > 0
                              ? ` dont ${partialCount} partielle${partialCount > 1 ? "s" : ""} (< 100%)`
                              : "") +
                            ` — couverture ${coverRounded} pers·j sur ${targetPersDays} requis`
                          }
                        >
                          {coverRounded}/{targetPersDays} pers·j
                          {partialCount > 0 && (
                            <span className="ml-1 opacity-70">({stepAssigns.length} aff.)</span>
                          )}
                        </Badge>
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AutoStaffButton
                    planId={planId}
                    stepId={step.id}
                    label="Auto-staffer l'étape"
                    onDone={handleChanged}
                  />
                </div>
                <AccordionContent>
                  <div className="space-y-3 pl-1">
                    {days.map((d) => (
                      <StepDayRow
                        key={d.key}
                        planId={planId}
                        step={step}
                        date={d.date}
                        assignments={stepAssigns.filter((a) => a.date === d.date)}
                        cumulByEmpDate={cumulByEmpDate}
                        onChanged={handleChanged}
                      />
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}
    </div>
  );
}

/* ================================================================== */
/* Une ligne (1 step × 1 jour) : affectations actuelles + suggestions  */
/* ================================================================== */
function StepDayRow({
  planId,
  step,
  date,
  assignments,
  cumulByEmpDate,
  onChanged,
}: {
  planId: string;
  step: PlanStep;
  date: string;
  assignments: Assignment[];
  cumulByEmpDate: Record<string, number>;
  onChanged: () => Promise<void>;
}) {
  const fetchSuggestions = useServerFn(getPersonnelSuggestions);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [loadingSug, setLoadingSug] = useState(false);
  const [open, setOpen] = useState(false);

  const loadSuggestions = useCallback(async () => {
    setLoadingSug(true);
    try {
      const r = await fetchSuggestions({ data: { stepId: step.id, date, planId } });
      setSuggestions(r.suggestions);
    } finally {
      setLoadingSug(false);
    }
  }, [fetchSuggestions, step.id, date, planId]);

  const toggleOpen = useCallback(() => {
    setOpen((o) => {
      const n = !o;
      if (n && !suggestions) void loadSuggestions();
      return n;
    });
  }, [loadSuggestions, suggestions]);

  const totalPresence = assignments.reduce((s, a) => s + a.presence_pct, 0);
  const target = step.pers * 100;
  const remaining = Math.max(0, target - totalPresence);

  return (
    <div className="rounded-lg border border-border/50 bg-background/40 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-mono font-semibold">
            {formatDayName(date)} {formatShortDate(date)}
          </span>
          <Badge variant="outline" className="font-mono text-[10px]">
            {totalPresence}% / {target}%
          </Badge>
          {remaining > 0 && (
            <span className="text-[10px] text-amber-600 dark:text-amber-400">
              Manque {remaining}%
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <AutoStaffButton
            planId={planId}
            stepId={step.id}
            onlyDate={date}
            label="Auto ce jour"
            compact
            onDone={onChanged}
          />
          <Button onClick={toggleOpen} size="sm" variant={open ? "secondary" : "outline"}>
            <UserPlus className="mr-1 h-3 w-3" />
            {open ? "Fermer" : "Suggestions"}
          </Button>
        </div>
      </div>

      {/* Affectations actuelles */}
      {assignments.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {assignments.map((a) => (
            <AssignedChip
              key={a.id}
              assignment={a}
              cumul={cumulByEmpDate[`${a.employe_id}|${a.date}`] ?? a.presence_pct}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}

      {/* Suggestions */}
      {open && (
        <div className="mt-3 space-y-2 border-t border-border/40 pt-3">
          {loadingSug ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            </div>
          ) : suggestions && suggestions.length > 0 ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {suggestions.map((s) => (
                <PersonneSuggestionCard
                  key={s.employe.id}
                  suggestion={s}
                  alreadyAssigned={assignments.some((a) => a.employe_id === s.employe.id)}
                  cumul={cumulByEmpDate[`${s.employe.id}|${date}`] ?? 0}
                  onAssign={async (presencePct) => {
                    await assignPersonneToStep({
                      data: {
                        step_id: step.id,
                        employe_id: s.employe.id,
                        date,
                        presence_pct: presencePct,
                      },
                    });
                    await onChanged();
                    await loadSuggestions();
                  }}
                />
              ))}
            </div>
          ) : (
            <p className="py-3 text-center text-xs italic text-muted-foreground">
              Aucun candidat disponible pour ce métier ce jour-là.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/* PersonneSuggestionCard                                               */
/* ================================================================== */
function PersonneSuggestionCard({
  suggestion,
  alreadyAssigned,
  cumul,
  onAssign,
}: {
  suggestion: Suggestion;
  alreadyAssigned: boolean;
  cumul: number;
  onAssign: (presencePct: number) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [showSlider, setShowSlider] = useState(false);
  const [pct, setPct] = useState(100);
  const tier = TIER_COLORS[suggestion.tier];
  const initials = `${suggestion.employe.prenom[0] ?? "?"}${suggestion.employe.nom[0] ?? "?"}`.toUpperCase();
  const conflictAfter = cumul + 100 > 100 && !alreadyAssigned;

  const doAssign = async (p: number) => {
    setBusy(true);
    try {
      await onAssign(p);
      setShowSlider(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-card p-2">
      <Avatar className="h-8 w-8">
        <AvatarFallback className="text-[10px] font-semibold">{initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-xs font-semibold">
            {suggestion.employe.prenom} {suggestion.employe.nom}
          </p>
          <Badge className={`px-1 py-0 text-[9px] font-bold ${tier.bg} ${tier.text}`} variant="outline">
            {tier.label}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="font-mono">{suggestion.employe.type_contrat}</span>
          <span>·</span>
          <span className="font-mono">Score {suggestion.score}</span>
          <span>·</span>
          <span className="font-mono">{suggestion.dispo_pct}% libre</span>
        </div>
        {conflictAfter && (
          <div className="mt-0.5 flex items-center gap-1 text-[10px] text-destructive">
            <AlertTriangle className="h-2.5 w-2.5" />
            Cumul jour : {cumul}%
          </div>
        )}
      </div>
      {showSlider ? (
        <div className="flex items-center gap-2">
          <Slider
            key={`assign-pct-${suggestion.employe.id}`}
            min={10}
            max={100}
            step={10}
            value={[pct]}
            onValueChange={(v) => setPct(v[0] ?? 100)}
            className="w-20"
          />
          <span className="w-9 font-mono text-[10px] font-bold tabular-nums">{pct}%</span>
          <Button size="sm" disabled={busy} onClick={() => doAssign(pct)}>
            OK
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            disabled={busy || alreadyAssigned}
            onClick={() => setShowSlider(true)}
            title="Affecter avec %"
            className="h-7 w-7"
          >
            <Sliders className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            disabled={busy || alreadyAssigned}
            onClick={() => doAssign(100)}
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : alreadyAssigned ? "Affecté" : "Affecter"}
          </Button>
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/* AssignedChip — affectation existante avec édition / suppression      */
/* ================================================================== */
function AssignedChip({
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
          conflict
            ? "border-destructive/50 bg-destructive/10"
            : "border-border bg-background/60"
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
        {conflict && (
          <AlertTriangle className="h-3 w-3 text-destructive" aria-label="Conflit cumul" />
        )}
        <button
          type="button"
          onClick={doRemove}
          disabled={busy}
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

/* ================================================================== */
/* PresenceSliderModal                                                  */
/* ================================================================== */
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

/* ================================================================== */
/* AutoStaffButton — remplit auto les slots manquants (jour ou step)    */
/* ================================================================== */
function AutoStaffButton({
  planId,
  stepId,
  onlyDate,
  label,
  compact,
  onDone,
}: {
  planId: string;
  stepId: string;
  onlyDate?: string;
  label: string;
  compact?: boolean;
  onDone: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const run = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setBusy(true);
    try {
      const r = await autoStaffStep({ data: { stepId, planId, onlyDate } });
      if (r.filled === 0 && r.skipped === 0) {
        toast.info("Étape déjà complète, rien à affecter.");
      } else if (r.filled === 0) {
        toast.warning(`Aucun candidat disponible (${r.skipped} slot(s) non couvert(s)).`);
      } else {
        const noms = r.details
          .slice(0, 3)
          .map((d) => `${d.prenom} ${d.nom[0]}.`)
          .join(", ");
        toast.success(
          `${r.filled} affectation${r.filled > 1 ? "s" : ""} créée${r.filled > 1 ? "s" : ""}` +
            (r.skipped > 0 ? ` · ${r.skipped} slot(s) non couvert(s)` : "") +
            (noms ? ` — ${noms}${r.details.length > 3 ? "…" : ""}` : "")
        );
      }
      await onDone();
    } catch (err) {
      toast.error((err as Error).message ?? "Échec auto-staffing");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button
      onClick={run}
      disabled={busy}
      size="sm"
      variant="outline"
      title={label}
      className={compact ? "h-7 px-2" : "h-7 px-2 mr-2"}
    >
      {busy ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Wand2 className="h-3 w-3" />
      )}
      {!compact && <span className="ml-1 text-xs">Auto</span>}
      {compact && <span className="ml-1 text-[10px]">Auto</span>}
    </Button>
  );
}
