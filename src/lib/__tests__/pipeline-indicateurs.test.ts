import { describe, expect, it } from "vitest";
import { eurEntier, kEur, totauxColonne, type IndicateurAffaire } from "../pipeline-indicateurs";

const a = (id: string, net: number | null, est: number | null): IndicateurAffaire => ({
  affaire_id: id, statut: "envoye", devis_id: net == null ? null : `d-${id}`, version: net == null ? null : 2, numero_progbat: null,
  net_ht: net, estime: est, a_relancer: false, heures: 0, heures_be: 0,
});

describe("indicateurs pipeline", () => {
  it("k€ arrondi au millier", () => {
    expect(kEur(184_400).replace(/\s/g, " ")).toBe("184 k€");
    expect(kEur(9510.99)).toBe("10 k€");
    expect(kEur(0)).toBe("0 k€");
  });
  it("vignette en euros entiers : 9 510,99 € → 9 511 €", () => {
    expect(eurEntier(9510.99).replace(/\s/g, " ")).toBe("9 511 €");
  });
  it("colonne : chiffré et estimé jamais mélangés, compteur sur toutes les cartes", () => {
    const m = new Map([a("1", 9510.99, null), a("2", null, 12000), a("3", null, null)].map((x) => [x.affaire_id, x]));
    expect(totauxColonne(["1", "2", "3"], m)).toEqual({ nb: 3, chiffre: 9510.99, estime: 12000 });
  });
});
