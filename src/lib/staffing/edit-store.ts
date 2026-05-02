// v0.35.x — Store local edition mode batch (sliders + shifts uniquement).
// Les changements de pers / manual_shift sont accumulés ici sans round-trip serveur.
// Flush via bouton "Enregistrer (N)" ou autosave 2 min idle ou unmount.
import { create } from "zustand";

export interface StepEdit {
  /** undefined = pas modifié */
  pers?: number;
  manual_pers?: boolean;
  manual_shift?: number;
}

interface EditState {
  planId: string | null;
  /** stepId -> edits cumulés vs serveur */
  edits: Record<string, StepEdit>;
  /** snapshot updated_at du plan au load (pour détection conflits) */
  baseUpdatedAt: string | null;
  /** Date.now() du dernier flush réussi */
  lastSavedAt: number | null;
  /** Date.now() du dernier change local (pour autosave idle) */
  lastChangeAt: number | null;
  /** flush en cours */
  flushing: boolean;

  initFromPlan: (planId: string, baseUpdatedAt: string) => void;
  setStepPers: (stepId: string, pers: number) => void;
  setStepShift: (stepId: string, manual_shift: number) => void;
  resetStepShift: (stepId: string) => void;
  resetAll: () => void;
  markFlushing: (v: boolean) => void;
  markSaved: (newBaseUpdatedAt: string) => void;
  /** Compteur de modifs pendantes */
  dirtyCount: () => number;
}

export const useEditStore = create<EditState>((set, get) => ({
  planId: null,
  edits: {},
  baseUpdatedAt: null,
  lastSavedAt: null,
  lastChangeAt: null,
  flushing: false,

  initFromPlan: (planId, baseUpdatedAt) => {
    const cur = get();
    // Si on (re)charge le même plan et qu'on a des edits non sauvés → on garde
    if (cur.planId === planId && Object.keys(cur.edits).length > 0) {
      set({ baseUpdatedAt });
      return;
    }
    set({
      planId,
      baseUpdatedAt,
      edits: {},
      lastSavedAt: null,
      lastChangeAt: null,
      flushing: false,
    });
  },

  setStepPers: (stepId, pers) =>
    set((s) => ({
      edits: {
        ...s.edits,
        [stepId]: { ...s.edits[stepId], pers, manual_pers: true },
      },
      lastChangeAt: Date.now(),
    })),

  setStepShift: (stepId, manual_shift) =>
    set((s) => ({
      edits: {
        ...s.edits,
        [stepId]: { ...s.edits[stepId], manual_shift },
      },
      lastChangeAt: Date.now(),
    })),

  resetStepShift: (stepId) =>
    set((s) => ({
      edits: {
        ...s.edits,
        [stepId]: { ...s.edits[stepId], manual_shift: 0 },
      },
      lastChangeAt: Date.now(),
    })),

  resetAll: () =>
    set({
      edits: {},
      lastChangeAt: null,
    }),

  markFlushing: (v) => set({ flushing: v }),

  markSaved: (newBaseUpdatedAt) =>
    set({
      edits: {},
      baseUpdatedAt: newBaseUpdatedAt,
      lastSavedAt: Date.now(),
      lastChangeAt: null,
      flushing: false,
    }),

  dirtyCount: () => {
    const e = get().edits;
    let n = 0;
    for (const k of Object.keys(e)) {
      const v = e[k];
      if (
        v.pers !== undefined ||
        v.manual_shift !== undefined ||
        v.manual_pers !== undefined
      ) {
        n++;
      }
    }
    return n;
  },
}));

/** Helper hook : retourne le step "merged" = serveur + edits locaux */
export function applyEdits<T extends { id: string; pers: number; start_date: string; span_days: number; source: string }>(
  step: T,
  edit: StepEdit | undefined,
  baseManualShift: number,
): T {
  if (!edit) return step;
  let pers = step.pers;
  let startDate = step.start_date;
  let spanDays = step.span_days;
  let source = step.source;
  if (edit.pers !== undefined && edit.pers !== pers) {
    // Recalcul du span en gardant la fin (équivalent serveur)
    const totalH = pers * 8 * spanDays; // h_par_jour=8 par défaut
    const newSpan = Math.max(1, Math.ceil(totalH / (edit.pers * 8)));
    const oldEndUtc = new Date(startDate + "T00:00:00Z");
    oldEndUtc.setUTCDate(oldEndUtc.getUTCDate() + spanDays - 1);
    const newStartUtc = new Date(oldEndUtc);
    newStartUtc.setUTCDate(newStartUtc.getUTCDate() - (newSpan - 1));
    pers = edit.pers;
    spanDays = newSpan;
    startDate = newStartUtc.toISOString().slice(0, 10);
    source = "manual";
  }
  const shiftDelta = (edit.manual_shift ?? baseManualShift) - baseManualShift;
  if (shiftDelta !== 0) {
    const d = new Date(startDate + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + shiftDelta);
    startDate = d.toISOString().slice(0, 10);
    source = "manual";
  }
  return { ...step, pers, start_date: startDate, span_days: spanDays, source };
}
