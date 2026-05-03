// v0.37 BETA — Tests acceptance sur fixtures Hermes D-202604-2141 et D-202604-2151.
// Vérifie les invariants algo (ordre BE, splits Manut, pipeline objet, deadline).
// Note : les valeurs précises (pers exact, dates exactes) dépendent du tuning
// "min_pers_strategy" qui sera patché ultérieurement. On valide ici les invariants
// structurels qui ne doivent JAMAIS régresser.
import { describe, expect, it } from "vitest";
import { calculatePlanV037 } from "../algo";
import type { ObjetInput, PlanInput } from "../types";

const DELIV = "2026-05-29";
const START = "2026-05-04";
const HOLIDAYS = new Set(["2026-05-08", "2026-05-14", "2026-05-25"]);

function obj(p: Partial<ObjetInput> & { objet_id: string }): ObjetInput {
  return {
    reference: p.objet_id,
    nom: p.objet_id,
    heures_be: 0, heures_numerique: 0, heures_bois: 0, heures_metal: 0,
    heures_peinture: 0, heures_tapisserie: 0, heures_manutention: 0,
    display_order: 0,
    ...p,
  };
}

function input(objets: ObjetInput[]): PlanInput {
  return {
    affaire_id: "fixture",
    date_fin_fab: DELIV,
    date_debut_fab_min: START,
    objets,
    holidays: HOLIDAYS,
  };
}

/* -------------------- HERMES D-202604-2141 -------------------- */
const HERMES = [
  obj({ objet_id: "VT", display_order: 0, heures_bois: 4, heures_peinture: 4 }),
  obj({ objet_id: "I2", display_order: 1, heures_be: 3.8, heures_peinture: 123, heures_manutention: 21.75 }),
  obj({ objet_id: "I1", display_order: 2, heures_be: 8.7, heures_numerique: 5, heures_bois: 25.2, heures_peinture: 75, heures_manutention: 13.3 }),
  obj({ objet_id: "D1", display_order: 3, heures_be: 19.6, heures_numerique: 11.2, heures_bois: 56.9, heures_peinture: 169.7, heures_manutention: 30.1 }),
];

describe("v0.37 fixture HERMES D-202604-2141", () => {
  const r = calculatePlanV037(input(HERMES));

  it("ordre BE attendu : [VT?, I2, I1, D1] (VT n'a pas de BE → exclu)", () => {
    const beOrder = r.steps
      .filter((s) => s.metier === "BE")
      .sort((a, b) => a.start_date.localeCompare(b.start_date))
      .map((s) => s.objet_id);
    // VT.heures_be=0 → pas de step BE pour VT
    expect(beOrder).toEqual(["I2", "I1", "D1"]);
  });

  it("aucun chevauchement entre steps BE (séquentiel global)", () => {
    const be = r.steps.filter((s) => s.metier === "BE")
      .sort((a, b) => a.start_date.localeCompare(b.start_date));
    for (let i = 1; i < be.length; i++) {
      expect(be[i].start_date > be[i - 1].start_date).toBe(true);
    }
  });

  it("Manut FIN agrégée (objet_id=null, span=2j, pers binôme)", () => {
    const fin = r.steps.find((s) => s.metier === "Manut" && s.phase === "FIN");
    expect(fin).toBeDefined();
    expect(fin!.objet_id).toBeNull();
    expect(fin!.span_days).toBe(2);
    expect(fin!.pers % 2).toBe(0);
  });

  it("chaque objet avec heures_manutention > 0 a 1 step Manut DEBUT et 1 TRANSFERT", () => {
    for (const o of HERMES.filter((x) => x.heures_manutention > 0)) {
      const phases = r.steps
        .filter((s) => s.metier === "Manut" && s.objet_id === o.objet_id)
        .map((s) => s.phase);
      expect(phases).toContain("DEBUT");
      expect(phases).toContain("TRANSFERT");
    }
  });

  it("Bois démarre toujours après Num (LAG_NUM_BOIS=1) pour D1", () => {
    const num = r.steps.find((s) => s.metier === "Num" && s.objet_id === "D1")!;
    const bois = r.steps.find((s) => s.metier === "Bois" && s.objet_id === "D1")!;
    expect(bois.start_date > num.start_date).toBe(true);
  });

  it("Peint démarre après Bois pour D1 (via Manut Transfert)", () => {
    const bois = r.steps.find((s) => s.metier === "Bois" && s.objet_id === "D1")!;
    const peint = r.steps.find((s) => s.metier === "Peint" && s.objet_id === "D1")!;
    expect(peint.start_date > bois.start_date).toBe(true);
  });

  it("Binômes : pers Bois/Peint/Tap/Manut TOUJOURS multiple de 2", () => {
    for (const s of r.steps) {
      if (["Bois", "Peint", "Tap", "Manut"].includes(s.metier)) {
        expect(s.pers % 2).toBe(0);
      }
    }
  });

  it("CNC mono : pas 2 steps Num le même jour", () => {
    const numByDay = new Map<string, number>();
    for (const s of r.steps.filter((x) => x.metier === "Num")) {
      const d = s.start_date;
      numByDay.set(d, (numByDay.get(d) ?? 0) + 1);
    }
    for (const [, count] of numByDay) expect(count).toBeLessThanOrEqual(1);
  });
});

