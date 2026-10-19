import { describe, expect, it } from "vitest";
import { filterChantierSuggestions, matchesOpportunityKeywords } from "@/lib/opportunite-search";

describe("Recherche nouvelle opportunité", () => {
  it("recherche les clients par plusieurs mots sans casse ni accents", () => {
    expect(matchesOpportunityKeywords(["Hermès Paris", "hermes.fr"], "PARIS hermES")).toBe(true);
    expect(matchesOpportunityKeywords(["Hermès Paris"], "Adidas")).toBe(false);
  });
  const rows = [
    { id: "1", numero: "6055", nom: "Noël 26", client: "Hermès", client_id: "h", lieu: "Opéra" },
    { id: "2", numero: "4130", nom: "The Voice", client: "ITV", client_id: "i", lieu: "Plateau" },
  ];
  it("recherche le chantier par numéro, nom, client ou lieu", () => {
    for (const query of ["6055", "NOEL", "hermes", "opera", "6055 noel"]) {
      expect(filterChantierSuggestions(rows, query, null).map((r) => r.id)).toEqual(["1"]);
    }
    expect(filterChantierSuggestions(rows, "inconnu", null)).toEqual([]);
  });
  it("priorise le client choisi sans masquer les autres chantiers", () => {
    expect(filterChantierSuggestions(rows, "", "i").map((r) => r.id)).toEqual(["2", "1"]);
  });
});