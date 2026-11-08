import { describe, expect, it } from "vitest";
import { STATUT_CONTRAT_OPTIONS } from "../statut-contrat-options";

describe("statuts contrat proposés", () => {
  it("ne propose pas la valeur historique Intermittent", () => {
    expect([...STATUT_CONTRAT_OPTIONS]).not.toContain("Intermittent");
  });
  it("conserve CDDU intermittent", () => {
    expect([...STATUT_CONTRAT_OPTIONS]).toContain("CDDU intermittent");
  });
  it("propose Auto-entrepreneur", () => {
    expect([...STATUT_CONTRAT_OPTIONS]).toContain("Auto-entrepreneur");
  });
});