import { describe, expect, it } from "vitest";
import { ciblePipelineDevis, STATUTS_DEVIS_VISIBLES, statutDevisVisible } from "../statuts";

describe("Les cinq états des devis et leur correspondance commerciale", () => {
  it("retire l'état intermédiaire et conserve les devis historiques comme brouillons", () => {
    expect(STATUTS_DEVIS_VISIBLES).toEqual(["brouillon", "valide", "transfere", "signe", "refuse", "remplace"]);
    expect(statutDevisVisible("a_valider")).toBe("brouillon");
  });
  it("relie un brouillon à À faire", () => expect(ciblePipelineDevis("brouillon")).toBe("a_faire"));
  it("relie un devis finalisé à À l'étude", () => expect(ciblePipelineDevis("valide")).toBe("a_l_etude"));
  it("relie un devis envoyé à Envoyé", () => expect(ciblePipelineDevis("transfere")).toBe("envoye"));
  it("ne signe ni ne refuse automatiquement une opportunité", () => {
    expect(ciblePipelineDevis("signe")).toBeNull();
    expect(ciblePipelineDevis("refuse")).toBeNull();
    expect(ciblePipelineDevis("remplace")).toBeNull();
  });
});