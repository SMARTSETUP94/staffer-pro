import { describe, expect, it } from "vitest";
import { CONFIG_FORMULAIRE_DEFAUT, configFormulaireSchema, erreurIntervention, CHAMPS_FORMULAIRE } from "../formulaire-config";
const chef = "a1234567-1234-4234-8234-123456789abc";
describe("Réglages du formulaire logistique", () => {
  it("conserve les catégories actuelles et les chefs Dispos par défaut", () => {
    expect(CONFIG_FORMULAIRE_DEFAUT.chefs).toBeNull();
    expect(CONFIG_FORMULAIRE_DEFAUT.categories).toContain("appro");
    expect(CONFIG_FORMULAIRE_DEFAUT.obligatoires).toEqual([]);
  });
  it("refuse une catégorie retirée même lors d'un appel direct", () => {
    expect(erreurIntervention({ ...CONFIG_FORMULAIRE_DEFAUT, categories: ["appro"] }, { type: "montage" })).toBe("Catégorie non autorisée");
  });
  it("limite les chefs aux personnes sélectionnées", () => {
    const c = { ...CONFIG_FORMULAIRE_DEFAUT, chefs: [chef] };
    expect(erreurIntervention(c, { type: "appro", responsable_id: "autre" })).toBe("Chef d'équipe non proposé");
    expect(erreurIntervention(c, { type: "appro", responsable_id: chef })).toBeNull();
  });
  it.each(Object.keys(CHAMPS_FORMULAIRE) as Array<keyof typeof CHAMPS_FORMULAIRE>)("refuse le champ obligatoire manquant %s", k => {
    const c = { ...CONFIG_FORMULAIRE_DEFAUT, obligatoires: [k] };
    expect(erreurIntervention(c, { type: "appro" })).not.toBeNull();
    expect(erreurIntervention(c, { type: "appro", [k]: k === "nb_personnes" ? 1 : "renseigné" })).toBeNull();
  });
  it("refuse zéro personne si le nombre est obligatoire", () => {
    expect(erreurIntervention({ ...CONFIG_FORMULAIRE_DEFAUT, obligatoires: ["nb_personnes"] }, { type: "appro", nb_personnes: 0 })).not.toBeNull();
  });
  it("conserve un accueil et refuse les catégories vides", () => {
    expect(configFormulaireSchema.parse({ accueil: "Texte équipe" }).accueil).toBe("Texte équipe");
    expect(configFormulaireSchema.safeParse({ categories: [] }).success).toBe(false);
  });
});