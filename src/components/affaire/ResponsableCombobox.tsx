import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { matchesOpportunityKeywords } from "@/lib/opportunite-search";
import { cn } from "@/lib/utils";

interface Props {
  value: string | null;
  onChange: (id: string | null) => void;
  label: string;
  disabled?: boolean;
}

export function ResponsableCombobox({ value, onChange, label, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data = [], isLoading, isError } = useQuery({
    queryKey: ["affaire-responsables-profils"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, email").order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const selected = data.find((p) => p.id === value);
  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) setSearch(""); }}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-label={label} aria-expanded={open}
          disabled={disabled || isLoading || isError} className="h-9 w-full min-w-40 justify-between gap-2 font-normal">
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {isError ? "Chargement impossible" : isLoading ? "Chargement…" : selected?.full_name || selected?.email || (value ? "Profil indisponible" : "Non affecté")}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Rechercher une personne…" value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>Aucune personne trouvée.</CommandEmpty>
            <CommandGroup>
              {!search && <CommandItem value="__clear__" onSelect={() => { onChange(null); setOpen(false); }}>Non affecté</CommandItem>}
              {data.filter((p) => matchesOpportunityKeywords([p.full_name, p.email], search)).map((p) => (
                <CommandItem key={p.id} value={p.id} onSelect={() => { onChange(p.id); setOpen(false); }}>
                  <Check className={cn("mr-2 h-4 w-4 shrink-0", value === p.id ? "opacity-100" : "opacity-0")} />
                  <span className="break-words">{p.full_name || p.email}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}