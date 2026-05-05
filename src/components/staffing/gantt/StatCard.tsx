// v0.39.2b2.1 — Sprint 2b2 Tour 1 : extrait depuis GanttInteractif.tsx (1029L → split).
// Carte stat réutilisable avec popover détail optionnel.
import * as React from "react";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClassName?: string;
  detail?: React.ReactNode;
  badge?: { label: string; severity: "hard" | "soft" } | null;
  subline?: React.ReactNode;
}

export function StatCard({
  icon,
  label,
  value,
  valueClassName,
  detail,
  badge,
  subline,
}: StatCardProps) {
  const badgeCls =
    badge?.severity === "hard"
      ? "bg-destructive/15 text-destructive border-destructive/30"
      : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
  const card = (
    <div
      className={`rounded-2xl border border-border bg-card p-4 ${detail ? "cursor-help transition hover:border-primary/40 hover:shadow-sm" : ""}`}
    >
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
        {detail && <Info className="ml-auto h-3.5 w-3.5 opacity-60" />}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <p className={`text-2xl font-bold ${valueClassName ?? "text-foreground"}`}>{value}</p>
        {badge && (
          <span
            className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${badgeCls}`}
            aria-label={`Écart vs devis ${badge.label}`}
          >
            {badge.label}
          </span>
        )}
      </div>
      {subline && <div className="mt-1 text-[11px] text-muted-foreground">{subline}</div>}
    </div>
  );
  if (!detail) return card;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="text-left">
          {card}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[420px] max-w-[92vw]">
        {detail}
      </PopoverContent>
    </Popover>
  );
}
