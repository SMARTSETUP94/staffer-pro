import { describe, it, expect } from "vitest";
import { suggererParMotsCles, codesRecents } from "../suggestion-affaires";
const A = [
  { id: "1", numero: "6064", nom: "Jeu des 1000 euros", client: "France Télévisions", lieu: null },
  { id: "2", numero: "9500", nom: "Noël Perspex", client: "traceydee", lieu: "Paris" },
  { id: "3", numero: "4123", nom: "Salon", client: "TF1", lieu: null },
];
describe("suggestions d'affaires", () => {
  it("trouve l'affaire par mots clés", () => {
    expect(suggererParMotsCles("Chiffrage Le Jeu des 1000 EUROS France Televisions", A)[0].affaire.id).toBe("1");
  });
  it("un numéro cité passe en tête", () => {
    expect(suggererParMotsCles("Point sur 4123 Noël perspex", A)[0].affaire.id).toBe("3");
  });
  it("codes récents triés du plus grand au plus petit", () => {
    expect(codesRecents(A).map((a) => a.numero)).toEqual(["9500", "6064", "4123"]);
  });
});
