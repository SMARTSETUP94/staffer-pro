import { describe, expect, it } from "vitest";
import { canAssignDessinateur, signatureAffectations } from "../affaire-affectations";

describe("Affectations chantier", () => {
  it("permet un concepteur / dessinateur quel que soit le code", () => {
    for (const code of ["6067", "4132", "9437", "20123"]) expect(canAssignDessinateur(code)).toBe(true);
  });
  it("conserve le chef de projet indépendamment du code à la signature", () => {
    for (const code of ["6067", "4133", "20123"]) expect(signatureAffectations("chef", "be", code)._chef_projet_id).toBe("chef");
  });
  it("transmet le dessinateur pour tous les codes", () => {
    expect(signatureAffectations("chef", "be", "4133")._dessinateur_id).toBe("be");
  });
});
