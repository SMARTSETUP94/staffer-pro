import { describe, expect, it } from "vitest";
import { droitsEntete, grouperCharges, ligneInterlocuteur, manquesClient } from "../entete-verrou";

describe("en-tête devis : verrouillage", () => {
  it("brouillon : tout modifiable", () => {
    expect(droitsEntete("brouillon", true, true)).toMatchObject({ devis: true, fiches: true, charge: true });
  });
  it("finalisé : fiches et chargé d'affaires seulement", () => {
    expect(droitsEntete("valide", true, true)).toMatchObject({ devis: false, fiches: true, charge: true });
    expect(droitsEntete("a_valider", true, false)).toMatchObject({ devis: false, fiches: true, charge: false });
  });
  it("transféré, signé, remplacé : lecture seule sauf chargé d'affaires", () => {
    for (const st of ["transfere", "signe", "remplace", "refuse"]) expect(droitsEntete(st, true, true)).toMatchObject({ devis: false, fiches: false, charge: true });
  });
  it("sans droit de rédaction : ni devis ni fiches", () => {
    expect(droitsEntete("brouillon", false, false)).toMatchObject({ devis: false, fiches: false, charge: false });
  });
});

describe("PDF : interlocuteur Set Up", () => {
  it("nom et e-mail, jamais de téléphone", () => {
    expect(ligneInterlocuteur({ nom: "Gabin Chaussegros", email: "gabin@setup.paris" })).toBe("Votre interlocuteur Set Up : Gabin Chaussegros · gabin@setup.paris");
  });
  it("nom seul sans e-mail pro ; omis sans chargé d'affaires", () => {
    expect(ligneInterlocuteur({ nom: "Gabin Chaussegros", email: null })).toBe("Votre interlocuteur Set Up : Gabin Chaussegros");
    expect(ligneInterlocuteur(null)).toBeNull();
  });
});

describe("liste des chargés d'affaires", () => {
  const l = [{ id: "1", prenom: "Gabin", nom: "Chaussegros", habituel: true }, { id: "2", prenom: "Élodie", nom: "Martin", habituel: false }];
  it("habituels d'abord, recherche sur tout, sans accent", () => {
    expect(grouperCharges(l, "").habituels.map((e) => e.id)).toEqual(["1"]);
    expect(grouperCharges(l, "elod").autres.map((e) => e.id)).toEqual(["2"]);
  });
});

it("alerte e-mail manquant sur la fiche client", () => {
  expect(manquesClient({ adresse: "a", code_postal: "1", ville: "v", siret: "s", tva_intracom: "t" }, null)).toEqual(["e-mail"]);
});
