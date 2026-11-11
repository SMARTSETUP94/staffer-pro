import { describe, expect, it } from "vitest";
import { hasOpportuniteTab } from "../affaire-opportunite";

describe("Suivi opportunité dans la fiche chantier", () => {
  it("inclut le suivi des opportunités 9XXX", () => {
    expect(hasOpportuniteTab({ phase: "opportunite", code_opportunite: null })).toBe(true);
  });
  it("même forme de fiche pour tous les chantiers (4XXX, 5XXX, 6XXX sans opportunité d’origine)", () => {
    expect(hasOpportuniteTab({ phase: "signe", code_opportunite: "9435" })).toBe(true);
    expect(hasOpportuniteTab({ phase: "signe", code_opportunite: null })).toBe(true);
  });
});