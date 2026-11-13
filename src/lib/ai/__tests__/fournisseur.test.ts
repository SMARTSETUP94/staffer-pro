import { describe, it, expect } from "vitest";
import { doitBasculerSecours, ErreurIA, coutEstime } from "../fournisseur.server";
import { scorerCas, basculeAutorisee } from "../banc-essai";

describe("secours Gemini", () => {
  it("bascule sur 429 et 5xx", () => {
    expect(doitBasculerSecours(new ErreurIA("x", 429, false))).toBe(true);
    expect(doitBasculerSecours(new ErreurIA("x", 503, false))).toBe(true);
  });
  it("ne bascule jamais sur un refus ou un 403", () => {
    expect(doitBasculerSecours(new ErreurIA("x", 403, true))).toBe(false);
    expect(doitBasculerSecours(new ErreurIA("refus", 200, true))).toBe(false);
    expect(doitBasculerSecours(new ErreurIA("x", 400, true))).toBe(false);
  });
  it("calcule le coût Sonnet en crédits", () => {
    expect(coutEstime("anthropic/claude-sonnet-5", 1000, 100)).toBe(0.012);
  });
});

describe("banc d'essai", () => {
  it("bascule refusée si Claude perd 2 cas sur un champ", () => {
    expect(basculeAutorisee({ type: 10 }, { type: 8 })).toBe(false);
    expect(basculeAutorisee({ type: 10 }, { type: 9 })).toBe(true);
  });
  it("heure manquante comptée fausse", () => {
    const s = scorerCas([{ type: "livraison", date: "2026-11-16", heure_debut: "14:30" }], [{ type: "livraison", date: "2026-11-16", heure_debut: null }]);
    expect(s.heures).toBe(false);
    expect(s.date).toBe(true);
  });
});
