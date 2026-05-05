// Sprint 2b2.2 — Types & helpers partagés StaffingPersonnesSection.
import type { PlanStep } from "@/lib/staffing/types";

export interface Suggestion {
  employe: { id: string; nom: string; prenom: string; metier_principal_id: number; type_contrat: string };
  score: number;
  tier: 1 | 2 | 3 | 4;
  dispo_pct: number;
  absent_days_in_step: number;
  absent_today: boolean;
}

export interface Assignment {
  id: string;
  step_id: string;
  employe_id: string;
  date: string;
  presence_pct: number;
  nom: string;
  prenom: string;
  type_contrat: string;
}

export const TIER_COLORS: Record<1 | 2 | 3 | 4, { bg: string; text: string; label: string }> = {
  1: { bg: "bg-emerald-500/15", text: "text-emerald-700 dark:text-emerald-300", label: "Tier 1" },
  2: { bg: "bg-sky-500/15", text: "text-sky-700 dark:text-sky-300", label: "Tier 2" },
  3: { bg: "bg-amber-500/15", text: "text-amber-700 dark:text-amber-300", label: "Tier 3" },
  4: { bg: "bg-orange-500/15", text: "text-orange-700 dark:text-orange-300", label: "Tier 4 · Dépannage" },
};

/** v0.38.1.1 — helpers demi-journée (alignement Gantt) */
export function effectiveDemi(step: PlanStep): number {
  return step.span_demi_jours ?? (step.span_days ?? 0) * 2;
}
export function effectiveSpanDays(step: PlanStep): number {
  return Math.max(1, Math.ceil(effectiveDemi(step) / 2));
}
export function formatSpanLabel(step: PlanStep): string {
  const demi = effectiveDemi(step);
  const full = Math.floor(demi / 2);
  const half = demi % 2;
  if (full === 0) return `${half}½j`;
  return half ? `${full}½j` : `${full}j`;
}
