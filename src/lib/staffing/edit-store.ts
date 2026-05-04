// v0.35.x — Store local edition mode batch (sliders + shifts uniquement).
// Les changements de pers / manual_shift sont accumulés ici sans round-trip serveur.
// Flush via bouton "Enregistrer (N)" ou autosave 2 min idle ou unmount.
// v0.35.10 P1 — historique undo (Ctrl+Z) : snapshots des `edits` avant chaque mutation.
import { create } from "zustand";
import { addWorkingDays } from "./date-utils";

export interface StepEdit {
  /** undefined = pas modifié */
  pers?: number;
  manual_pers?: boolean;
  manual_shift?: number;
  /** v0.39.0d — durée override en demi-jours, à pers constant. null = reset auto. */
  manual_span_demi?: number | null;
}

const HISTORY_LIMIT = 50;

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
  /** Stack d'historique pour undo (snapshots `edits` AVANT chaque mutation) */
  history: Array<Record<string, StepEdit>>;

  initFromPlan: (planId: string, baseUpdatedAt: string) => void;
  setStepPers: (stepId: string, pers: number) => void;
  setStepShift: (stepId: string, manual_shift: number) => void;
  resetStepShift: (stepId: string) => void;
  /** v0.39.0d — Override de durée en demi-jours (à pers constant). */
  setStepSpanDemi: (stepId: string, manual_span_demi: number) => void;
  resetStepSpanDemi: (stepId: string) => void;
  /** Bulk : applique pers à plusieurs steps en une seule entrée d'historique */
  bulkSetPers: (entries: Array<{ stepId: string; pers: number }>) => void;
  resetAll: () => void;
  markFlushing: (v: boolean) => void;
  markSaved: (newBaseUpdatedAt: string) => void;
  /** Annule la dernière mutation */
  undo: () => boolean;
  /** Compteur de modifs pendantes */
  dirtyCount: () => number;
  /** Profondeur de l'historique undo */
  historyDepth: () => number;
}

function pushHistory(history: Array<Record<string, StepEdit>>, snapshot: Record<string, StepEdit>) {
  const next = [...history, snapshot];
  if (next.length > HISTORY_LIMIT) next.shift();
  return next;
}

export const useEditStore = create<EditState>((set, get) => ({
  planId: null,
  edits: {},
  baseUpdatedAt: null,
  lastSavedAt: null,
  lastChangeAt: null,
  flushing: false,
  history: [],

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
      history: [],
    });
  },

  setStepPers: (stepId, pers) =>
    set((s) => ({
      history: pushHistory(s.history, s.edits),
      edits: {
        ...s.edits,
        [stepId]: { ...s.edits[stepId], pers, manual_pers: true },
      },
      lastChangeAt: Date.now(),
    })),

  setStepShift: (stepId, manual_shift) =>
    set((s) => ({
      history: pushHistory(s.history, s.edits),
      edits: {
        ...s.edits,
        [stepId]: { ...s.edits[stepId], manual_shift },
      },
      lastChangeAt: Date.now(),
    })),

  resetStepShift: (stepId) =>
    set((s) => ({
      history: pushHistory(s.history, s.edits),
      edits: {
        ...s.edits,
        [stepId]: { ...s.edits[stepId], manual_shift: 0 },
      },
      lastChangeAt: Date.now(),
    })),

  bulkSetPers: (entries) =>
    set((s) => {
      const next = { ...s.edits };
      for (const { stepId, pers } of entries) {
        next[stepId] = { ...next[stepId], pers, manual_pers: true };
      }
      return {
        history: pushHistory(s.history, s.edits),
        edits: next,
        lastChangeAt: Date.now(),
      };
    }),

  resetAll: () =>
    set((s) => ({
      history: pushHistory(s.history, s.edits),
      edits: {},
      lastChangeAt: null,
    })),

  markFlushing: (v) => set({ flushing: v }),

  markSaved: (newBaseUpdatedAt) =>
    set({
      edits: {},
      baseUpdatedAt: newBaseUpdatedAt,
      lastSavedAt: Date.now(),
      lastChangeAt: null,
      flushing: false,
      history: [],
    }),

  undo: () => {
    const cur = get();
    if (cur.history.length === 0) return false;
    const next = [...cur.history];
    const prev = next.pop()!;
    set({
      edits: prev,
      history: next,
      lastChangeAt: Date.now(),
    });
    return true;
  },

  historyDepth: () => get().history.length,

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

export function getStepEndDate(step: { start_date: string; span_days: number }): string {
  return addWorkingDays(step.start_date, Math.max(1, step.span_days) - 1);
}

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
    // v0.39.0b — DateShifter doit translater toute la barre :
    // gauche = start-1 ET end-1, droite = start+1 ET end+1. La durée reste donc constante.
    startDate = addWorkingDays(startDate, shiftDelta);
    source = "manual";
  }
  return { ...step, pers, start_date: startDate, span_days: spanDays, source };
}
