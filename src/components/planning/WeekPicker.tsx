import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { format, addWeeks, startOfWeek, isSameDay } from "date-fns";
import { fr } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface Props {
  weekStart: Date;
  onChange: (newStart: Date) => void;
}

export function WeekPicker({ weekStart, onChange }: Props) {
  const weekEnd = addWeeks(weekStart, 1);
  weekEnd.setDate(weekEnd.getDate() - 1);
  const today = startOfWeek(new Date(), { weekStartsOn: 1 });
  const isCurrent = isSameDay(weekStart, today);

  return (
    <div className="flex items-center gap-2">
      <Button
        size="icon"
        variant="outline"
        onClick={() => onChange(addWeeks(weekStart, -1))}
        aria-label="Semaine précédente"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex min-w-[260px] items-center justify-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
            aria-label="Choisir une semaine"
          >
            <CalendarDays className="h-4 w-4 text-primary" />
            <span>
              Semaine {format(weekStart, "II")} —{" "}
              <span className="text-muted-foreground">
                {format(weekStart, "d MMM", { locale: fr })} → {format(weekEnd, "d MMM yyyy", { locale: fr })}
              </span>
            </span>
            {isCurrent && (
              <span className="ml-1 rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary">
                En cours
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="center">
          <Calendar
            mode="single"
            weekStartsOn={1}
            selected={weekStart}
            onSelect={(d) => d && onChange(startOfWeek(d, { weekStartsOn: 1 }))}
            locale={fr}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
      <Button
        size="icon"
        variant="outline"
        onClick={() => onChange(addWeeks(weekStart, 1))}
        aria-label="Semaine suivante"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      {!isCurrent && (
        <Button size="sm" variant="ghost" onClick={() => onChange(today)}>
          Aujourd'hui
        </Button>
      )}
    </div>
  );
}
