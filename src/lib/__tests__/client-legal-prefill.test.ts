import { describe, expect, it } from "vitest";
import { prefillClientLegal, sirenFromIdentifier } from "../client-legal-prefill";

describe("préremplissage juridique", () => {
  it("extrait le SIREN de 9 chiffres du SIRET", () => {
    expect(sirenFromIdentifier("73282932000074")).toBe("732829320");
    expect(sirenFromIdentifier("732829320")).toBe("732829320");
    expect(sirenFromIdentifier("inconnu")).toBeNull();
  });
  it("préremplit les informations juridiques vides", () => {
    expect(prefillClientLegal({ siret: null, adresse: null, site_web: null }, {
      siret: "73282932000074", adresse: "1 rue de Paris, 75001 Paris", site_web: "https://example.org",
    })).toEqual({ siret: "73282932000074", adresse: "1 rue de Paris, 75001 Paris", site_web: "https://example.org", dirigeant: null });
  });
  it("préserve les informations déjà renseignées", () => {
    const current = { siret: "732829320", adresse: "Adresse vérifiée", site_web: "https://verified.fr", dirigeant: "Marie Dupont" };
    expect(prefillClientLegal(current, { siret: "12345678900001", adresse: "Autre adresse", site_web: "https://other.fr" })).toEqual(current);
  });
  it("préremplit le dirigeant confirmé quand le champ est vide", () => {
    expect(prefillClientLegal({ siret: null, adresse: null, site_web: null, dirigeant: null }, { siret: null, adresse: null, site_web: null, dirigeant: "  Marie Dupont — Présidente  " }).dirigeant).toBe("Marie Dupont — Présidente");
  });
  it("ne remplace pas le dirigeant déjà renseigné", () => {
    expect(prefillClientLegal({ siret: null, adresse: null, site_web: null, dirigeant: "Marie Dupont" }, { siret: null, adresse: null, site_web: null, dirigeant: "Paul Martin" }).dirigeant).toBe("Marie Dupont");
  });
});