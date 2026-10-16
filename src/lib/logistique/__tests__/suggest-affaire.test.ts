import { describe, it, expect } from "vitest";
import { suggestAffaires } from "../suggest-affaire";

const affs = [
  { id: "1", numero: "6034", nom: "Grande Épicerie Noël 2026", client: "Le Bon Marché", phase: "signe" },
  { id: "2", numero: "4131", nom: "The Voice S16 démontage", client: "ITV", phase: "signe" },
  { id: "3", numero: "9403", nom: "Chocolat show", client: null, phase: "opportunite" },
];

describe("suggestAffaires", () => {
  it("un numéro cité passe en premier", () => {
    expect(suggestAffaires("Re: chantier 4131 voice", affs)[0].affaire.numero).toBe("4131");
  });
  it("retrouve par mots-clés sans accents", () => {
    expect(suggestAffaires("Fw: Grande Epicerie de Paris / Noel 2026", affs)[0].affaire.numero).toBe("6034");
  });
  it("aucun résultat sans mot commun", () => {
    expect(suggestAffaires("Bonjour, facture", affs)).toEqual([]);
  });
});
