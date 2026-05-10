/**
 * v0.22.1 — MultiSelectCombo : popover + command + checkboxes.
 * Utilisé par /heures-analyse pour filtres chantier / employé / devis.
 */
import { useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export interface MultiSelectOption {
  value: string;
  label: string;
  hint?: string;
}

export interface MultiSelectComboProps {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
}

export function MultiSelectCombo({
  options,
  selected,
  onChange,
  placeholder = "Sélectionner…",
  searchPlaceholder = "Rechercher…",
  emptyText = "Aucun résultat",
  className,
  disabled,
}: MultiSelectComboProps) {
  const [open, setOpen] = useState(false);

  function toggle(v: string) {
    if (selected.includes(v)) onChange(selected.filter((x) => x !== v));
    else onChange([...selected, v]);
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange([]);
  }

  const summary =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
        : `${selected.length} sélectionnés`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          disabled={disabled}
          className={cn("h-9 w-full justify-between font-normal", className)}
        >
          <span className={cn("truncate", selected.length === 0 && "text-muted-foreground")}>
            {summary}
          </span>
          <span className="ml-2 flex items-center gap-1">
            {selected.length > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 font-mono text-[10px]">
                {selected.length}
              </Badge>
            )}
            {selected.length > 0 ? (
              <X
                role="button"
                aria-label="Effacer"
                className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground"
                onClick={clear}
              />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 opacity-50" />
            )}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => {
                const isSel = selected.includes(opt.value);
                return (
                  <CommandItem
                    key={opt.value}
                    value={`${opt.label} ${opt.hint ?? ""}`}
                    onSelect={() => toggle(opt.value)}
                  >
                    <Check className={cn("mr-2 h-4 w-4", isSel ? "opacity-100" : "opacity-0")} />
                    <div className="flex flex-1 items-center justify-between gap-2">
                      <span className="truncate">{opt.label}</span>
                      {opt.hint && (
                        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                          {opt.hint}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
