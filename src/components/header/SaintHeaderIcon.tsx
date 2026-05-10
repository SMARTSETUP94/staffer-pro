/**
 * v0.40.x — Icône header "Saint du jour" (compaction widgets dashboard).
 * Toujours visible. Affiche le ou les saints du jour (FR).
 */
import { useMemo } from "react";
import { Sparkles } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { getSaintsForDate } from "@/lib/saints-fr";

const FR_MONTH = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function SaintHeaderIcon() {
  const { saints, dateLabel } = useMemo(() => {
    const d = new Date();
    return {
      saints: getSaintsForDate(d),
      dateLabel: `${d.getDate()} ${FR_MONTH[d.getMonth()]}`,
    };
  }, []);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-10 w-10"
          aria-label={`Saint du jour — ${dateLabel}`}
        >
          <Sparkles className="h-6 w-6 text-amber-500" strokeWidth={2} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Saint du jour
        </p>
        {saints.length === 0 ? (
          <p className="text-sm">
            <span className="font-medium">Aucun saint majeur</span>
            <span className="ml-1 text-muted-foreground">— {dateLabel}</span>
          </p>
        ) : (
          <p className="text-sm">
            <span className="font-medium">
              Saint{saints.length > 1 ? "s" : ""}{" "}
              {saints.map(capitalize).join(", ")}
            </span>
            <span className="ml-1 text-muted-foreground">— {dateLabel}</span>
          </p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          🙋 Pensez à souhaiter une bonne fête aux collègues concernés.
        </p>
      </PopoverContent>
    </Popover>
  );
}
