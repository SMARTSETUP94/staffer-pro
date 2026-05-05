// Sprint 3b.2 — Autocomplete prestataire branché sur le carnet sous_traitants
import { useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { useSousTraitants } from "@/hooks/use-sous-traitants";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function PrestataireAutocomplete({ value, onChange, placeholder }: Props) {
  const { data } = useSousTraitants({ type: "transport", actifOnly: true });
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<number | null>(null);

  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase();
    const list = q
      ? data.filter((st) => st.nom.toLowerCase().includes(q))
      : data;
    return list.slice(0, 8);
  }, [data, value]);

  return (
    <div className="relative">
      <Input
        id="prestataire"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          if (blurTimer.current) window.clearTimeout(blurTimer.current);
          blurTimer.current = window.setTimeout(() => setOpen(false), 150);
        }}
        placeholder={placeholder ?? "Ex : Transports Dupont…"}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-56 overflow-auto">
          {suggestions.map((st) => (
            <li
              key={st.id}
              role="option"
              tabIndex={-1}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(st.nom);
                setOpen(false);
              }}
              className="cursor-pointer px-3 py-2 text-sm hover:bg-accent"
            >
              <div className="font-medium">{st.nom}</div>
              {(st.contact_nom || st.telephone) && (
                <div className="text-xs text-muted-foreground">
                  {[st.contact_nom, st.telephone].filter(Boolean).join(" · ")}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
