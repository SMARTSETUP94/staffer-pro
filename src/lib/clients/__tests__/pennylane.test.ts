import { describe, it, expect } from "vitest";
import { CONDITIONS_PAIEMENT, CONDITIONS_PAIEMENT_DEFAUT, luhnOk, tvaDepuisSiren, champsManquantsPennylane, codePostalValide, sirenEffectif } from "../pennylane";

const complet = {
  nom: "ACME", type_client: "entreprise", siren: null, siret: "95311689400015",
  adresse: "8 av", code_postal: "94400", ville: "Vitry", pays: "FR",
  emails_facturation: ["compta@acme.fr"], conditions_paiement: "Paiement sous 30 jours",
};

describe("pennylane", () => {
  it("nouveau client : paiement sous 30 jours par défaut", () => {
    expect(CONDITIONS_PAIEMENT_DEFAUT).toBe("Paiement sous 30 jours");
    expect(CONDITIONS_PAIEMENT).toContain(CONDITIONS_PAIEMENT_DEFAUT);
  });
  it("conserve les six conditions de paiement Pennylane", () => {
    expect(CONDITIONS_PAIEMENT).toEqual([
      "Payable dès réception", "Paiement sous 30 jours", "Paiement 30 jours fin de mois",
      "Paiement sous 45 jours", "Paiement 45 jours fin de mois", "Paiement sous 60 jours",
    ]);
  });
  it("SIRET Setup valide, SIRET faux refusé", () => {
    expect(luhnOk("95311689400015")).toBe(true);
    expect(luhnOk("95311689400016")).toBe(false);
  });
  it("La Poste : somme multiple de 5 acceptée", () => {
    expect(luhnOk("35600000000010")).toBe(true);
    expect(luhnOk("35600000000011")).toBe(false);
  });
  it("TVA calculée depuis le SIREN de Setup", () => {
    expect(tvaDepuisSiren("953116894")).toBe("FR20953116894");
  });
  it("SIREN déduit du SIRET si vide", () => {
    expect(sirenEffectif(null, "95311689400015")).toBe("953116894");
  });
  it("fiche entreprise complète", () => {
    expect(champsManquantsPennylane(complet)).toEqual([]);
  });
  it("entreprise FR sans SIREN ni e-mail ni conditions", () => {
    expect(champsManquantsPennylane({ ...complet, siret: null, emails_facturation: [], conditions_paiement: null }))
      .toEqual(["SIREN", "E-mail ou plateforme de facturation", "Conditions de paiement"]);
  });
  it("particulier : pas de SIREN exigé, nom exigé", () => {
    expect(champsManquantsPennylane({ ...complet, type_client: "particulier", siret: null, nom_facturation: "Durand" })).toEqual([]);
    expect(champsManquantsPennylane({ ...complet, type_client: "particulier", siret: null })).toEqual(["Nom (particulier)"]);
  });
  it("code postal contrôlé seulement en France", () => {
    expect(codePostalValide("980", "FR")).toBe(false);
    expect(codePostalValide("SW1A 1AA", "GB")).toBe(true);
  });
  it("plateforme de facturation acceptée à la place de l'e-mail", () => {
    expect(champsManquantsPennylane({ ...complet, emails_facturation: [], plateforme_facturation: "Portail Chorus" })).toEqual([]);
    expect(champsManquantsPennylane({ ...complet, emails_facturation: [], plateforme_facturation: "  " }))
      .toEqual(["E-mail ou plateforme de facturation"]);
  });
});
