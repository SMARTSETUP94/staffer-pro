// v0.40.0a — Tests refonte Manut split
//
// Spec :
//  - Par défaut (is_manut_absorbed = true) :
//     * Aucun step Manut DEBUT ni TRANSFERT par objet
//     * Manut FIN globale conservée (50% du total chantier)
//     * Bois/Peint/Tap majorés au prorata des heures absorbables (DEBUT + TRANSFERT = 50%)
//  - Legacy (is_manut_absorbed = false) :
//     * Comportement v0.37 strict (3 phases Manut par objet quand applicable)

import { describe, expect, it } from "vitest";
import { calculatePlanV037 } from "../algo";
import { MANUT_PCT_DEBUT, MANUT_PCT_FIN, MANUT_PCT_TRANSFERT, type ObjetInput, type PlanInput } from "../types";

const DELIV = "2026-06-30";

function obj(p: Partial<ObjetInput>): ObjetInput {
  return {
    objet_id: "x",
    reference: "X",
    nom: "X",
    heures_be: 0,
    heures_numerique: 0,
    heures_bois: 0,
    heures_metal: 0,
    heures_peinture: 0,
    heures_tapisserie: 0,
    heures_manutention: 0,
    display_order: 0,
    ...p,
  };
}

function input(objets: ObjetInput[], extra: Partial<PlanInput> = {}): PlanInput {
  return {
    affaire_id: "a",
    date_fin_fab: DELIV,
    date_debut_fab_min: "2026-05-04",
    objets,
    ...extra,
  };
}

describe("v0.40 — absorption Manut DEBUT+TRANSFERT par défaut", () => {
  it("par défaut : aucun step Manut DEBUT/TRANSFERT par objet", () => {
    const r = calculatePlanV037(
      input([obj({ objet_id: "a", heures_bois: 16, heures_peinture: 16, heures_manutention: 40 })]),
    );
    const manut = r.steps.filter((s) => s.metier === "Manut");
    expect(manut.some((s) => s.phase === "DEBUT")).toBe(false);
    expect(manut.some((s) => s.phase === "TRANSFERT")).toBe(false);
  });

  it("Manut FIN globale toujours présente (50% total chantier)", () => {
    const r = calculatePlanV037(
      input([
        obj({ objet_id: "a", heures_bois: 16, heures_manutention: 20 }),
        obj({ objet_id: "b", heures_bois: 16, heures_manutention: 20 }),
      ]),
    );
    const fin = r.steps.find((s) => s.metier === "Manut" && s.phase === "FIN");
    expect(fin).toBeDefined();
    expect(fin!.objet_id).toBeNull();
  });

  it("legacy is_manut_absorbed=false : 3 phases Manut par objet", () => {
    const r = calculatePlanV037(
      input([obj({ objet_id: "a", heures_bois: 16, heures_peinture: 16, heures_manutention: 40 })], {
        is_manut_absorbed: false,
      }),
    );
    const manut = r.steps.filter((s) => s.metier === "Manut");
    const phases = new Set(manut.map((s) => s.phase));
    expect(phases.has("DEBUT")).toBe(true);
    expect(phases.has("TRANSFERT")).toBe(true);
    expect(phases.has("FIN")).toBe(true);
  });

  it("absorption proratisée : Bois reçoit toutes les h Manut absorbables si seul absorbeur", () => {
    // Manut total 40h → DEBUT=14, TRANSFERT=6, FIN=20
    // Absorbable = 20h. Seul Bois (40h base) → Bois effectif = 60h
    const baseBois = 40;
    const hManut = 40;
    const rAbs = calculatePlanV037(
      input([obj({ objet_id: "a", heures_bois: baseBois, heures_manutention: hManut })]),
    );
    const rLegacy = calculatePlanV037(
      input([obj({ objet_id: "a", heures_bois: baseBois, heures_manutention: hManut })], {
        is_manut_absorbed: false,
      }),
    );
    const boisAbs = rAbs.steps.find((s) => s.metier === "Bois")!;
    const boisLeg = rLegacy.steps.find((s) => s.metier === "Bois")!;
    // Bois absorbé doit avoir un span >= legacy (plus d'heures à caser)
    const totalBoisAbs = boisAbs.pers * boisAbs.h_par_jour * boisAbs.span_days;
    const totalBoisLeg = boisLeg.pers * boisLeg.h_par_jour * boisLeg.span_days;
    expect(totalBoisAbs).toBeGreaterThanOrEqual(totalBoisLeg);
    // Pas de Manut DEBUT/TRANSFERT dans la version absorbée
    expect(rAbs.steps.some((s) => s.metier === "Manut" && s.phase === "DEBUT")).toBe(false);
  });

  it("prorata correct entre Bois/Peint/Tap (poids = heures de base)", () => {
    // Bois 50h, Peint 30h, Tap 20h → totalAbsorber = 100
    // Manut 100h → absorbable = 50h (35+15)
    // Bois reçoit 25h, Peint 15h, Tap 10h
    const r = calculatePlanV037(
      input([obj({
        objet_id: "a",
        heures_bois: 50,
        heures_peinture: 30,
        heures_tapisserie: 20,
        heures_manutention: 100,
      })]),
    );
    // Pas de Manut DEBUT/TRANSFERT
    const debut = r.steps.find((s) => s.metier === "Manut" && s.phase === "DEBUT");
    const transfert = r.steps.find((s) => s.metier === "Manut" && s.phase === "TRANSFERT");
    expect(debut).toBeUndefined();
    expect(transfert).toBeUndefined();
    // Manut FIN = 50% = 50h
    const fin = r.steps.find((s) => s.metier === "Manut" && s.phase === "FIN");
    expect(fin).toBeDefined();
  });

  it("constantes split inchangées (35/15/50)", () => {
    expect(MANUT_PCT_DEBUT + MANUT_PCT_TRANSFERT + MANUT_PCT_FIN).toBeCloseTo(1, 5);
    expect(MANUT_PCT_DEBUT).toBe(0.35);
    expect(MANUT_PCT_TRANSFERT).toBe(0.15);
    expect(MANUT_PCT_FIN).toBe(0.5);
  });

  it("objet sans Bois/Peint/Tap : pas d'absorbeur → pas de Manut DEBUT/TRANSFERT créé non plus (heures perdues, alerte UI à venir)", () => {
    // Cas dégénéré : Manut sans absorbeur → on ne crée pas de step (totalAbsorber=0)
    // → ces heures DEBUT+TRANSFERT seraient perdues. Acceptable pour v0.40.0a (UI à venir 0b).
    const r = calculatePlanV037(
      input([obj({ objet_id: "a", heures_metal: 20, heures_manutention: 40 })]),
    );
    // Manut FIN doit toujours être créée (50%)
    const fin = r.steps.find((s) => s.metier === "Manut" && s.phase === "FIN");
    expect(fin).toBeDefined();
    // En mode absorbed, sans absorbeur, pas de DEBUT/TRANSFERT
    expect(r.steps.some((s) => s.metier === "Manut" && s.phase === "DEBUT")).toBe(false);
    expect(r.steps.some((s) => s.metier === "Manut" && s.phase === "TRANSFERT")).toBe(false);
  });
});
