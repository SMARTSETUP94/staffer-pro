import { describe, it, expect } from "vitest";
import { familleUnite, quantiteDepuisAide } from "../calcul";

const PANNEAU = { longueur_mm: 2800, largeur_mm: 2070 }; // 5,796 m²

describe("aide à la conversion selon l'unité du produit", () => {
  it("prix au m² + format connu : panneaux arrondis × surface du panneau", () => {
    // 10 m² + 10 % = 11 m² → 2 panneaux → 11,59 m² facturés
    const r = quantiteDepuisAide("m²", "m2", { m2: 10 }, PANNEAU, 10)!;
    expect(r.quantite).toBe(11.59);
    expect(r.detail).toContain("2 panneaux de 2,8 × 2,07 = 11,59 m²");
  });
  it("prix au m², 15 m² sans perte : 3 panneaux = 17,39 m²", () => {
    expect(quantiteDepuisAide("m²", "m2", { m2: 15 }, PANNEAU, 0)!.quantite).toBe(17.39);
  });
  it("prix au m² sans format : m² × (1 + perte)", () => {
    expect(quantiteDepuisAide("m²", "m2", { m2: 10 }, {}, 10)!.quantite).toBe(11);
  });
  it("prix au m² depuis des ml avec laize connue (moquette 2 m)", () => {
    expect(quantiteDepuisAide("m²", "ml", { ml: 5 }, { largeur_mm: 2000 }, 0)!.quantite).toBe(10);
  });
  it("prix au ml + longueur de barre connue : barres arrondies × longueur", () => {
    // 25 ml → 5 barres de 5,10 m = 25,5 ml
    const r = quantiteDepuisAide("ml", "ml", { ml: 25 }, { longueur_mm: 5100 }, 0)!;
    expect(r.quantite).toBe(25.5);
    expect(r.detail).toContain("5 barres de 5,1 m");
  });
  it("prix au ml sans longueur : ml × (1 + perte)", () => {
    expect(quantiteDepuisAide("ml", "ml", { ml: 20 }, {}, 10)!.quantite).toBe(22);
  });
  it("prix au panneau : nombre de panneaux", () => {
    expect(quantiteDepuisAide("panneau", "m2", { m2: 12 }, PANNEAU, 10)!.quantite).toBe(3);
  });
  it("prix à la barre : nombre de barres", () => {
    expect(quantiteDepuisAide("barre", "ml", { ml: 25 }, { longueur_mm: 6000 }, 0)!.quantite).toBe(5);
  });
  it("prix au rouleau : nombre de rouleaux", () => {
    expect(quantiteDepuisAide("rouleau", "m2", { m2: 30 }, { longueur_mm: 25000, largeur_mm: 1000 }, 0)!.quantite).toBe(2);
  });
  it("plaque / tôle / feuille comptées à la pièce", () => {
    expect(familleUnite("plaque")).toBe("piece");
    expect(familleUnite("tôle")).toBe("piece");
    expect(familleUnite("feuille")).toBe("piece");
    expect(quantiteDepuisAide("tôle", "pieces", { pieces: [{ l: 1000, w: 500, n: 12 }] }, { longueur_mm: 2500, largeur_mm: 1250 })!.quantite).toBe(2);
  });
  it("format inconnu pour une pièce : pas de calcul", () => {
    expect(quantiteDepuisAide("panneau", "m2", { m2: 10 }, {}, 0)).toBeNull();
  });
});

import { calculerDevis } from "../calcul";
describe("rédacteur sans droit coûts : prix de vente fourni par le serveur", () => {
  it("matériau et ligne libre comptés au prix de vente, sans achat ni coefficient", () => {
    const r = calculerDevis(
      [{ id: "o", parent_id: null, type: "objet", quantite: 2 }], [],
      [{ ligne_id: "o", quantite: 11.59, prix_achat: null, coefficient: 1, prix_vente_unitaire: 13.2 }],
      [{ ligne_id: "o", quantite: 3, prix_achat: null, prix_forfait: null, coefficient: 1, prix_vente_unitaire: 14, par_unite: true },
       { ligne_id: "o", quantite: 1, prix_forfait: 330, coefficient: 1, par_unite: false }],
    );
    // (11,59 × 13,2 + 3 × 14) × 2 + 330 = 719,98
    expect(r.lignes.o).toBe(719.98);
  });
});
