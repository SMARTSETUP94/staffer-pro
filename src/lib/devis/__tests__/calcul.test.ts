import { describe, it, expect } from "vitest";
import { calculerDevis, convertirEnUnitesVente, ecartTauxPct, type CalcLigne } from "../calcul";

const base = (): CalcLigne[] => [
  { id: "z1", parent_id: null, type: "zone", quantite: 1 },
  { id: "z2", parent_id: null, type: "zone", quantite: 1 },
  { id: "o", parent_id: "z1", type: "objet", quantite: 4 },
  { id: "s", parent_id: null, type: "chapitre_suivi", quantite: 1 },
  { id: "opt", parent_id: null, type: "option", quantite: 1 },
];
const heures = [
  { ligne_id: "o", heures: 10, taux_vente: 50, cout_revient: 30, par_unite: true, metier_id: 1 },
  { ligne_id: "o", heures: 8, taux_vente: 75, cout_revient: 40, par_unite: false, metier_id: 8 },
  { ligne_id: "s", heures: 4, taux_vente: 72.5, cout_revient: null, par_unite: true, metier_id: 8 },
];
const mats = [{ ligne_id: "o", quantite: 2, prix_achat: 40, coefficient: 1.45 }];
const libres = [{ ligne_id: "opt", quantite: 1, prix_forfait: 500, coefficient: 1, par_unite: true }];

describe("calcul devis (miroir du calcul serveur)", () => {
  it("objet ×4 multiplie heures et matières, plans communs non multipliés, option hors total", () => {
    const r = calculerDevis(base(), heures, mats, libres);
    // (10×50 + 2×40×1,45) × 4 + 8×75 = 3064 ; suivi 290 ; option 500 exclue
    expect(r.lignes.o).toBe(3064);
    expect(r.total_ht).toBe(3354);
    expect(r.options_ht).toBe(500);
    expect(r.tva).toBe(670.8);
    expect(r.ttc).toBe(4024.8);
    expect(r.heures_metier).toEqual({ "1": 40, "8": 12 });
  });
  it("déplacer un objet change les sous-totaux de zone sans changer le total", () => {
    const l = base(); l[2] = { ...l[2], parent_id: "z2" };
    const r = calculerDevis(l, heures, mats, libres);
    expect(r.racines.z1).toBe(0);
    expect(r.racines.z2).toBe(3064);
    expect(r.total_ht).toBe(3354);
  });
  it("marge non calculable si un coût manque, sinon HT − coûts", () => {
    expect(calculerDevis(base(), heures, mats, libres).marge).toBe("non_calculable");
    const h2 = heures.map((h) => ({ ...h, cout_revient: h.cout_revient ?? 0 }));
    expect(calculerDevis(base(), h2, mats, libres).marge).toBe(1514);
  });
});

describe("aide à la conversion", () => {
  it("m² → panneaux arrondi au supérieur avec perte", () => {
    // panneau 2,8 × 2,07 = 5,796 m² ; 12 m² + 10 % = 13,2 → 3 panneaux
    expect(convertirEnUnitesVente("m2", { m2: 12 }, { longueur_mm: 2800, largeur_mm: 2070 }, 10)).toBe(3);
  });
  it("pièces → panneaux", () => {
    expect(convertirEnUnitesVente("pieces", { pieces: [{ l: 1000, w: 500, n: 12 }] }, { longueur_mm: 2500, largeur_mm: 1250 })).toBe(2);
  });
  it("ml → barres de 6 m", () => {
    expect(convertirEnUnitesVente("ml", { ml: 25 }, { longueur_mm: 6000 })).toBe(5);
  });
  it("écart de taux en %", () => {
    expect(ecartTauxPct(55, 50)).toBe(10);
    expect(ecartTauxPct(50, null)).toBeNull();
  });
});
