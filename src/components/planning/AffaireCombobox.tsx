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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { isAffaireSelectable } from "@/lib/affaire-lock";
import { getAffaireTypologie } from "@/lib/affaire-typologie";
import type { Affaire } from "@/hooks/use-planning-data";

interface Props {
  affaires: Affaire[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  /** Si fourni, ces affaires apparaissent en haut (ex: actives cette semaine). */
  pinnedIds?: Set<string>;
  /** v0.17 — Inclut aussi les opportunités (phase='opportunite', codes 9XXX). */
  includeOpportunites?: boolean;
  /** v0.17 — Toggle interne pour inclure les opportunités (staffing proto). */
  showOpportuniteToggle?: boolean;
  /**
   * v0.21 Bloc 4 — Inclure les affaires terminees/annulees.
   * Par defaut false : seules les affaires ouvertes sont selectionnables.
   * Mettre a true pour le filtrage Planning (lecture historique) ou pour l'admin.
   */
  includeClosed?: boolean;
}

export function AffaireCombobox({
  affaires,
  value,
  onChange,
  placeholder = "Rechercher une affaire (n°, nom, client)…",
  pinnedIds,
  includeOpportunites = false,
  showOpportuniteToggle = false,
  includeClosed = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [includeOpps, setIncludeOpps] = useState(includeOpportunites);
  // v0.27.7 — Fix #3 — Toggles typologies (par défaut OFF)
  const [includeNonOp, setIncludeNonOp] = useState(false);
  const [includeStockage, setIncludeStockage] = useState(false);

  const sorted = useMemo(() => {
    // v0.17 — Filtrer les opportunités sauf si toggle activé OU si la valeur sélectionnée en est une
    // v0.21 Bloc 4 — Filtrer les affaires terminees/annulees sauf si la valeur courante en est une
    // v0.27.7 — Filtrer non_operationnel et stockage sauf si toggles activés
    const filtered = affaires.filter((a) => {
      if (a.id === value) return true; // garde toujours la selection courante visible
      if (a.phase === "opportunite" && !includeOpps) return false;
      if (!includeClosed && !isAffaireSelectable(a)) return false;
      const typo = a.typologie ?? getAffaireTypologie(a.numero);
      if (typo === "non_operationnel" && !includeNonOp) return false;
      if (typo === "stockage" && !includeStockage) return false;
      return true;
    });
    const list = [...filtered].sort((a, b) =>
      a.numero.localeCompare(b.numero, "fr", { numeric: true }),
    );
    if (!pinnedIds || pinnedIds.size === 0) return { pinned: [], rest: list };
    const pinned = list.filter((a) => pinnedIds.has(a.id));
    const rest = list.filter((a) => !pinnedIds.has(a.id));
    return { pinned, rest };
  }, [affaires, pinnedIds, includeOpps, includeNonOp, includeStockage, value, includeClosed]);

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
        {showOpportuniteToggle && (
          <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2">
            <Label
              htmlFor="aff-include-opps"
              className="text-[11px] font-medium text-muted-foreground cursor-pointer"
            >
              Inclure opportunités (staffing proto)
            </Label>
            <Switch
              id="aff-include-opps"
              checked={includeOpps}
              onCheckedChange={setIncludeOpps}
            />
          </div>
        )}
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
          {affaire.phase === "opportunite" && (
            <span className="rounded bg-warning/20 px-1 py-0 text-[9px] font-bold uppercase tracking-wider text-warning-foreground">
              PROTO
            </span>
          )}
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
