import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, Plus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ClientOption {
  id: string;
  nom: string;
  domaines_email: string[] | null;
}

interface Props {
  value: string | null;
  clientId: string | null;
  onChange: (clientId: string | null, nom: string) => void;
  disabled?: boolean;
}

function normalize(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function ClientCombobox({ value, clientId, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ClientOption[]>([]);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("clients")
        .select("id,nom,domaines_email")
        .eq("actif", true)
        .order("nom", { ascending: true })
        .limit(500);
      if (active && data) setItems(data as ClientOption[]);
    })();
    return () => { active = false; };
  }, []);

  const exists = items.some((c) => normalize(c.nom) === normalize(query));
  const trimmed = query.trim();

  const handleCreate = async () => {
    if (!trimmed) return;
    setCreating(true);
    const { data, error } = await supabase
      .from("clients")
      .insert({ nom: trimmed, nom_normalise: normalize(trimmed), domaines_email: [] })
      .select("id,nom,domaines_email")
      .single();
    setCreating(false);
    if (error || !data) {
      toast.error("Création client impossible", { description: error?.message });
      return;
    }
    setItems((prev) => [...prev, data as ClientOption].sort((a, b) => a.nom.localeCompare(b.nom)));
    onChange(data.id, data.nom);
    setOpen(false);
    toast.success(`Client « ${data.nom} » créé`);
  };

  const selected = clientId ? items.find((c) => c.id === clientId) : null;
  const label = selected?.nom ?? value ?? "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          className="h-10 w-full justify-between rounded-xl font-normal"
        >
          <span className={cn("truncate", !label && "text-muted-foreground")}>
            {label || "Sélectionner un client…"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter>
          <CommandInput placeholder="Rechercher un client…" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>
              {trimmed ? (
                <button
                  type="button"
                  onClick={handleCreate}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                  disabled={creating}
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Créer « {trimmed} »
                </button>
              ) : (
                <span className="block px-3 py-2 text-sm text-muted-foreground">Aucun client</span>
              )}
            </CommandEmpty>
            <CommandGroup>
              {clientId && (
                <CommandItem
                  value="__clear__"
                  onSelect={() => { onChange(null, ""); setOpen(false); }}
                  className="text-muted-foreground"
                >
                  Détacher le client
                </CommandItem>
              )}
              {items.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.nom}
                  onSelect={() => { onChange(c.id, c.nom); setOpen(false); }}
                >
                  <Check className={cn("mr-2 h-4 w-4", clientId === c.id ? "opacity-100" : "opacity-0")} />
                  <div className="flex flex-col">
                    <span>{c.nom}</span>
                    {c.domaines_email && c.domaines_email.length > 0 && (
                      <span className="text-xs text-muted-foreground">{c.domaines_email.join(", ")}</span>
                    )}
                  </div>
                </CommandItem>
              ))}
              {trimmed && !exists && (
                <CommandItem value={`__create__${trimmed}`} onSelect={handleCreate} className="text-primary">
                  {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  Créer « {trimmed} »
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
