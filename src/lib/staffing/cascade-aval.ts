// v0.39.2 — Helpers cascade aval pour Vue 2 (Objet/Étape).
// Quand on modifie une étape (durée ou décalage), les étapes AVAL du MÊME objet
// doivent suivre le mouvement. Les étapes amont restent collées à leur position.
import type { PlanStep } from "./types";
import { addWorkingDays } from "./date-utils";

export interface DownstreamShiftEntry {
  stepId: string;
  /** Delta de jours à AJOUTER au manual_shift courant. */
  deltaDays: number;
}

/**
 * Identifie les steps aval d'un objet par rapport à un step pivot.
 * Critère : même objet_id, start_date STRICTEMENT > pivot.start_date (current effective).
 * On exclut le pivot lui-même.
 */
export function findDownstreamSteps(
  steps: ReadonlyArray<PlanStep>,
  pivot: PlanStep,
): PlanStep[] {
  if (!pivot.objet_id) return [];
  return steps.filter(
    (s) =>
      s.id !== pivot.id &&
      s.objet_id === pivot.objet_id &&
      s.start_date !== "TBD" &&
      s.start_date > pivot.start_date,
  );
}

/**
 * Calcule les shifts à appliquer aux steps aval pour un changement de durée.
 * @param oldSpanDays span_days effectif courant du pivot
 * @param newSpanDays span_days nouveau
 */
export function computeCascadeForDurationChange(
  steps: ReadonlyArray<PlanStep>,
  pivot: PlanStep,
  oldSpanDays: number,
  newSpanDays: number,
): DownstreamShiftEntry[] {
  const deltaDays = newSpanDays - oldSpanDays;
  if (deltaDays === 0) return [];
  return findDownstreamSteps(steps, pivot).map((s) => ({
    stepId: s.id,
    deltaDays,
  }));
}

/**
 * Calcule les shifts à appliquer aux steps aval pour un décalage du pivot.
 */
export function computeCascadeForShift(
  steps: ReadonlyArray<PlanStep>,
  pivot: PlanStep,
  shiftDelta: number,
): DownstreamShiftEntry[] {
  if (shiftDelta === 0) return [];
  return findDownstreamSteps(steps, pivot).map((s) => ({
    stepId: s.id,
    deltaDays: shiftDelta,
  }));
}

/** Helper exposé pour preview / debug */
export function previewCascadedEnd(
  pivot: PlanStep,
  newSpanDays: number,
): string {
  return addWorkingDays(pivot.start_date, Math.max(1, newSpanDays) - 1);
}
