/**
 * v0.24.1 — Tests du module factorisé string-normalize.
 * Anti-régression critique (a causé bug fuzzyMatch v0.23.1).
 */
import { describe, it, expect } from "vitest";
import {
  stripDiacritics,
  normalizeName,
  normalizeForMatch,
  fuzzyMatch,
  fuzzyContains,
} from "@/lib/string-normalize";

describe("stripDiacritics", () => {
  it("retire les accents (NFD)", () => {
    expect(stripDiacritics("Léa")).toBe("Lea");
    expect(stripDiacritics("François")).toBe("Francois");
    expect(stripDiacritics("Jérôme")).toBe("Jerome");
    expect(stripDiacritics("Çedric")).toBe("Cedric");
    expect(stripDiacritics("àéîõü")).toBe("aeiou");
  });
  it("ne change PAS la casse", () => {
    expect(stripDiacritics("Élise")).toBe("Elise");
  });
  it("gère null/undefined/empty", () => {
    expect(stripDiacritics("")).toBe("");
    expect(stripDiacritics(null)).toBe("");
    expect(stripDiacritics(undefined)).toBe("");
  });
});

describe("normalizeName", () => {
  it("lowercase + strip diacritics + trim", () => {
    expect(normalizeName("  Léa MARTIN ")).toBe("lea martin");
    expect(normalizeName("FRANÇOIS")).toBe("francois");
  });
  it("gère vide/null", () => {
    expect(normalizeName("")).toBe("");
    expect(normalizeName(null)).toBe("");
  });
});

describe("normalizeForMatch", () => {
  it("compacte les espaces", () => {
    expect(normalizeForMatch("  Jean   Dupont  ")).toBe("jean dupont");
    expect(normalizeForMatch("Léa\t\tMartin")).toBe("lea martin");
  });
});

describe("fuzzyMatch / fuzzyContains", () => {
  it("needle vide → true", () => {
    expect(fuzzyMatch("Jean", "")).toBe(true);
    expect(fuzzyContains("Jean", "")).toBe(true);
  });
  it("matche accents/casse", () => {
    expect(fuzzyMatch("Léa Martin", "lea")).toBe(true);
    expect(fuzzyMatch("Jérôme", "JEROME")).toBe(true);
    expect(fuzzyMatch("François", "francois")).toBe(true);
  });
  it("substring", () => {
    expect(fuzzyMatch("Jean Dupont", "upo")).toBe(true);
  });
  it("ne matche pas si absent", () => {
    expect(fuzzyMatch("Jean", "xyz")).toBe(false);
  });
  it("fuzzyContains alias === fuzzyMatch", () => {
    expect(fuzzyContains).toBe(fuzzyMatch);
  });
});
