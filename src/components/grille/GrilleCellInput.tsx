import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { formatHeures, parseHeures } from "@/lib/grille-fabrication";

interface Props {
  value: number;
  disabled?: boolean;
  className?: string;
  onCommit: (value: number) => void;
}

/**
 * Cellule d'heures éditable au clic : Entrée ou blur valide, Échap annule.
 * Une valeur à 0 affiche un point discret.
 */
export function GrilleCellInput({ value, disabled, className, onCommit }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const start = () => {
    if (disabled) return;
    setDraft(value ? String(value).replace(".", ",") : "");
    setInvalid(false);
    setEditing(true);
  };

  const commit = () => {
    const parsed = parseHeures(draft);
    if (parsed === null) {
      setInvalid(true);
      inputRef.current?.focus();
      return;
    }
    setEditing(false);
    if (parsed !== value) onCommit(parsed);
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={start}
        disabled={disabled}
        className={cn(
          "h-8 w-full rounded px-2 text-right text-sm tabular-nums transition-colors",
          disabled ? "cursor-default" : "hover:bg-accent",
          value ? "font-medium text-foreground" : "text-muted-foreground/50",
          className,
        )}
        aria-label="Heures prévues"
      >
        {formatHeures(value)}
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      value={draft}
      inputMode="decimal"
      onChange={(e) => {
        setDraft(e.target.value);
        setInvalid(false);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          setEditing(false);
        }
      }}
      className={cn(
        "h-8 w-full rounded border bg-background px-2 text-right text-sm tabular-nums outline-none ring-1 ring-primary/40",
        invalid && "border-destructive ring-destructive",
      )}
    />
  );
}
