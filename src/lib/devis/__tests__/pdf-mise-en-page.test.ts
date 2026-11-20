import { describe, expect, it } from "vitest";
import { capitalFr, textePdf } from "../pdf-client";

describe("PDF client — glyphes et pied de page", () => {
  it("remplace la flèche absente de la police par un tiret au lieu de la perdre", () => {
    expect(textePdf("Transport Paris → Bordeaux")).toBe("Transport Paris – Bordeaux");
  });
  it("conserve accents, euro, ×, Ø et ³ déjà imprimables", () => {
    expect(textePdf("Ø 4 cm × 22 m³ — 1 250,00 € œuvre")).toBe("Ø 4 cm × 22 m³ — 1 250,00 € œuvre");
  });
  it("remplace ≈ par ~ et un glyphe inconnu par ?", () => {
    expect(textePdf("hauteur ≈ 220 cm 🙂")).toBe("hauteur ~ 220 cm ?");
  });
  it("formate le capital au format français", () => {
    expect(capitalFr("40000.00 €")).toBe("40 000,00 €");
    expect(capitalFr("40000")).toBe("40 000,00 €");
    expect(capitalFr("variable")).toBe("variable");
  });
});
