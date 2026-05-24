import { describe, it, expect } from "vitest";
import {
  getEditableFields,
  canEditAnyField,
} from "../objet-fiche-permissions";

describe("objet-fiche-permissions (Lot 8.2c)", () => {
  it("admin peut éditer tous les champs (dont plans_url + dimensions + matériaux + finition_detail)", () => {
    const f = getEditableFields(["admin"]);
    expect(f.has("nom")).toBe(true);
    expect(f.has("quantite")).toBe(true);
    expect(f.has("commentaire")).toBe(true);
    expect(f.has("respo_fab_id")).toBe(true);
    expect(f.has("plans_url")).toBe(true);
    expect(f.has("largeur_mm")).toBe(true);
    expect(f.has("longueur_mm")).toBe(true);
    expect(f.has("hauteur_mm")).toBe(true);
    expect(f.has("materiaux")).toBe(true);
    expect(f.has("finition_detail")).toBe(true);
  });

  it("admin n'a PLUS heures_prevues (retiré en 8.2c)", () => {
    const f = getEditableFields(["admin"]);
    // @ts-expect-error — heures_prevues n'est plus dans le type
    expect(f.has("heures_prevues")).toBe(false);
  });

  it("chef_chantier édite tout sauf plans_url", () => {
    const f = getEditableFields(["chef_chantier"]);
    expect(f.has("plans_url")).toBe(false);
    expect(f.has("respo_fab_id")).toBe(true);
    expect(f.has("largeur_mm")).toBe(true);
    expect(f.has("materiaux")).toBe(true);
    expect(f.has("finition_detail")).toBe(true);
  });

  it("atelier_chef édite nom + commentaire + responsable + finition_detail seulement", () => {
    const f = getEditableFields(["atelier_chef"]);
    expect([...f].sort()).toEqual(
      ["commentaire", "finition_detail", "nom", "respo_fab_id"].sort(),
    );
    expect(f.has("largeur_mm")).toBe(false);
    expect(f.has("materiaux")).toBe(false);
    expect(f.has("quantite")).toBe(false);
  });

  it("bureau_etude édite commentaire + plans + dimensions + matériaux + finition_detail", () => {
    const f = getEditableFields(["bureau_etude"]);
    expect([...f].sort()).toEqual(
      [
        "commentaire",
        "finition_detail",
        "hauteur_mm",
        "largeur_mm",
        "longueur_mm",
        "materiaux",
        "plans_url",
      ].sort(),
    );
  });

  it("commercial = commentaire seulement (lecture seule sur la fab)", () => {
    const f = getEditableFields(["commercial"]);
    expect([...f]).toEqual(["commentaire"]);
    expect(f.has("largeur_mm")).toBe(false);
    expect(f.has("materiaux")).toBe(false);
    expect(f.has("finition_detail")).toBe(false);
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
    expect(f.has("commentaire")).toBe(true);
    expect(f.has("plans_url")).toBe(true);
    expect(f.has("largeur_mm")).toBe(true);
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
