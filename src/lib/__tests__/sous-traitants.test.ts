import { describe, it, expect } from "vitest";
import { validateSousTraitantInput, formatTarif } from "@/lib/sous-traitants";

describe("validateSousTraitantInput", () => {
  it("rejette nom vide", () => {
    expect(validateSousTraitantInput({ nom: "", type: "transport" })).toMatch(/nom/i);
    expect(validateSousTraitantInput({ nom: "   ", type: "transport" })).toMatch(/nom/i);
  });

  it("valide nom simple", () => {
    expect(validateSousTraitantInput({ nom: "Transports Dupont", type: "transport" })).toBeNull();
  });

  it("rejette email invalide", () => {
    expect(
      validateSousTraitantInput({ nom: "X", type: "transport", email: "pas-un-email" }),
    ).toMatch(/email/i);
  });

  it("accepte email valide", () => {
    expect(
      validateSousTraitantInput({ nom: "X", type: "transport", email: "a@b.fr" }),
    ).toBeNull();
  });

  it("rejette siret < 14 chiffres", () => {
    expect(
      validateSousTraitantInput({ nom: "X", type: "transport", siret: "12345" }),
    ).toMatch(/siret/i);
  });

  it("accepte siret 14 chiffres avec espaces", () => {
    expect(
      validateSousTraitantInput({ nom: "X", type: "transport", siret: "123 456 789 00012" }),
    ).toBeNull();
  });

  it("rejette tarif négatif", () => {
    expect(
      validateSousTraitantInput({ nom: "X", type: "transport", tarif_jour_eur: -10 }),
    ).toMatch(/jour/i);
    expect(
      validateSousTraitantInput({ nom: "X", type: "transport", tarif_km_eur: -1 }),
    ).toMatch(/km/i);
  });
});

describe("formatTarif", () => {
  it("retourne — si null", () => {
    expect(formatTarif(null, "/jour")).toBe("—");
    expect(formatTarif(undefined, "/jour")).toBe("—");
  });

  it("formate avec 2 décimales et suffixe", () => {
    expect(formatTarif(450, "/jour")).toBe("450.00 € /jour");
    expect(formatTarif(0.85, "/km")).toBe("0.85 € /km");
  });
});
