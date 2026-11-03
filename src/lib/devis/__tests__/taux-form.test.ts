import { describe, expect, it } from "vitest";
import { evaluerTaux, niveauInitial, parseMontant, NOUVEAU_NIVEAU } from "../taux-form";

const niv = [{ niveau: "standard", taux_vente: 55, cout_revient: null, par_defaut: true }];
const base = { choix: "standard", nouveauNiveau: "", taux: "55", cout: "", date: "2026-11-03" };

describe("formulaire taux devis", () => {
  it("coût seul sur un niveau existant conserve le taux de vente en vigueur", () => {
    expect(evaluerTaux({ ...base, taux: "", cout: "38,5" }, niv)).toEqual({ ok: true, niveau: "standard", taux_vente: 55, cout_revient: 38.5 });
  });
  it("refuse si rien ne change", () => {
    expect(evaluerTaux(base, niv).ok).toBe(false);
  });
  it("refuse un nombre négatif", () => {
    expect(evaluerTaux({ ...base, cout: "-3" }, niv).ok).toBe(false);
  });
  it("date d'effet obligatoire", () => {
    expect(evaluerTaux({ ...base, cout: "30", date: "" }, niv).ok).toBe(false);
  });
  it("niveau par défaut pré-sélectionné, sinon nouveau niveau", () => {
    expect(niveauInitial(niv)).toBe("standard");
    expect(niveauInitial([])).toBe(NOUVEAU_NIVEAU);
  });
  it("virgule acceptée", () => {
    expect(parseMontant("12,75")).toBe(12.75);
  });
});
