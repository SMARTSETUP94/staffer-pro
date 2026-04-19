import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface Option {
  id: string | number;
  label: string;
  sub?: string;
  color?: string;
}

interface Props {
  label: string;
  options: Option[];
  selected: Set<string | number>;
  onChange: (next: Set<string | number>) => void;
}

export function MultiFilter({ label, options, selected, onChange }: Props) {
  const toggle = (id: string | number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };
  const clear = () => onChange(new Set());

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-2">
          {label}
          {selected.size > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
              {selected.size}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-1" align="start">
        <div className="flex items-center justify-between border-b px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span>{label}</span>
          {selected.size > 0 && (
            <button onClick={clear} className="flex items-center gap-0.5 text-destructive hover:underline">
              <X className="h-3 w-3" /> tout effacer
            </button>
          )}
        </div>
        <div className="max-h-[300px] overflow-y-auto py-1">
          {options.length === 0 && (
            <p className="p-2 text-xs text-muted-foreground italic">Aucune option</p>
          )}
          {options.map((opt) => {
            const active = selected.has(opt.id);
            return (
              <button
                key={opt.id}
                onClick={() => toggle(opt.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted",
                  active && "bg-accent",
                )}
              >
                <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded border">
                  {active && <Check className="h-3 w-3 text-primary" />}
                </div>
                {opt.color && (
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: opt.color }}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{opt.label}</div>
                  {opt.sub && <div className="truncate text-[10px] text-muted-foreground">{opt.sub}</div>}
                </div>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
