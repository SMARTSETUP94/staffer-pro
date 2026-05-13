// v0.48 — Bande grise des absences validées dans le Gantt fab.
// Affiche un rang AM|PM par jour, gris si ≥1 employé absent ce slot.
// Tooltip listing employés + type d'absence pour expliquer pourquoi
// l'auto-staffing a écarté certaines personnes.
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ABSENCE_LABEL, ABSENCE_ICON } from "@/lib/absence-helpers";
import type { Absence } from "@/hooks/use-planning-data";

interface EmpRef { id: string; prenom: string; nom: string }

export function AbsencesBand({
  days,
  gridTemplate,
}: {
  days: string[];
  gridTemplate: string;
}) {
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [empById, setEmpById] = useState<Record<string, EmpRef>>({});

  useEffect(() => {
    if (days.length === 0) return;
    const start = days[0];
    const end = days[days.length - 1];
    let cancel = false;
    void (async () => {
      const { data, error } = await supabase
        .from("absences")
        .select("id, employe_id, date_debut, date_fin, type, demi_journee, motif, valide")
        .eq("valide", true)
        .lte("date_debut", end)
        .gte("date_fin", start);
      if (error || cancel || !data) return;
      setAbsences(data as Absence[]);
      const empIds = Array.from(new Set(data.map((a) => a.employe_id)));
      if (empIds.length === 0) return;
      const { data: emps } = await supabase
        .from("employes")
        .select("id, prenom, nom")
        .in("id", empIds);
      if (cancel || !emps) return;
      setEmpById(Object.fromEntries(emps.map((e) => [e.id, e as EmpRef])));
    })();
    return () => { cancel = true; };
  }, [days]);

  /** Pour chaque jour×slot, liste des absences couvrant ce slot. */
  const cells = useMemo(() => {
    const out: { day: string; slot: "AM" | "PM"; abs: Absence[] }[] = [];
    for (const d of days) {
      for (const slot of ["AM", "PM"] as const) {
        const matched = absences.filter((a) => {
          if (d < a.date_debut || d > a.date_fin) return false;
          if (a.demi_journee == null || a.demi_journee === "JOURNEE") return true;
          return a.demi_journee === slot;
        });
        out.push({ day: d, slot, abs: matched });
      }
    }
    return out;
  }, [days, absences]);

  const totalAbs = absences.length;
  if (totalAbs === 0) return null;

  return (
    <TooltipProvider delayDuration={120}>
      <div
        data-testid="gantt-absences-band"
        className="grid items-stretch border-b border-border/60 bg-background/40"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Absences validées
          <span className="ml-1 font-mono text-[9px] text-muted-foreground/70">({totalAbs})</span>
        </div>
        {cells.map(({ day, slot, abs }) => {
          if (abs.length === 0) {
            return (
              <div
                key={`${day}-${slot}`}
                className={slot === "AM" ? "border-l border-border/60 h-6" : "border-l border-border/20 h-6"}
              />
            );
          }
          const names = abs.map((a) => {
            const e = empById[a.employe_id];
            const who = e ? `${e.prenom} ${e.nom}` : "Employé";
            return `${ABSENCE_ICON[a.type]} ${who} — ${ABSENCE_LABEL[a.type]}`;
          });
          return (
            <Tooltip key={`${day}-${slot}`}>
              <TooltipTrigger asChild>
                <div
                  data-testid="gantt-absence-cell"
                  data-day={day}
                  data-slot={slot}
                  className={
                    (slot === "AM" ? "border-l border-border/60" : "border-l border-border/20") +
                    " h-6 bg-muted-foreground/25 hover:bg-muted-foreground/40 cursor-help flex items-center justify-center text-[9px] font-mono text-muted-foreground"
                  }
                >
                  {abs.length > 1 ? abs.length : ""}
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <div className="space-y-0.5 text-xs">
                  <div className="font-bold">{day} · {slot}</div>
                  {names.map((n, i) => (
                    <div key={i}>{n}</div>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
