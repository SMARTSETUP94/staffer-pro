import { describe, expect, it } from "vitest";
import { heuresParObjet } from "../planning-devis-objets";

const lignes = [
  { id: "z", parent_id: null, type: "zone", quantite: 1, libelle: "Zone" },
  { id: "a", parent_id: "z", type: "objet", quantite: 2, libelle: "Comptoir" },
  { id: "a1", parent_id: "a", type: "objet", quantite: 3, libelle: "Tiroir" },
  { id: "b", parent_id: "z", type: "objet", quantite: 1, libelle: "Totem" },
  { id: "o", parent_id: null, type: "option", quantite: 1, libelle: "Opt", option: true },
  { id: "c", parent_id: "o", type: "objet", quantite: 1, libelle: "Optionnel" },
];
const heures = [
  { ligne_id: "a", heures: 10, par_unite: true, metier_id: 1 },
  { ligne_id: "a1", heures: 1, par_unite: true, metier_id: 1 },
  { ligne_id: "b", heures: 5, par_unite: false, metier_id: 3 },
  { ligne_id: "c", heures: 99, par_unite: false, metier_id: 1 },
];

describe("heuresParObjet", () => {
  it("rattache les sous-objets à l'objet de premier niveau et multiplie par la quantité", () => {
    const r = heuresParObjet(lignes, heures, { "1": 23, "3": 5 });
    expect(r.find((o) => o.id === "a")?.heures["1"]).toBe(23);
    expect(r.find((o) => o.id === "b")?.heures["3"]).toBe(5);
    expect(r.some((o) => o.id === "c")).toBe(false);
  });
  it("met le reste du total devis dans « Autres heures » pour que la somme corresponde", () => {
    const r = heuresParObjet(lignes, heures, { "1": 30, "3": 5, "7": 24 });
    const autres = r.find((o) => o.id === "_autres");
    expect(autres?.heures).toEqual({ "1": 7, "7": 24 });
  });
});
