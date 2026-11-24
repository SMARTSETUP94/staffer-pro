import { describe, expect, it } from "vitest";
import { construireLot, lirePrix } from "../articles-sans-prix";

const a = (id: string, prix: number | null = null) => ({ id, produit: `Article ${id}`, famille: null, ref: null, unite: "u", prix_achat_net: prix, fournisseur: null });

describe("articles sans prix", () => {
  it("accepte la virgule et les espaces", () => { expect(lirePrix("1 234,5")).toBe(1234.5); });
  it("ignore les cellules vides et garde l'ancien prix pour le contrôle", () => {
    const r = construireLot([a("1", 0), a("2")], { "1": "12,40", "2": "" });
    expect(r.lot).toEqual([{ id: "1", ancien_prix: 0, prix: 12.4 }]);
    expect(r.erreurs).toEqual([]);
  });
  it("refuse un prix nul, négatif ou illisible", () => {
    const r = construireLot([a("1"), a("2"), a("3")], { "1": "0", "2": "-3", "3": "abc" });
    expect(r.lot).toEqual([]);
    expect(r.erreurs).toHaveLength(3);
  });
});
