import { describe, expect, it } from "vitest";
import { isDocumentAffaireCode, documentSearchMatches, validateEmailDocument } from "../affaire-document-rules";

describe("Documents par affaire", () => {
  it("inclut les opportunités 9XXX", () => { expect(isDocumentAffaireCode("9437")).toBe(true); });
  it("conserve les chantiers 4XXX", () => { expect(isDocumentAffaireCode("4130")).toBe(true); });
  it("conserve les chantiers 6XXX sans inclure les autres séries", () => {
    expect(isDocumentAffaireCode("6055")).toBe(true);
    expect(isDocumentAffaireCode("20000")).toBe(false);
  });
  it("recherche un chantier par numéro", () => {
    expect(documentSearchMatches(["9437", "Décor"], "9437")).toBe(true);
    expect(documentSearchMatches(["9437", "Décor"], "4130")).toBe(false);
  });
  it("recherche sans accents ni casse", () => { expect(documentSearchMatches(["Décor"], "DECOR")).toBe(true); });
  it("accepte PDF et Word mais refuse le contenu exécutable", () => {
    expect(() => validateEmailDocument("application/pdf", 1200)).not.toThrow();
    expect(() => validateEmailDocument("application/vnd.openxmlformats-officedocument.wordprocessingml.document", 1200)).not.toThrow();
    expect(() => validateEmailDocument("text/html", 1200)).toThrow();
  });
  it("respecte la limite de 15 Mo", () => {
    expect(() => validateEmailDocument("application/pdf", 15 * 1024 * 1024)).not.toThrow();
    expect(() => validateEmailDocument("application/pdf", 15 * 1024 * 1024 + 1)).toThrow();
  });
});