// Sprint 2b2.2 — Vue liste (Accordion étape × jours) avec suggestions tier-based.
import { useCallback, useMemo, useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { effectiveSpanDays, formatSpanLabel, type Assignment, type Suggestion } from "./shared";

export function ListView({
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
  const grouped = useMemo(() => {
    return steps.map((step) => {
      const days: Array<{ date: string; key: string }> = [];
      const start = new Date(step.start_date + "T00:00:00Z");
      for (let i = 0; i < effectiveSpanDays(step); i++) {
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
        const parsed = step.objet_id ? parseObjetLabel(objLabel) : { reference: "Global", nom: "" };
        const stepAssigns = assignments.filter((a) => a.step_id === step.id);
        const cov = coverByStep[step.id];
        const targetPersDays = cov?.target ?? step.pers * effectiveSpanDays(step);
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
                  <ObjetRefLabel
                    reference={parsed.reference}
                    nom={parsed.nom}
                    className="max-w-[280px]"
                  />
                  <span className="ml-auto flex items-center gap-2 text-xs">
                    <span className="font-mono">
                      {step.pers}p × {formatSpanLabel(step)}
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
          <Button onClick={toggleOpen} size="sm" variant={open ? "secondary" : "outline"} data-write="1">
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
