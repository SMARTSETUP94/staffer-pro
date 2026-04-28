/**
 * v0.23.1 FIX 3 — Tests filtres "Saisie pour équipe".
 * Couvre fuzzy maison + ToggleGroup typologie.
 */
import { describe, it, expect } from "vitest";
import { fuzzyMatch, filterByTypologie, type ContratType } from "@/lib/saisie-equipe-filter";

describe("fuzzyMatch — accents/casse", () => {
  it("retourne true quand needle est vide", () => {
    expect(fuzzyMatch("Jean Dupont", "")).toBe(true);
  });

  it("matche 'Léa' avec 'lea' (strip diacritics + lowercase)", () => {
    expect(fuzzyMatch("Léa Martin", "lea")).toBe(true);
  });

  it("matche 'François' avec 'francois'", () => {
    expect(fuzzyMatch("François Dubois", "francois")).toBe(true);
  });

  it("matche 'Jérôme' avec 'JEROME' (insensible casse)", () => {
    expect(fuzzyMatch("Jérôme Petit", "JEROME")).toBe(true);
  });

  it("matche 'Hélène' avec 'helene'", () => {
    expect(fuzzyMatch("Hélène", "helene")).toBe(true);
  });

  it("matche un fragment au milieu (substring)", () => {
    expect(fuzzyMatch("Jean Dupont", "upo")).toBe(true);
  });

  it("ne matche pas si needle absent", () => {
    expect(fuzzyMatch("Jean Dupont", "xyz")).toBe(false);
  });

  it("matche 'Çedric' avec 'cedric'", () => {
    expect(fuzzyMatch("Çedric Moreau", "cedric")).toBe(true);
  });
});

describe("filterByTypologie — ToggleGroup", () => {
  const employes: { id: string; type_contrat: ContratType }[] = [
    { id: "1", type_contrat: "CDI" },
    { id: "2", type_contrat: "CDD" },
    { id: "3", type_contrat: "Interim" },
    { id: "4", type_contrat: "Independant" },
    { id: "5", type_contrat: "CDI" },
  ];

  it("'all' ne filtre rien", () => {
    expect(filterByTypologie(employes, "all")).toHaveLength(5);
  });

  it("'cdi' garde CDI + CDD", () => {
    const r = filterByTypologie(employes, "cdi");
    expect(r.map((e) => e.id).sort()).toEqual(["1", "2", "5"]);
  });

  it("'interim' garde Interim + Independant", () => {
    const r = filterByTypologie(employes, "interim");
    expect(r.map((e) => e.id).sort()).toEqual(["3", "4"]);
  });

  it("liste vide → liste vide", () => {
    expect(filterByTypologie([], "cdi")).toEqual([]);
  });
});
