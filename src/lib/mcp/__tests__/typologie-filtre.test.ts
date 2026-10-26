import { describe, expect, it } from "vitest";
import { MCP_TYPOLOGIES, mapTypologieRow, matchPipelineFiltre, normalizeTypologieArgs, typologieFromMcp } from "../typologie";

describe("pipeline_opportunites filtre texte", () => {
  const opp = { numero: "9463", nom: "Stand Vroom salon", client: "Agence Événements" };
  it("trouve par intitulé, insensible à la casse", () => expect(matchPipelineFiltre(opp, "vroom")).toBe(true));
  it("trouve par code", () => expect(matchPipelineFiltre(opp, "9463")).toBe(true));
  it("trouve par client sans accents", () => expect(matchPipelineFiltre(opp, "evenements")).toBe(true));
  it("exclut ce qui ne correspond pas", () => expect(matchPipelineFiltre(opp, "Renault")).toBe(false));
});

describe("typologie 9XXX exposée comme opportunité", () => {
  it("le schéma MCP n'expose plus prototype", () => {
    expect(MCP_TYPOLOGIES).toContain("opportunite");
    expect(MCP_TYPOLOGIES as readonly string[]).not.toContain("prototype");
  });
  it("opportunite en entrée devient la valeur interne", () => expect(typologieFromMcp("opportunite")).toBe("prototype"));
  it("la sortie renomme typologie et typologie_future", () => {
    expect(mapTypologieRow({ typologie: "prototype", typologie_future: "fabrication" })).toEqual({ typologie: "opportunite", typologie_future: "fabrication" });
  });
  it("normalise typologie_future dans champs", () => {
    expect(normalizeTypologieArgs({ champs: { typologie_future: "opportunite" } })).toEqual({ champs: { typologie_future: "prototype" } });
  });
});
