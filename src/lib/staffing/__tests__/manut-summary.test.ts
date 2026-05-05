// v0.40.0b+1 — Tests récap Manut StatCard.
// Couvre : absorption normale, fallback (objets sans Bois/Peint/Tap), legacy mode,
// objets sans Manut, mix fallback + absorbés, prorata exact.
import { describe, expect, it } from "vitest";
import { computeManutSummary } from "../manut-summary";
import type { ObjetInput } from "../types";

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

describe("computeManutSummary — récap StatCard", () => {
  it("aucun objet : tout à zéro, fallback=0", () => {
    const r = computeManutSummary([], true);
    expect(r).toEqual({
      is_absorbed: true,
      manut_total_h: 0,
      fin_total_h: 0,
      absorbable_total_h: 0,
      absorbed_bois_h: 0,
      absorbed_peint_h: 0,
      absorbed_tap_h: 0,
      fallback_objets: 0,
    });
  });

  it("objets sans heures Manut : ignorés (fallback=0)", () => {
    const r = computeManutSummary(
      [
        obj({ heures_bois: 50, heures_manutention: 0 }),
        obj({ heures_metal: 30, heures_manutention: 0 }),
      ],
      true,
    );
    expect(r.manut_total_h).toBe(0);
    expect(r.fallback_objets).toBe(0);
    expect(r.absorbable_total_h).toBe(0);
  });

  it("FALLBACK : 1 objet Manut sans Bois/Peint/Tap → fallback_objets=1, rien absorbé", () => {
    const r = computeManutSummary(
      [obj({ heures_metal: 20, heures_manutention: 40 })],
      true,
    );
    expect(r.manut_total_h).toBe(40);
    expect(r.fin_total_h).toBe(20);
    expect(r.fallback_objets).toBe(1);
    expect(r.absorbed_bois_h).toBe(0);
    expect(r.absorbed_peint_h).toBe(0);
    expect(r.absorbed_tap_h).toBe(0);
    expect(r.absorbable_total_h).toBe(0);
  });

  it("FALLBACK multi : 3 objets dégénérés → fallback_objets=3", () => {
    const r = computeManutSummary(
      [
        obj({ heures_metal: 10, heures_manutention: 20 }),
        obj({ heures_numerique: 5, heures_manutention: 10 }),
        obj({ heures_be: 3, heures_manutention: 6 }),
      ],
      true,
    );
    expect(r.fallback_objets).toBe(3);
    expect(r.manut_total_h).toBe(36);
    expect(r.fin_total_h).toBe(18);
    expect(r.absorbable_total_h).toBe(0);
  });

  it("MIX : 1 absorbé + 1 fallback + 1 sans Manut → fallback=1, absorption sur le 1er seulement", () => {
    const r = computeManutSummary(
      [
        obj({ heures_bois: 40, heures_manutention: 40 }), // absorbé : 20h sur Bois
        obj({ heures_metal: 20, heures_manutention: 30 }), // fallback (pas d'absorbeur)
        obj({ heures_bois: 10, heures_manutention: 0 }), // pas de Manut → ignoré
      ],
      true,
    );
    expect(r.fallback_objets).toBe(1);
    expect(r.manut_total_h).toBe(70);
    expect(r.fin_total_h).toBe(35);
    expect(r.absorbed_bois_h).toBeCloseTo(20, 5);
    expect(r.absorbed_peint_h).toBe(0);
    expect(r.absorbed_tap_h).toBe(0);
    expect(r.absorbable_total_h).toBeCloseTo(20, 5);
  });

  it("PRORATA exact Bois/Peint/Tap (50/30/20) sur 100h Manut → 25/15/10", () => {
    const r = computeManutSummary(
      [
        obj({
          heures_bois: 50,
          heures_peinture: 30,
          heures_tapisserie: 20,
          heures_manutention: 100,
        }),
      ],
      true,
    );
    expect(r.absorbed_bois_h).toBeCloseTo(25, 5);
    expect(r.absorbed_peint_h).toBeCloseTo(15, 5);
    expect(r.absorbed_tap_h).toBeCloseTo(10, 5);
    expect(r.absorbable_total_h).toBeCloseTo(50, 5);
    expect(r.fin_total_h).toBe(50);
    expect(r.fallback_objets).toBe(0);
  });

  it("LEGACY (is_absorbed=false) : aucune absorption ni fallback comptés, total et FIN OK", () => {
    const r = computeManutSummary(
      [
        obj({ heures_bois: 40, heures_manutention: 40 }),
        obj({ heures_metal: 20, heures_manutention: 30 }), // dégénéré ignoré en legacy aussi
      ],
      false,
    );
    expect(r.is_absorbed).toBe(false);
    expect(r.manut_total_h).toBe(70);
    expect(r.fin_total_h).toBe(35);
    expect(r.fallback_objets).toBe(0);
    expect(r.absorbable_total_h).toBe(0);
  });

  it("prorata cohérent : Σ(absorbé) = manut_total × 0.5 quand tous les objets ont un absorbeur", () => {
    const r = computeManutSummary(
      [
        obj({ heures_bois: 20, heures_peinture: 20, heures_manutention: 40 }),
        obj({ heures_tapisserie: 30, heures_manutention: 60 }),
        obj({ heures_bois: 10, heures_peinture: 10, heures_tapisserie: 10, heures_manutention: 30 }),
      ],
      true,
    );
    expect(r.fallback_objets).toBe(0);
    expect(r.absorbable_total_h).toBeCloseTo(r.manut_total_h * 0.5, 5);
    expect(r.fin_total_h).toBeCloseTo(r.manut_total_h * 0.5, 5);
  });
});
