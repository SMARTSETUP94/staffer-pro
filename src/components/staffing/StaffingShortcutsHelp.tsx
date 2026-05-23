// v0.35.10 #5 — Aide raccourcis clavier staffing
// Affiche un dialog avec tous les raccourcis disponibles. Activé par ? (Shift+/).
import { useEffect, useState } from "react";
import { Keyboard } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const SHORTCUTS: Array<{ keys: string[]; label: string }> = [
  { keys: ["⌘", "S"], label: "Enregistrer les modifications" },
  { keys: ["A"], label: "Auto-staff plan complet (brouillon uniquement)" },
  { keys: ["P"], label: "Publier le plan (brouillon uniquement)" },
  { keys: ["?"], label: "Afficher cette aide" },
  { keys: ["Échap"], label: "Fermer dialog / popover" },
];

interface Props {
  /** Callback déclenché par la touche A (auto-staff plan). null = désactivé. */
  onAutoStaff?: (() => void) | null;
  /** Callback déclenché par la touche P (ouvre le dialog Publier). null = désactivé. */
  onPublish?: (() => void) | null;
}

export function StaffingShortcutsHelp({ onAutoStaff, onPublish }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (ev: KeyboardEvent) => {
      // ignore si focus dans input/textarea
      const target = ev.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || target?.isContentEditable) return;
      // ignore si modifier (sauf Shift+/ qui produit ?)
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;

      if (ev.key === "?" || (ev.shiftKey && ev.key === "/")) {
        ev.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if ((ev.key === "a" || ev.key === "A") && onAutoStaff) {
        ev.preventDefault();
        onAutoStaff();
      }
      if ((ev.key === "p" || ev.key === "P") && onPublish) {
        ev.preventDefault();
        onPublish();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onAutoStaff, onPublish]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground"
          title="Raccourcis clavier (?)"
        >
          <Keyboard className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            Raccourcis clavier
          </DialogTitle>
          <DialogDescription>
            Pour aller plus vite sur la page Plan staffing.
          </DialogDescription>
        </DialogHeader>
        <ul className="divide-y divide-border">
          {SHORTCUTS.map((s) => (
            <li key={s.label} className="flex items-center justify-between py-2">
              <span className="text-sm">{s.label}</span>
              <span className="flex gap-1">
                {s.keys.map((k) => (
                  <kbd
                    key={k}
                    className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded border border-border bg-muted px-1.5 font-mono text-xs"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-muted-foreground">
          Astuce : appuyez sur <kbd className="rounded border border-border bg-muted px-1 font-mono">?</kbd>{" "}
          n'importe où pour rouvrir cette fenêtre.
        </p>
      </DialogContent>
    </Dialog>
  );
}
