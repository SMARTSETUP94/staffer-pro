// v0.35.10 P1 #6 — Bulk slider pers par métier
// Applique en un clic une valeur "pers" à TOUS les objets pour un métier donné (Bois ou Peint).
// Écrit dans le edit-store (batch, undo-able), pas de round-trip serveur.
import { useState } from "react";
import { Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useEditStore } from "@/lib/staffing/edit-store";
import { METIER_COLOR } from "./gantt-helpers";
import type { PlanStep } from "@/lib/staffing/types";
import { toast } from "sonner";

interface Props {
  /** Steps mergés (pour identifier ceux du métier visé) */
  steps: PlanStep[];
}

const TARGETS: Array<{ key: "Bois" | "Peint"; metier_id: number; label: string }> = [
  { key: "Bois", metier_id: 1, label: "Bois" },
  { key: "Peint", metier_id: 3, label: "Peinture" },
];

export function BulkPersByMetierBar({ steps }: Props) {
  const bulkSetPers = useEditStore((s) => s.bulkSetPers);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-border bg-muted/30 px-3 py-2">
      <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <Layers className="h-3.5 w-3.5" /> Bulk pers par métier
      </span>
      {TARGETS.map((t) => {
        const concerned = steps.filter(
          (s) => s.metier_id === t.metier_id && s.objet_id !== null,
        );
        if (concerned.length === 0) return null;
        return (
          <BulkPopover
            key={t.key}
            label={t.label}
            color={METIER_COLOR[t.key]}
            count={concerned.length}
            onApply={(pers) => {
              const entries = concerned.map((s) => ({ stepId: s.id, pers }));
              bulkSetPers(entries);
              toast.success(
                `${entries.length} étape${entries.length > 1 ? "s" : ""} ${t.label} → ${pers}p`,
              );
            }}
          />
        );
      })}
      <span className="ml-auto hidden text-[10px] text-muted-foreground sm:inline">
        Annulable via Ctrl/⌘+Z
      </span>
    </div>
  );
}

function BulkPopover({
  label,
  color,
  count,
  onApply,
}: {
  label: string;
  color: string;
  count: number;
  onApply: (pers: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(4);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-sm"
            style={{ backgroundColor: color }}
          />
          {label}
          <Badge variant="secondary" className="h-4 px-1 text-[9px]">
            {count}
          </Badge>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="start">
        <div className="space-y-3">
          <p className="text-xs font-semibold">
            Appliquer à <strong>{count}</strong> étape{count > 1 ? "s" : ""} {label}
          </p>
          <div className="flex items-center gap-3">
            <Slider
              min={2}
              max={12}
              step={2}
              value={[value]}
              onValueChange={(v) => setValue(v[0] ?? value)}
              className="flex-1"
            />
            <span className="w-10 font-mono text-sm font-bold tabular-nums">{value}p</span>
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button
              size="sm"
              onClick={() => {
                onApply(value);
                setOpen(false);
              }}
            >
              Appliquer
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
