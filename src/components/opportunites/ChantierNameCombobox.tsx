import { useEffect, useState } from "react";
import { ChevronsUpDown, Loader2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { filterChantierSuggestions, type ChantierSuggestion } from "@/lib/opportunite-search";

interface Props {
  value: string;
  onChange: (value: string) => void;
  clientId: string | null;
  disabled?: boolean;
}

export function ChantierNameCombobox({ value, onChange, clientId, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<ChantierSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError(false);
    void (async () => {
      const { data, error } = await supabase.from("affaires")
        .select("id,numero,nom,client,client_id,lieu").order("numero", { ascending: false }).limit(1000);
      if (!active) return;
      setLoading(false);
      setError(Boolean(error));
      if (data) setRows(data);
    })();
    return () => { active = false; };
  }, [open]);

  const select = (name: string) => { onChange(name); setOpen(false); };
  const suggestions = filterChantierSuggestions(rows, query, clientId);

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) setQuery(value); }}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-label="Intitulé du chantier" aria-expanded={open}
          disabled={disabled} className="h-10 w-full min-w-0 justify-between rounded-xl font-normal">
          <span className={`truncate ${value ? "" : "text-muted-foreground"}`}>{value || "Rechercher ou saisir un chantier…"}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Numéro, nom, client, lieu…" value={query} onValueChange={setQuery} />
          <CommandList>
            {loading && <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Chargement…</div>}
            {error && <p className="px-3 py-2 text-sm text-destructive">Recherche indisponible. La saisie libre reste possible.</p>}
            <CommandGroup>
              {query.trim() && <CommandItem value="__new__" onSelect={() => select(query.trim())} className="text-primary">
                <Plus className="mr-2 h-4 w-4 shrink-0" /><span className="break-words">Nouvel intitulé : « {query.trim()} »</span>
              </CommandItem>}
              {value && <CommandItem value="__clear__" onSelect={() => select("")} className="text-muted-foreground">Effacer l’intitulé</CommandItem>}
            </CommandGroup>
            <CommandEmpty>Aucun chantier trouvé.</CommandEmpty>
            <CommandGroup heading="Chantiers et opportunités existants">
              {suggestions.map((row) => <CommandItem key={row.id} value={row.id} onSelect={() => select(row.nom)}>
                <div className="min-w-0"><div className="break-words"><span className="font-mono">{row.numero}</span> — {row.nom}</div>
                  <div className="text-xs text-muted-foreground">{[row.client, row.lieu].filter(Boolean).join(" · ")}</div>
                </div>
              </CommandItem>)}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}