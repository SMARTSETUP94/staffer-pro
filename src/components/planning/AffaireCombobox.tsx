import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Affaire } from "@/hooks/use-planning-data";

interface Props {
  affaires: Affaire[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  /** Si fourni, ces affaires apparaissent en haut (ex: actives cette semaine). */
  pinnedIds?: Set<string>;
}

export function AffaireCombobox({
  affaires,
  value,
  onChange,
  placeholder = "Rechercher une affaire (n°, nom, client)…",
  pinnedIds,
}: Props) {
  const [open, setOpen] = useState(false);

  const sorted = useMemo(() => {
    const list = [...affaires].sort((a, b) =>
      a.numero.localeCompare(b.numero, "fr", { numeric: true }),
    );
    if (!pinnedIds || pinnedIds.size === 0) return { pinned: [], rest: list };
    const pinned = list.filter((a) => pinnedIds.has(a.id));
    const rest = list.filter((a) => !pinnedIds.has(a.id));
    return { pinned, rest };
  }, [affaires, pinnedIds]);

  const selected = affaires.find((a) => a.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {selected ? (
            <span className="flex min-w-0 items-center gap-1.5 truncate">
              <span className="font-mono font-semibold">{selected.numero}</span>
              <span className="truncate text-muted-foreground">— {selected.nom}</span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Search className="h-3.5 w-3.5" />
              Sélectionner une affaire
            </span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command
          filter={(itemValue, search) => {
            // itemValue contient "numero|nom|client" en lowercase
            return itemValue.includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder={placeholder} />
          <CommandList>
            <CommandEmpty>Aucune affaire trouvée.</CommandEmpty>
            {sorted.pinned.length > 0 && (
              <CommandGroup heading="Actives cette semaine">
                {sorted.pinned.map((a) => (
                  <AffaireItem
                    key={a.id}
                    affaire={a}
                    selected={a.id === value}
                    onSelect={() => {
                      onChange(a.id);
                      setOpen(false);
                    }}
                  />
                ))}
              </CommandGroup>
            )}
            <CommandGroup
              heading={sorted.pinned.length > 0 ? "Toutes les affaires" : undefined}
            >
              {sorted.rest.map((a) => (
                <AffaireItem
                  key={a.id}
                  affaire={a}
                  selected={a.id === value}
                  onSelect={() => {
                    onChange(a.id);
                    setOpen(false);
                  }}
                />
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function AffaireItem({
  affaire,
  selected,
  onSelect,
}: {
  affaire: Affaire;
  selected: boolean;
  onSelect: () => void;
}) {
  // value utilisé par cmdk pour le filtre — concatène les champs cherchables
  const searchValue = [affaire.numero, affaire.nom, affaire.client ?? "", affaire.lieu ?? ""]
    .join("|")
    .toLowerCase();
  return (
    <CommandItem value={searchValue} onSelect={onSelect} className="flex items-start gap-2">
      <Check className={cn("mt-0.5 h-4 w-4 shrink-0", selected ? "opacity-100" : "opacity-0")} />
      <div className="flex min-w-0 flex-col">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs font-semibold">{affaire.numero}</span>
          <span className="truncate text-sm">{affaire.nom}</span>
        </div>
        {(affaire.client || affaire.lieu) && (
          <div className="truncate text-[10px] text-muted-foreground">
            {[affaire.client, affaire.lieu].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>
    </CommandItem>
  );
}