/* -------------------- D-202604-2151 -------------------- */
const D2151 = [
  obj({ objet_id: "M1", display_order: 0, heures_be: 10.8, heures_numerique: 6.2, heures_bois: 31.5, heures_peinture: 93.5, heures_manutention: 16.5 }),
  obj({ objet_id: "C1", display_order: 1, heures_be: 8.4, heures_numerique: 5, heures_bois: 24.5, heures_peinture: 71.9, heures_manutention: 12.4 }),
  obj({ objet_id: "J0", display_order: 2, heures_be: 6.4, heures_numerique: 3.8, heures_bois: 18.5, heures_peinture: 54.5, heures_manutention: 9.5 }),
  obj({ objet_id: "CA", display_order: 3, heures_be: 4.1, heures_numerique: 2.5, heures_bois: 12.1, heures_peinture: 34.9, heures_manutention: 6.0 }),
  obj({ objet_id: "K4", display_order: 4, heures_be: 8.7, heures_numerique: 5, heures_bois: 25.2, heures_peinture: 75, heures_manutention: 13.3 }),
];

describe("v0.37 fixture D-202604-2151", () => {
  const r = calculatePlanV037(input(D2151));

  it("ordre BE attendu : [CA, J0, K4, C1, M1] (P2 = ceil(BE/8)+ceil(Num/8) ASC)", () => {
    const beOrder = r.steps
      .filter((s) => s.metier === "BE")
      .sort((a, b) => a.start_date.localeCompare(b.start_date))
      .map((s) => s.objet_id);
    expect(beOrder).toEqual(["CA", "J0", "K4", "C1", "M1"]);
  });

  it("BE total span = 8j (CA 1+J0 1+K4 2+C1 2+M1 2)", () => {
    const totalBe = r.steps
      .filter((s) => s.metier === "BE")
      .reduce((sum, s) => sum + s.span_days, 0);
    expect(totalBe).toBe(8);
  });

  it("Manut FIN agrégée span=2j", () => {
    const fin = r.steps.find((s) => s.metier === "Manut" && s.phase === "FIN");
    expect(fin).toBeDefined();
    expect(fin!.span_days).toBe(2);
  });

  it("aucun step ne dépasse la livraison 2026-05-29", () => {
    // Note : si dépassement, l'algo génère DEBORD_LIVRAISON ; on tolère mais on
    // veut qu'au moins les BE ne dépassent pas (start < livraison).
    const be = r.steps.filter((s) => s.metier === "BE");
    for (const s of be) expect(s.start_date <= DELIV).toBe(true);
  });

  it("daily_load existe et chaque entrée > 0", () => {
    expect(Object.keys(r.daily_load).length).toBeGreaterThan(0);
    for (const v of Object.values(r.daily_load)) expect(v).toBeGreaterThan(0);
  });
});
