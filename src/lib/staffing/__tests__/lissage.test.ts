// v0.36 BETA — tests lissage + BE séquentiel
import { describe, it, expect } from "vitest";
import {
  smoothMetierLoad,
  sequenceBeSteps,
  recomputeDailyLoad,
  applyLissage,
} from "../lissage";
import type { PlanResult, PlanStep } from "../types";
import type { MetierConfig } from "../pre-parametrage";

function step(over: Partial<PlanStep>): PlanStep {
  return {
    id: "s_1",
    metier_id: 3,
    metier: "Peint",
    objet_id: null,
    start_date: "2026-05-11",
    span_days: 2,
    pers: 10,
    h_par_jour: 8,
    source: "auto",
    ...over,
  };
}

const cfgPeint: MetierConfig = {
  metier_code: "Peint",
  total_h_calc: 160,
  nb_pers_cible: 5,
  duree_cible_j: 4,
  capa_max_jour: 5,
  lissage_active: true,
  cap_reached: true,
};

describe("smoothMetierLoad", () => {
  it("ramène pers à cap et étend span (heures préservées)", () => {
    const s = step({ pers: 10, span_days: 2, h_par_jour: 8 }); // 160h
    const out = smoothMetierLoad([s], cfgPeint);
    expect(out[0].pers).toBe(5);
    expect(out[0].span_days).toBe(4); // 160/(5*8)
    // Recule 2 jours ouvrés depuis 11/05 → lundi 11 - 2 OD = jeudi 7 mai (8/05 férié)
    expect(out[0].start_date < s.start_date).toBe(true);
  });

  it("no-op si pers <= cap", () => {
    const s = step({ pers: 4, span_days: 2 });
    expect(smoothMetierLoad([s], cfgPeint)[0]).toEqual(s);
  });

  it("no-op si lissage_active=false", () => {
    const s = step({ pers: 10 });
    expect(smoothMetierLoad([s], { ...cfgPeint, lissage_active: false })[0]).toEqual(s);
  });

  it("ignore les autres métiers", () => {
    const s = step({ metier: "Bois", pers: 99 });
    expect(smoothMetierLoad([s], cfgPeint)[0]).toEqual(s);
  });
});

describe("sequenceBeSteps", () => {
  it("recule le 2e BE pour qu'il finisse avant le start du 1er (max 1 parallèle)", () => {
    const a = step({ id: "be1", metier: "BE", start_date: "2026-05-11", span_days: 3, pers: 1, h_par_jour: 10 });
    const b = step({ id: "be2", metier: "BE", start_date: "2026-05-11", span_days: 2, pers: 1, h_par_jour: 10 });
    const out = sequenceBeSteps([a, b], { maxParallel: 1 });
    const oa = out.find((s) => s.id === "be1")!;
    const ob = out.find((s) => s.id === "be2")!;
    // ob doit finir strictement avant oa.start
    const endOb = ob.start_date; // span 2 → end = start + 1
    expect(endOb < oa.start_date).toBe(true);
  });

  it("override (maxParallel=2) → ne touche rien", () => {
    const a = step({ id: "be1", metier: "BE", start_date: "2026-05-11", span_days: 3, pers: 1 });
    const b = step({ id: "be2", metier: "BE", start_date: "2026-05-11", span_days: 2, pers: 1 });
    const out = sequenceBeSteps([a, b], { maxParallel: 2 });
    expect(out).toEqual([a, b]);
  });

  it("préserve les non-BE", () => {
    const peint = step({ id: "p1", metier: "Peint", pers: 5 });
    const be = step({ id: "be1", metier: "BE", pers: 1 });
    const out = sequenceBeSteps([peint, be], { maxParallel: 1 });
    expect(out.find((s) => s.id === "p1")).toEqual(peint);
  });
});

describe("recomputeDailyLoad", () => {
  it("agrège pers par jour ouvré", () => {
    const a = step({ id: "a", start_date: "2026-05-11", span_days: 2, pers: 3 });
    const b = step({ id: "b", start_date: "2026-05-12", span_days: 2, pers: 4 });
    const load = recomputeDailyLoad([a, b]);
    expect(load["2026-05-11"]).toBe(3);
    expect(load["2026-05-12"]).toBe(7);
    expect(load["2026-05-13"]).toBe(4);
  });
});

describe("applyLissage — bug HPDN heatmap Peint 0/18", () => {
  it("après lissage : aucune journée Peint > capa_max_jour=6", () => {
    const stepsPeint: PlanStep[] = [
      step({ id: "p1", metier: "Peint", start_date: "2026-05-08", pers: 6, span_days: 1 }),
      step({ id: "p2", metier: "Peint", start_date: "2026-05-12", pers: 18, span_days: 1, h_par_jour: 8 }),
    ];
    const plan: PlanResult = {
      date_debut_fab: "2026-05-08",
      date_fin_fab: "2026-05-22",
      steps: stepsPeint,
      cnc_reservations: [],
      alerts: [],
      daily_load: {},
    };
    const cfg: MetierConfig = {
      metier_code: "Peint",
      total_h_calc: 192,
      nb_pers_cible: 6,
      duree_cible_j: 4,
      capa_max_jour: 6,
      lissage_active: true,
      cap_reached: true,
    };
    const out = applyLissage(plan, { configs: [cfg], picMax: 12 });
    const peakPeint = Math.max(
      ...out.steps.filter((s) => s.metier === "Peint").map((s) => s.pers),
    );
    expect(peakPeint).toBeLessThanOrEqual(6);
    // Pic global ne doit plus dépasser 12 (vérification post-lissage)
    expect(out.alerts.find((a) => a.code === "PIC_GLOBAL_DEPASSE")).toBeUndefined();
  });
});
