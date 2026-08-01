/**
 * Filtre chantiers virtualisé : recherche + liste à rendu fenêtré, pour rester
 * fluide même avec plusieurs centaines de chantiers planifiés.
 */
import { useMemo, useRef, useState } from "react";
import { Filter, X } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface AffaireOption {
  id: string;
  numero: string;
  nom: string;
  prospect: boolean;
}

const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function AffaireFilterMenu({
  affaires,
  selected,
  onToggle,
  onClear,
}: {
  affaires: AffaireOption[];
  selected: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
}) {
  const [q, setQ] = useState("");
  const parentRef = useRef<HTMLDivElement>(null);

  const items = useMemo(() => {
    const n = norm(q.trim());
    if (!n) return affaires;
    return affaires.filter((a) => norm(`${a.numero} ${a.nom}`).includes(n));
  }, [affaires, q]);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32,
    overscan: 12,
  });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          <Filter className="mr-1.5 h-4 w-4" />
          Chantiers{selected.length > 0 ? ` (${selected.length})` : ""}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2">
        <div className="flex items-center gap-1.5">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher un chantier…"
            className="h-8"
            aria-label="Rechercher un chantier"
          />
          {selected.length > 0 && (
            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Réinitialiser"
              onClick={onClear}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        <p className="px-1 py-1.5 text-[11px] text-muted-foreground">
          {items.length} chantier{items.length > 1 ? "s" : ""}
        </p>
        <div ref={parentRef} className="max-h-72 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-1 py-2 text-xs text-muted-foreground">Aucun chantier.</p>
          ) : (
            <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
              {virtualizer.getVirtualItems().map((v) => {
                const a = items[v.index]!;
                const checked = selected.includes(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => onToggle(a.id)}
                    className={cn(
                      "absolute left-0 top-0 flex w-full items-center gap-2 rounded px-1.5 text-left text-sm hover:bg-accent",
                      checked && "bg-accent/60",
                    )}
                    style={{ height: v.size, transform: `translateY(${v.start}px)` }}
                  >
                    <Checkbox checked={checked} className="pointer-events-none" tabIndex={-1} />
                    <span className="truncate">{a.numero} · {a.nom}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
