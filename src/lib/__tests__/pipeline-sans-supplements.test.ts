import { describe, it, expect } from "vitest";
import { FILTRES_VIDES, passeFiltres, nbFiltresAvances } from "@/lib/pipeline-filtres";
import pipelineOpportunitesTool from "@/lib/mcp/tools/pipeline_opportunites";

describe("Chantiers signés hors pipeline (option A)", () => {
  it("un ancien filtre « suppléments » enregistré ne masque plus les opportunités ni ne compte", () => {
    const ancien = { ...FILTRES_VIDES, supplements: true } as typeof FILTRES_VIDES;
    expect(nbFiltresAvances(ancien)).toBe(0);
    expect(passeFiltres({ statut_opportunite: "envoye" }, undefined, ancien)).toBe(true);
  });
  it("l'outil Claude pipeline_opportunites ne mentionne aucun supplément", () => {
    expect(JSON.stringify(pipelineOpportunitesTool).toLowerCase()).not.toMatch(/suppl/);
  });
});
