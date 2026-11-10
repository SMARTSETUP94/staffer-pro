import { describe, it, expect } from "vitest";
import { resumeFormulaire, estFormulaire } from "../formulaire-resume";
describe("resumeFormulaire", () => {
  it("rend les champs saisis lisibles", () => {
    const t = resumeFormulaire({ origine: "formulaire", opp_projet: "6053 — Test", fichiers: ["a/b.pdf"],
      echeances: [{ type: "appro", date: "2026-11-10", heure_debut: "17:00", a_partir_de: true, lieu: "45 rue Ampère 95300 Ennery", nb_personnes: 1, responsable: "Guillaume M." }] }, "Gabin");
    expect(t).toContain("Date : 10/11/2026");
    expect(t).toContain("Heure : à partir de 17:00");
    expect(t).toContain("Adresse : 45 rue Ampère 95300 Ennery");
    expect(t).toContain("Nombre de personnes : 1");
    expect(t).toContain("Pièces jointes : 1");
  });
  it("reconnaît l'origine formulaire", () => { expect(estFormulaire({ origine: "formulaire" })).toBe(true); expect(estFormulaire({})).toBe(false); });
});
