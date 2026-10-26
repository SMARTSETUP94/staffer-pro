import { describe, expect, it } from "vitest";
import { canAssignDessinateur, signatureAffectations } from "../affaire-affectations";

describe("Affectations chantier", () => {
  it("permet un dessinateur sur Fabrication 6XXX seulement", () => {
    expect(canAssignDessinateur("6067")).toBe(true);
    for (const code of ["4132", "9437", "20123", "60670", "612"]) expect(canAssignDessinateur(code)).toBe(false);
  });
  it("conserve le chef de projet indépendamment du code à la signature", () => {
    for (const code of ["6067", "4133", "20123"]) expect(signatureAffectations("chef", "be", code)._chef_projet_id).toBe("chef");
  });
  it("transmet le dessinateur pour 6XXX, sans affectation cachée sur 4XXX", () => {
    expect(signatureAffectations("chef", "be", "6067")._dessinateur_id).toBe("be");
    expect(signatureAffectations("chef", "be", "4133")._dessinateur_id).toBeNull();
  });
});