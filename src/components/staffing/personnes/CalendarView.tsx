// Sprint 2b2.2 — Vue calendrier (lignes étapes × colonnes jours) avec popover par cellule.
import { useCallback, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  assignPersonneToStep,
  getPersonnelSuggestions,
} from "@/server/staffing-personnes.functions";
import { METIER_KEY_BY_ID, type PlanStep } from "@/lib/staffing/types";
import { METIER_COLOR, METIER_LABEL, formatDayName, formatShortDate } from "../gantt-helpers";
import { ObjetRefLabel, parseObjetLabel } from "../ObjetRefLabel";
import { AssignedChip } from "./AssignedChip";
import { AutoStaffButton } from "./AutoStaffButton";
import { PersonneSuggestionCard } from "./PersonneSuggestionCard";
import { effectiveSpanDays, type Assignment, type Suggestion } from "./shared";

export function CalendarView({
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
  const days = useMemo(() => {
    const set = new Set<string>();
    for (const s of steps) {
      const start = new Date(s.start_date + "T00:00:00Z");
      for (let i = 0; i < effectiveSpanDays(s); i++) {
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
        <div className="grid items-center border-b border-border bg-muted/40 text-[10px]" style={{ gridTemplateColumns: gridTemplate }}>
          <div className="px-2 py-1.5 font-bold uppercase tracking-wider text-muted-foreground">Étape</div>
          {days.map((d) => (
            <div key={d} className="border-l border-border/40 px-1 py-1.5 text-center font-mono">
              <div className="text-muted-foreground">{formatDayName(d)}</div>
              <div className="font-bold">{formatShortDate(d)}</div>
            </div>
          ))}
        </div>

        {steps.map((step) => {
          const k = METIER_KEY_BY_ID[step.metier_id] ?? "Manut";
          const color = METIER_COLOR[k];
          const objLabel = step.objet_id ? (objetsLabel[step.objet_id] ?? step.objet_id) : "Global";
          const stepStart = step.start_date;
          const stepEndD = new Date(stepStart + "T00:00:00Z");
          stepEndD.setUTCDate(stepEndD.getUTCDate() + effectiveSpanDays(step) - 1);
          const stepEnd = stepEndD.toISOString().slice(0, 10);

          return (
            <div
              key={step.id}
              className="grid items-center border-b border-border/30 hover:bg-muted/20"
              style={{ gridTemplateColumns: gridTemplate }}
            >
              <div className="flex items-center gap-2 px-2 py-1.5 text-xs min-w-0">
                <span className="inline-block h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: color }} />
                <span className="font-semibold shrink-0">{METIER_LABEL[k]}</span>
                <span className="text-muted-foreground shrink-0">·</span>
                {step.objet_id ? (
                  (() => {
                    const parsed = parseObjetLabel(objLabel);
                    return <ObjetRefLabel reference={parsed.reference} nom={parsed.nom} />;
                  })()
                ) : (
                  <span className="font-mono text-[11px] font-semibold">Global</span>
                )}
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
