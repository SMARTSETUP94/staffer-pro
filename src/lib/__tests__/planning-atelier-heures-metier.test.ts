import { describe, expect, it } from "vitest";
import { heuresPrincipales, type Sel } from "@/components/planning-simple/useSelectionDevis";
import type { DevisHeures } from "@/lib/planning-devis-heures.functions";

const devis = (o: Partial<DevisHeures> = {}): DevisHeures => ({
  id: "d1",
  numero: "6064-R1",
  statut: "a_valider",
  source: "staffing",
  heures: { "1": 558, "5": 0, "9": 11 },
  total: 569,
  objets: [
    { id: "o1", libelle: "Comptoir", heures: { "1": 558 } },
    { id: "_autres", libelle: "Autres heures", heures: { "5": 0, "9": 11 } },
  ],
  ...o,
});
const sel: Sel = { m: ["7", "8"], o: {} };

describe("heuresPrincipales (heures affichées sous les lignes métier)", () => {
  it("est vide tant que les devis du chantier ne sont pas chargés", () => {
    expect(heuresPrincipales(undefined, sel)).toBeNull();
    expect(heuresPrincipales([], sel)).toBeNull();
  });
  it("laisse un métier à 0 h à 0, donc masqué par le planning", () => {
    const h = heuresPrincipales([devis()], sel)!;
    expect(h["5"]).toBe(0);
    expect(h["1"]).toBe(558);
  });
  it("passe un métier à 0 quand tous ses objets sont décochés", () => {
    const h = heuresPrincipales([devis()], { m: [], o: { d1: ["o1"] } })!;
    expect(h["1"]).toBe(0);
    expect(h["9"]).toBe(11);
  });
});
