import { describe, it, expect } from "vitest";
import {
  findDownstreamSteps,
  computeCascadeForDurationChange,
  computeCascadeForShift,
} from "../cascade-aval";
import type { PlanStep } from "../types";

function step(id: string, objet_id: string | null, start_date: string, span_days = 2): PlanStep {
  return {
    id,
    objet_id,
    metier_id: 1,
    start_date,
    span_days,
    pers: 2,
    h_par_jour: 8,
    source: "auto",
    span_demi_jours: span_days * 2,
    start_half_day: "AM",
    phase: null,
    plan_id: "plan",
  } as unknown as PlanStep;
}

describe("cascade-aval", () => {
  const A1 = step("a1", "obj-A", "2026-05-04", 2);
  const A2 = step("a2", "obj-A", "2026-05-06", 3);
  const A3 = step("a3", "obj-A", "2026-05-11", 1);
  const B1 = step("b1", "obj-B", "2026-05-05", 2);
  const all = [A1, A2, A3, B1];

  it("findDownstreamSteps : seuls les steps aval du même objet", () => {
    const ds = findDownstreamSteps(all, A1);
    expect(ds.map((s) => s.id).sort()).toEqual(["a2", "a3"]);
  });

  it("aucune cascade vers d'autres objets", () => {
    const ds = findDownstreamSteps(all, A1);
    expect(ds.find((s) => s.id === "b1")).toBeUndefined();
  });

  it("amont non touché si on modifie un step intermédiaire", () => {
    const ds = findDownstreamSteps(all, A2);
    expect(ds.map((s) => s.id)).toEqual(["a3"]);
  });

  it("computeCascadeForDurationChange propage delta de jours", () => {
    // A2 : 3j → 5j (+2j) → A3 doit shift +2j
    const entries = computeCascadeForDurationChange(all, A2, 3, 5);
    expect(entries).toEqual([{ stepId: "a3", deltaDays: 2 }]);
  });

  it("computeCascadeForDurationChange : delta 0 = aucun cascade", () => {
    expect(computeCascadeForDurationChange(all, A2, 3, 3)).toEqual([]);
  });

  it("computeCascadeForShift propage le décalage", () => {
    const entries = computeCascadeForShift(all, A1, 1);
    expect(entries.map((e) => e.deltaDays)).toEqual([1, 1]);
    expect(entries.map((e) => e.stepId).sort()).toEqual(["a2", "a3"]);
  });
});
