import { useState } from "react";
import { StickyNote } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  note: string | null;
  disabled?: boolean;
  onSave: (note: string | null) => void;
}

/** Libellé d'étape libre sur une cellule (ex. « Placage galva », « Débit cloisons »). */
export function GrilleNotePopover({ note, disabled, onSave }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(note ?? "");

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setDraft(note ?? "");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled && !note}
          title={note ?? "Ajouter une note d'étape"}
          className={cn(
            "rounded p-0.5 transition-colors",
            note ? "text-primary" : "text-muted-foreground/30 hover:text-muted-foreground",
          )}
          aria-label="Note d'étape"
        >
          <StickyNote className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-2" align="start">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Libellé d'étape
        </p>
        <Textarea
          value={draft}
          disabled={disabled}
          rows={3}
          placeholder="Placage galva, papier peint, débit cloisons…"
          onChange={(e) => setDraft(e.target.value)}
        />
        {!disabled && (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button
              size="sm"
              onClick={() => {
                onSave(draft.trim() === "" ? null : draft.trim());
                setOpen(false);
              }}
            >
              Enregistrer
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
