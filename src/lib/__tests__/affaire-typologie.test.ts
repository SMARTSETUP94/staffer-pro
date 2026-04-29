import { describe, it, expect } from "vitest";
import {
  getAffaireTypologie,
  OPERATIONNEL_TYPOLOGIES,
  AFFAIRE_TYPOLOGIES,
  AFFAIRE_TYPOLOGIE_LABELS,
  AFFAIRE_TYPOLOGIE_COLORS,
} from "@/lib/affaire-typologie";

describe("getAffaireTypologie", () => {
  it("4 chiffres / 1 → non_operationnel", () => {
    expect(getAffaireTypologie("1001")).toBe("non_operationnel");
    expect(getAffaireTypologie("1999")).toBe("non_operationnel");
  });
  it("4 chiffres / 3 → non_operationnel", () => {
    expect(getAffaireTypologie("3000")).toBe("non_operationnel");
  });
  it("4 chiffres / 4 → montage_demontage", () => {
    expect(getAffaireTypologie("4042")).toBe("montage_demontage");
  });
  it("4 chiffres / 5 → fabrication", () => {
    expect(getAffaireTypologie("5123")).toBe("fabrication");
  });
  it("4 chiffres / 9 → prototype", () => {
    expect(getAffaireTypologie("9001")).toBe("prototype");
  });
  it("5 chiffres / 2 → stockage", () => {
    expect(getAffaireTypologie("20001")).toBe("stockage");
    expect(getAffaireTypologie("29999")).toBe("stockage");
  });

  it("null / undefined / empty → null", () => {
    expect(getAffaireTypologie(null)).toBeNull();
    expect(getAffaireTypologie(undefined)).toBeNull();
    expect(getAffaireTypologie("")).toBeNull();
    expect(getAffaireTypologie("   ")).toBeNull();
  });

  it("longueurs non supportées → null", () => {
    expect(getAffaireTypologie("123")).toBeNull(); // 3 chiffres
    expect(getAffaireTypologie("123456")).toBeNull(); // 6 chiffres
    expect(getAffaireTypologie("1")).toBeNull();
  });

  it("4 chiffres avec préfixe non mappé → null", () => {
    expect(getAffaireTypologie("2999")).toBeNull(); // 4 chiffres / 2 → not stockage
    expect(getAffaireTypologie("6000")).toBeNull();
    expect(getAffaireTypologie("7000")).toBeNull();
    expect(getAffaireTypologie("8000")).toBeNull();
    expect(getAffaireTypologie("0123")).toBeNull();
  });

  it("5 chiffres préfixe ≠ 2 → null", () => {
    expect(getAffaireTypologie("50000")).toBeNull();
    expect(getAffaireTypologie("10000")).toBeNull();
  });

  it("trim espaces", () => {
    expect(getAffaireTypologie("  4042  ")).toBe("montage_demontage");
  });
});

describe("constantes typologie", () => {
  it("OPERATIONNEL_TYPOLOGIES = M/D + Fab (sans stockage)", () => {
    expect(OPERATIONNEL_TYPOLOGIES).toEqual(["montage_demontage", "fabrication"]);
    expect(OPERATIONNEL_TYPOLOGIES).not.toContain("stockage");
  });
  it("AFFAIRE_TYPOLOGIES contient les 5 valeurs", () => {
    expect(AFFAIRE_TYPOLOGIES).toHaveLength(5);
    expect(new Set(AFFAIRE_TYPOLOGIES).size).toBe(5);
  });
  it("labels et couleurs définis pour chaque typologie", () => {
    for (const t of AFFAIRE_TYPOLOGIES) {
      expect(AFFAIRE_TYPOLOGIE_LABELS[t]).toBeTruthy();
      expect(AFFAIRE_TYPOLOGIE_COLORS[t].bg).toMatch(/^var\(--typologie-/);
      expect(AFFAIRE_TYPOLOGIE_COLORS[t].fg).toMatch(/^var\(--typologie-/);
    }
  });
});
