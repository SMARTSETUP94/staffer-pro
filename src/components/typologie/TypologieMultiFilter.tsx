import { useMemo } from "react";
import { Check, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  type AffaireTypologie,
  AFFAIRE_TYPOLOGIES,
  AFFAIRE_TYPOLOGIE_LABELS,
  AFFAIRE_TYPOLOGIE_COLORS,
  OPERATIONNEL_TYPOLOGIES,
} from "@/lib/affaire-typologie";

interface TypologieMultiFilterProps {
  value: AffaireTypologie[];
  onChange: (next: AffaireTypologie[]) => void;
  /** Compteurs par typologie — affichés dans le bouton si fournis. */
  counts?: Partial<Record<AffaireTypologie, number>>;
  /** Affiche le bouton preset "Opérationnels". Défaut: true. */
  presetOperationnel?: boolean;
  className?: string;
}

/**
 * Multi-filter typologie chantiers — checkboxes inline avec preset "Opérationnels".
 * Réutilisable Planning / Liste Chantiers / Kanban Opportunités / Dashboard.
 */
export function TypologieMultiFilter({
  value,
  onChange,
  counts,
  presetOperationnel = true,
  className,
}: TypologieMultiFilterProps) {
  const selected = useMemo(() => new Set(value), [value]);

  const toggle = (t: AffaireTypologie) => {
    const next = new Set(selected);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    onChange(Array.from(next));
  };

  const isOperationnelActive =
    selected.size === OPERATIONNEL_TYPOLOGIES.length &&
    OPERATIONNEL_TYPOLOGIES.every((t) => selected.has(t));

  const applyOperationnel = () => {
    onChange(isOperationnelActive ? [] : [...OPERATIONNEL_TYPOLOGIES]);
  };

  const clearAll = () => onChange([]);

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {presetOperationnel && (
        <Button
          type="button"
          size="sm"
          variant={isOperationnelActive ? "default" : "outline"}
          onClick={applyOperationnel}
          className="h-7 gap-1 text-xs"
        >
          <Sparkles className="h-3 w-3" />
          Opérationnels
        </Button>
      )}

      {AFFAIRE_TYPOLOGIES.map((t) => {
        const isOn = selected.has(t);
        const colors = AFFAIRE_TYPOLOGIE_COLORS[t];
        const count = counts?.[t];
        return (
          <button
            type="button"
            key={t}
            onClick={() => toggle(t)}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold transition-colors",
              "hover:opacity-90",
              isOn ? "ring-2 ring-offset-1 ring-offset-background" : "opacity-70",
            )}
            style={{
              backgroundColor: colors.bg,
              color: colors.fg,
              borderColor: colors.fg,
              ...(isOn ? ({ "--tw-ring-color": colors.fg } as React.CSSProperties) : {}),
            }}
            aria-pressed={isOn}
          >
            {isOn && <Check className="h-3 w-3" />}
            <span className="uppercase tracking-wider">{AFFAIRE_TYPOLOGIE_LABELS[t]}</span>
            {typeof count === "number" && (
              <span className="ml-0.5 rounded-full bg-background/40 px-1 text-[10px] font-bold">
                {count}
              </span>
            )}
          </button>
        );
      })}

      {selected.size > 0 && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={clearAll}
          className="h-7 gap-1 text-xs text-muted-foreground"
        >
          <X className="h-3 w-3" />
          Effacer
        </Button>
      )}
    </div>
  );
}
