import { describe, it, expect } from "vitest";
import {
  getEditableFields,
  canEditAnyField,
} from "../objet-fiche-permissions";

describe("objet-fiche-permissions", () => {
  it("admin peut éditer tous les champs (y compris plans_url)", () => {
    const f = getEditableFields(["admin"]);
    expect(f.has("nom")).toBe(true);
    expect(f.has("quantite")).toBe(true);
    expect(f.has("commentaire")).toBe(true);
    expect(f.has("heures_prevues")).toBe(true);
    expect(f.has("respo_fab_id")).toBe(true);
    expect(f.has("plans_url")).toBe(true);
  });

  it("chef_chantier édite tout sauf plans_url", () => {
    const f = getEditableFields(["chef_chantier"]);
    expect(f.has("plans_url")).toBe(false);
    expect(f.has("heures_prevues")).toBe(true);
    expect(f.has("respo_fab_id")).toBe(true);
  });

  it("atelier_chef édite responsable + nom + commentaire seulement", () => {
    const f = getEditableFields(["atelier_chef"]);
    expect(f.has("nom")).toBe(true);
    expect(f.has("commentaire")).toBe(true);
    expect(f.has("respo_fab_id")).toBe(true);
    expect(f.has("quantite")).toBe(false);
    expect(f.has("heures_prevues")).toBe(false);
  });

  it("bureau_etude édite commentaire + plans_url uniquement", () => {
    const f = getEditableFields(["bureau_etude"]);
    expect([...f].sort()).toEqual(["commentaire", "plans_url"]);
  });

  it("commercial = commentaire seulement (lecture seule sur la fab)", () => {
    const f = getEditableFields(["commercial"]);
    expect([...f]).toEqual(["commentaire"]);
    expect(f.has("nom")).toBe(false);
    expect(f.has("quantite")).toBe(false);
    expect(f.has("heures_prevues")).toBe(false);
  });

  it("poseur / atelier_metier / employe / rh / logistique / chef_metier_scoped = lecture seule", () => {
    for (const role of [
      "poseur",
      "atelier_metier",
      "employe",
      "rh",
      "logistique",
      "chef_metier_scoped",
    ]) {
      expect(getEditableFields([role]).size).toBe(0);
    }
  });

  it("multi-rôles = union des champs", () => {
    const f = getEditableFields(["bureau_etude", "commercial"]);
    expect([...f].sort()).toEqual(["commentaire", "plans_url"]);
  });

  it("canEditAnyField", () => {
    expect(canEditAnyField(["poseur"])).toBe(false);
    expect(canEditAnyField(["commercial"])).toBe(true);
    expect(canEditAnyField([])).toBe(false);
  });

  it("rôle inconnu ignoré", () => {
    expect(getEditableFields(["totally_invented"]).size).toBe(0);
  });
});
