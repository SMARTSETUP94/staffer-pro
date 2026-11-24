import { describe, expect, it } from "vitest";
import { ciblePipelineDevis, STATUT_DEVIS_LABEL, STATUTS_DEVIS_VISIBLES, libelleStatut } from "../statuts";
import { STATUT_DEVIS_FILTRE_LABEL } from "@/lib/pipeline-filtres";
import { libelleStatutDevis } from "../progbat-export";

describe("Un libellé par statut de devis", () => {
  it("liste les sept statuts demandés", () => {
    expect(STATUTS_DEVIS_VISIBLES.map((s) => STATUT_DEVIS_LABEL[s])).toEqual(["Brouillon", "À valider", "Finalisé", "Transféré", "Signé", "Refusé", "Remplacé"]);
  });
  it("n'affiche plus deux fois « Brouillon » dans le filtre du pipeline", () => {
    const libelles = Object.values(STATUT_DEVIS_FILTRE_LABEL);
    expect(libelles.filter((l) => l === "Brouillon")).toHaveLength(1);
    expect(new Set(libelles).size).toBe(libelles.length);
    expect(STATUT_DEVIS_FILTRE_LABEL.a_valider).toBe("À valider");
  });
  it("garde « Transféré » même avec un numéro ProGBat ou une date d'envoi", () => {
    expect(libelleStatutDevis("transfere", "D-202611-0012", "2026-11-03")).toBe("Transféré");
    expect(libelleStatut("a_valider")).toBe("À valider");
  });
  it("conserve la règle du pipeline : à valider compte comme à faire", () => {
    expect(ciblePipelineDevis("a_valider")).toBe("a_faire");
    expect(ciblePipelineDevis("valide")).toBe("a_l_etude");
    expect(ciblePipelineDevis("transfere")).toBe("envoye");
    expect(ciblePipelineDevis("signe")).toBeNull();
  });
});
