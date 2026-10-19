import { describe, it, expect } from "vitest";
import { computeHtTva } from "@/lib/notes-frais";

describe("notes de frais — calcul HT/TVA", () => {
  it("TVA 20 % sur 120 € TTC → 100 € HT, 20 € TVA", () => {
    expect(computeHtTva(120, 20)).toEqual({ ht: 100, tva: 20 });
  });
  it("TVA 10 % sur 55 € TTC → 50 € HT, 5 € TVA", () => {
    expect(computeHtTva(55, 10)).toEqual({ ht: 50, tva: 5 });
  });
  it("TVA 0 % → HT = TTC", () => {
    expect(computeHtTva(42.5, 0)).toEqual({ ht: 42.5, tva: 0 });
  });
});
