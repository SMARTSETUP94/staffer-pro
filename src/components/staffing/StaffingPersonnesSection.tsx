// v0.35.x — Section Staffing Personnes : suggestions tier-based + assignation + split presence
// v0.35.x REFONTE UX : (1) tabs filtre métier persistées localStorage, (2) toggle Liste/Calendrier,
// (4) masquage des postes 100% staffés par défaut.
import { useEffect, useMemo, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2,
  RefreshCw,
  UserPlus,
  X,
  AlertTriangle,
  Sliders,
  Wand2,
  List,
  CalendarDays,
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import { autoStaffStep } from "@/server/staffing-autostaff.functions";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { METIER_KEY_BY_ID, METIER_ID, type MetierKey, type PlanStep } from "@/lib/staffing/types";

/** v0.38.1.1 — helpers demi-journée (alignement Gantt) */
function effectiveDemi(step: PlanStep): number {
  return step.span_demi_jours ?? (step.span_days ?? 0) * 2;
}
function effectiveSpanDays(step: PlanStep): number {
  return Math.max(1, Math.ceil(effectiveDemi(step) / 2));
}
function formatSpanLabel(step: PlanStep): string {
  const demi = effectiveDemi(step);
  const full = Math.floor(demi / 2);
  const half = demi % 2;
  if (full === 0) return `${half}½j`;
  return half ? `${full}½j` : `${full}j`;
}
import { METIER_COLOR, METIER_LABEL, METIER_ORDER, formatShortDate, formatDayName } from "./gantt-helpers";

interface Suggestion {
  employe: { id: string; nom: string; prenom: string; metier_principal_id: number; type_contrat: string };
  score: number;
  tier: 1 | 2 | 3 | 4;
  dispo_pct: number;
  absent_days_in_step: number;
  absent_today: boolean;
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

const TIER_COLORS: Record<1 | 2 | 3 | 4, { bg: string; text: string; label: string }> = {
  1: { bg: "bg-emerald-500/15", text: "text-emerald-700 dark:text-emerald-300", label: "Tier 1" },
  2: { bg: "bg-sky-500/15", text: "text-sky-700 dark:text-sky-300", label: "Tier 2" },
  3: { bg: "bg-amber-500/15", text: "text-amber-700 dark:text-amber-300", label: "Tier 3" },
  4: { bg: "bg-orange-500/15", text: "text-orange-700 dark:text-orange-300", label: "Tier 4 · Dépannage" },
};

type ViewMode = "list" | "calendar";
type MetierFilter = "all" | MetierKey;

const LS_FILTER_KEY = "staffingPersonnes.metierFilter";
const LS_VIEW_KEY = "staffingPersonnes.viewMode";
const LS_HIDE_FULL_KEY = "staffingPersonnes.hideFull";

function readLS<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  if (typeof window === "undefined") return fallback;
  try {
    const v = window.localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}
function writeLS(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

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

  const ALLOWED_METIERS = useMemo<readonly MetierFilter[]>(
    () => ["all", ...METIER_ORDER] as const,
    [],
  );
  const [metierFilter, setMetierFilter] = useState<MetierFilter>(() =>
    readLS<MetierFilter>(LS_FILTER_KEY, "all", ALLOWED_METIERS),
  );
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    readLS<ViewMode>(LS_VIEW_KEY, "list", ["list", "calendar"] as const),
  );
  const [hideFull, setHideFull] = useState<boolean>(() =>
    readLS<"true" | "false">(LS_HIDE_FULL_KEY, "true", ["true", "false"] as const) === "true",
  );

  useEffect(() => {
    writeLS(LS_FILTER_KEY, metierFilter);
  }, [metierFilter]);
  useEffect(() => {
    writeLS(LS_VIEW_KEY, viewMode);
  }, [viewMode]);
  useEffect(() => {
    writeLS(LS_HIDE_FULL_KEY, hideFull ? "true" : "false");
  }, [hideFull]);

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

  /** Couverture par step (pers·j) */
  const coverByStep = useMemo(() => {
    const m: Record<string, { cover: number; target: number; isFull: boolean }> = {};
    for (const s of steps) {
      const target = s.pers * s.span_days;
      const cover =
        assignments.filter((a) => a.step_id === s.id).reduce((acc, a) => acc + a.presence_pct, 0) / 100;
      m[s.id] = { cover, target, isFull: target > 0 && cover >= target };
    }
    return m;
  }, [steps, assignments]);

  /** Compteurs nb steps par métier (pour badges des tabs) */
  const countByMetier = useMemo(() => {
    const m: Record<MetierFilter, number> = { all: 0, BE: 0, Num: 0, Bois: 0, Metal: 0, Peint: 0, Tap: 0, Manut: 0 };
    for (const s of steps) {
      if (s.start_date === "TBD") continue;
      const cov = coverByStep[s.id];
      if (hideFull && cov?.isFull) continue;
      const k = METIER_KEY_BY_ID[s.metier_id];
      if (k) m[k] += 1;
      m.all += 1;
    }
    return m;
  }, [steps, coverByStep, hideFull]);

  /** Steps filtrés selon métier + hideFull */
  const visibleSteps = useMemo(() => {
    return steps.filter((s) => {
      if (s.start_date === "TBD") return false;
      if (hideFull && coverByStep[s.id]?.isFull) return false;
      if (metierFilter !== "all" && METIER_KEY_BY_ID[s.metier_id] !== metierFilter) return false;
      return true;
    });
  }, [steps, hideFull, metierFilter, coverByStep]);

  if (loading && assignments.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 rounded-2xl border border-border bg-card">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  const totalSteps = steps.filter((s) => s.start_date !== "TBD").length;
  const fullCount = steps.filter((s) => s.start_date !== "TBD" && coverByStep[s.id]?.isFull).length;

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Staffing personnes (tier-based)
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {assignments.length} affectation{assignments.length > 1 ? "s" : ""} · {visibleSteps.length}/
            {totalSteps} étape{totalSteps > 1 ? "s" : ""}
            {fullCount > 0 && hideFull && (
              <span className="ml-1 italic">({fullCount} complète{fullCount > 1 ? "s" : ""} masquée{fullCount > 1 ? "s" : ""})</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => setHideFull((v) => !v)}
            variant={hideFull ? "secondary" : "ghost"}
            size="sm"
            title={hideFull ? "Afficher aussi les étapes 100% staffées" : "Masquer les étapes 100% staffées"}
          >
            {hideFull ? <EyeOff className="mr-1 h-3 w-3" /> : <Eye className="mr-1 h-3 w-3" />}
            {hideFull ? "Masquer complètes" : "Tout afficher"}
          </Button>
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
            <TabsList className="h-8">
              <TabsTrigger value="list" className="h-6 px-2 text-xs">
                <List className="mr-1 h-3 w-3" /> Liste
              </TabsTrigger>
              <TabsTrigger value="calendar" className="h-6 px-2 text-xs">
                <CalendarDays className="mr-1 h-3 w-3" /> Calendrier
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button onClick={reload} variant="ghost" size="sm">
            <RefreshCw className="mr-1 h-3 w-3" /> Rafraîchir
          </Button>
        </div>
      </div>

      {/* Tabs filtre métier */}
      <Tabs value={metierFilter} onValueChange={(v) => setMetierFilter(v as MetierFilter)}>
        <TabsList className="h-9 flex-wrap">
          <TabsTrigger value="all" className="h-7 gap-1.5 text-xs">
            Tous
            <Badge variant="outline" className="h-4 px-1 text-[10px] font-mono">
              {countByMetier.all}
            </Badge>
          </TabsTrigger>
          {METIER_ORDER.map((k) => (
            <TabsTrigger key={k} value={k} className="h-7 gap-1.5 text-xs">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: METIER_COLOR[k] }} />
              {METIER_LABEL[k]}
              <Badge variant="outline" className="h-4 px-1 text-[10px] font-mono">
                {countByMetier[k]}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {visibleSteps.length === 0 ? (
        <p className="py-6 text-center text-sm italic text-muted-foreground">
          {totalSteps === 0
            ? "Aucune étape planifiée. Recalculez le plan d'abord."
            : "Aucune étape correspond aux filtres actifs."}
        </p>
      ) : viewMode === "list" ? (
        <ListView
          planId={planId}
          steps={visibleSteps}
          assignments={assignments}
          coverByStep={coverByStep}
          cumulByEmpDate={cumulByEmpDate}
          objetsLabel={objetsLabel}
          onChanged={handleChanged}
        />
      ) : (
        <CalendarView
          planId={planId}
          steps={visibleSteps}
          assignments={assignments}
          cumulByEmpDate={cumulByEmpDate}
          objetsLabel={objetsLabel}
          onChanged={handleChanged}
        />
      )}
    </div>
  );
}

/* ================================================================== */
/* ListView — Accordion existant                                        */
/* ================================================================== */
function ListView({
  planId,
  steps,
  assignments,
  coverByStep,
  cumulByEmpDate,
  objetsLabel,
  onChanged,
}: {
  planId: string;
  steps: PlanStep[];
  assignments: Assignment[];
  coverByStep: Record<string, { cover: number; target: number; isFull: boolean }>;
  cumulByEmpDate: Record<string, number>;
  objetsLabel: Record<string, string>;
  onChanged: () => Promise<void>;
}) {
  /** Group rows by step */
  const grouped = useMemo(() => {
    return steps.map((step) => {
      const days: Array<{ date: string; key: string }> = [];
      const start = new Date(step.start_date + "T00:00:00Z");
      for (let i = 0; i < step.span_days; i++) {
        const d = new Date(start);
        d.setUTCDate(d.getUTCDate() + i);
        const dow = d.getUTCDay();
        if (dow >= 1 && dow <= 5) {
          const iso = d.toISOString().slice(0, 10);
          days.push({ date: iso, key: `${step.id}|${iso}` });
        }
      }
      return { step, days };
    });
  }, [steps]);

  return (
    <Accordion type="multiple" className="w-full">
      {grouped.map(({ step, days }) => {
        const k = METIER_KEY_BY_ID[step.metier_id] ?? "Manut";
        const objLabel = step.objet_id ? (objetsLabel[step.objet_id] ?? step.objet_id) : "Global";
        const stepAssigns = assignments.filter((a) => a.step_id === step.id);
        const cov = coverByStep[step.id];
        const targetPersDays = cov?.target ?? step.pers * step.span_days;
        const coverPersDays = cov?.cover ?? 0;
        const coverRounded = Math.round(coverPersDays * 10) / 10;
        const partialCount = stepAssigns.filter((a) => a.presence_pct < 100).length;
        const isFull = cov?.isFull ?? false;
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
                  <span className="text-xs text-muted-foreground truncate max-w-[260px]">{objLabel}</span>
                  <span className="ml-auto flex items-center gap-2 text-xs">
                    <span className="font-mono">
                      {step.pers}p × {step.span_days}j
                    </span>
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
                onDone={onChanged}
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
                    onChanged={onChanged}
                  />
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}

/* ================================================================== */
/* CalendarView — lignes étapes × colonnes jours, cellule clickable    */
/* ================================================================== */
function CalendarView({
  planId,
  steps,
  assignments,
  cumulByEmpDate,
  objetsLabel,
  onChanged,
}: {
  planId: string;
  steps: PlanStep[];
  assignments: Assignment[];
  cumulByEmpDate: Record<string, number>;
  objetsLabel: Record<string, string>;
  onChanged: () => Promise<void>;
}) {
  /** Fenêtre = union des jours ouvrés de tous les steps visibles */
  const days = useMemo(() => {
    const set = new Set<string>();
    for (const s of steps) {
      const start = new Date(s.start_date + "T00:00:00Z");
      for (let i = 0; i < s.span_days; i++) {
        const d = new Date(start);
        d.setUTCDate(d.getUTCDate() + i);
        const dow = d.getUTCDay();
        if (dow >= 1 && dow <= 5) set.add(d.toISOString().slice(0, 10));
      }
    }
    return Array.from(set).sort();
  }, [steps]);

  if (days.length === 0) {
    return <p className="py-6 text-center text-xs italic text-muted-foreground">Aucun jour à afficher.</p>;
  }

  const colWidth = 44;
  const labelWidth = 220;
  const gridTemplate = `${labelWidth}px repeat(${days.length}, ${colWidth}px)`;

  return (
    <div className="overflow-x-auto rounded-lg border border-border/50">
      <div className="min-w-fit">
        {/* Header jours */}
        <div className="grid items-center border-b border-border bg-muted/40 text-[10px]" style={{ gridTemplateColumns: gridTemplate }}>
          <div className="px-2 py-1.5 font-bold uppercase tracking-wider text-muted-foreground">Étape</div>
          {days.map((d) => (
            <div key={d} className="border-l border-border/40 px-1 py-1.5 text-center font-mono">
              <div className="text-muted-foreground">{formatDayName(d)}</div>
              <div className="font-bold">{formatShortDate(d)}</div>
            </div>
          ))}
        </div>

        {/* Lignes étapes */}
        {steps.map((step) => {
          const k = METIER_KEY_BY_ID[step.metier_id] ?? "Manut";
          const color = METIER_COLOR[k];
          const objLabel = step.objet_id ? (objetsLabel[step.objet_id] ?? step.objet_id) : "Global";
          const stepStart = step.start_date;
          const stepEndD = new Date(stepStart + "T00:00:00Z");
          stepEndD.setUTCDate(stepEndD.getUTCDate() + step.span_days - 1);
          const stepEnd = stepEndD.toISOString().slice(0, 10);

          return (
            <div
              key={step.id}
              className="grid items-center border-b border-border/30 hover:bg-muted/20"
              style={{ gridTemplateColumns: gridTemplate }}
            >
              <div className="flex items-center gap-2 px-2 py-1.5 text-xs">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
                <span className="font-semibold">{METIER_LABEL[k]}</span>
                <span className="truncate text-muted-foreground" title={objLabel}>
                  · {objLabel}
                </span>
              </div>
              {days.map((d) => {
                const inStep = d >= stepStart && d <= stepEnd;
                const dayAssigns = inStep ? assignments.filter((a) => a.step_id === step.id && a.date === d) : [];
                const totalPct = dayAssigns.reduce((acc, a) => acc + a.presence_pct, 0);
                const target = step.pers * 100;
                return (
                  <CalendarCell
                    key={d}
                    planId={planId}
                    step={step}
                    date={d}
                    inStep={inStep}
                    color={color}
                    assignments={dayAssigns}
                    totalPct={totalPct}
                    target={target}
                    cumulByEmpDate={cumulByEmpDate}
                    onChanged={onChanged}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CalendarCell({
  planId,
  step,
  date,
  inStep,
  color,
  assignments,
  totalPct,
  target,
  cumulByEmpDate,
  onChanged,
}: {
  planId: string;
  step: PlanStep;
  date: string;
  inStep: boolean;
  color: string;
  assignments: Assignment[];
  totalPct: number;
  target: number;
  cumulByEmpDate: Record<string, number>;
  onChanged: () => Promise<void>;
}) {
  const fetchSuggestions = useServerFn(getPersonnelSuggestions);
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [loadingSug, setLoadingSug] = useState(false);

  const ratio = target > 0 ? totalPct / target : 0;
  const isFull = ratio >= 1;
  const isMissing = inStep && ratio < 1;

  const loadSuggestions = useCallback(async () => {
    setLoadingSug(true);
    try {
      const r = await fetchSuggestions({ data: { stepId: step.id, date, planId } });
      setSuggestions(r.suggestions);
    } finally {
      setLoadingSug(false);
    }
  }, [fetchSuggestions, step.id, date, planId]);

  if (!inStep) {
    return <div className="border-l border-border/40 h-9" />;
  }

  const bgStyle = isFull
    ? { backgroundColor: `${color}40` }
    : ratio > 0
      ? { backgroundColor: `${color}1f` }
      : undefined;

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v && !suggestions) void loadSuggestions();
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`border-l border-border/40 h-9 flex items-center justify-center text-[10px] font-mono font-bold transition-colors hover:ring-2 hover:ring-primary/40 ${
            isMissing ? "text-amber-700 dark:text-amber-300" : "text-foreground"
          }`}
          style={bgStyle}
          title={`${assignments.length} aff. · ${totalPct}% / ${target}%`}
        >
          {assignments.length > 0 ? `${assignments.length}/${step.pers}` : isMissing ? "·" : ""}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="center">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold">
              {formatDayName(date)} {formatShortDate(date)}
            </div>
            <Badge variant="outline" className="font-mono text-[10px]">
              {totalPct}% / {target}%
            </Badge>
          </div>
          {assignments.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
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
          <div className="border-t border-border/40 pt-2">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Suggestions
              </span>
              <AutoStaffButton
                planId={planId}
                stepId={step.id}
                onlyDate={date}
                label="Auto ce jour"
                compact
                onDone={onChanged}
              />
            </div>
            {loadingSug ? (
              <div className="flex items-center justify-center py-3">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              </div>
            ) : suggestions && suggestions.length > 0 ? (
              <div className="grid gap-1.5">
                {suggestions.slice(0, 6).map((s) => (
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
              <p className="py-2 text-center text-[11px] italic text-muted-foreground">
                Aucun candidat disponible.
              </p>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
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
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="truncate text-xs font-semibold">
            {suggestion.employe.prenom} {suggestion.employe.nom}
          </p>
          <Badge className={`px-1 py-0 text-[9px] font-bold ${tier.bg} ${tier.text}`} variant="outline">
            {tier.label}
          </Badge>
          {suggestion.absent_today && (
            <Badge
              variant="outline"
              className="px-1 py-0 text-[9px] font-bold bg-destructive/15 text-destructive border-destructive/30"
              title="Absent ce jour"
            >
              Absent ce jour
            </Badge>
          )}
          {!suggestion.absent_today && suggestion.absent_days_in_step > 0 && (
            <Badge
              variant="outline"
              className="px-1 py-0 text-[9px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
              title={`Absent ${suggestion.absent_days_in_step} j sur la fenêtre du step`}
            >
              Absent {suggestion.absent_days_in_step} j
            </Badge>
          )}
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
          <Button size="sm" disabled={busy || alreadyAssigned} onClick={() => doAssign(100)}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : alreadyAssigned ? "Affecté" : "Affecter"}
          </Button>
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/* AssignedChip                                                         */
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
/* AutoStaffButton                                                      */
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
            (noms ? ` — ${noms}${r.details.length > 3 ? "…" : ""}` : ""),
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
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
      {!compact && <span className="ml-1 text-xs">Auto</span>}
      {compact && <span className="ml-1 text-[10px]">Auto</span>}
    </Button>
  );
}

// METIER_ID référencé pour future extension (tabs métier-id côté serveur)
void METIER_ID;
