import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { searchAddress, type NominatimResult } from "@/lib/nominatim";
import type { AdresseFavorite } from "@/hooks/use-vehicules";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onValueChange: (val: string, favoriteId?: string | null) => void;
  favorites: AdresseFavorite[];
  placeholder?: string;
  /** Nom courant de la favorite sélectionnée (ex "Entrepôt Vitry") */
  favoriteId?: string | null;
}

/**
 * Champ d'adresse :
 * - liste les favoris (toujours en tête, filtrés par texte)
 * - autocomplete Nominatim après 600ms de pause + min 3 chars
 * - rate-limit côté Nominatim (1 req/s)
 */
export function AddressAutocomplete({
  value, onValueChange, favorites, placeholder, favoriteId,
}: Props) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();
    if (value.trim().length < 3) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      abortRef.current = new AbortController();
      setLoading(true);
      searchAddress(value, abortRef.current.signal)
        .then(setResults)
        .finally(() => setLoading(false));
    }, 600);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  const filteredFavorites = value.trim().length === 0
    ? favorites.slice(0, 8)
    : favorites.filter((f) =>
        (f.nom + " " + f.adresse_complete).toLowerCase().includes(value.toLowerCase()),
      ).slice(0, 5);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative">
          <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={value}
            onChange={(e) => {
              onValueChange(e.target.value, null);
              if (!open) setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder ?? "Adresse…"}
            className={cn("pl-8", favoriteId && "bg-accent/40")}
          />
          {favoriteId && (
            <Star className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-warning fill-warning" />
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="max-h-[300px] overflow-y-auto py-1">
          {filteredFavorites.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Favoris
              </div>
              {filteredFavorites.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    onValueChange(f.adresse_complete, f.id);
                    setOpen(false);
                  }}
                  className="flex w-full items-start gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent"
                >
                  <Star className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{f.nom}</div>
                    <div className="text-xs text-muted-foreground truncate">{f.adresse_complete}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
          {loading && (
            <div className="flex items-center justify-center py-2">
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            </div>
          )}
          {results.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Suggestions OpenStreetMap
              </div>
              {results.map((r) => (
                <button
                  key={r.place_id}
                  type="button"
                  onClick={() => {
                    onValueChange(r.display_name, null);
                    setOpen(false);
                  }}
                  className="flex w-full items-start gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent"
                >
                  <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="text-xs">{r.display_name}</span>
                </button>
              ))}
            </div>
          )}
          {!loading && results.length === 0 && filteredFavorites.length === 0 && value.trim().length >= 3 && (
            <div className="px-3 py-3 text-center text-xs text-muted-foreground">
              Aucune suggestion. Tape l'adresse à la main, elle sera enregistrée telle quelle.
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
