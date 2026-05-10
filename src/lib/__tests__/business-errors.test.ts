import { describe, expect, it } from "vitest";
import { parseBusinessError, formatBusinessError } from "../business-errors";

describe("business-errors", () => {
  it("extrait HEURES_INVALIDES depuis un message PostgreSQL", () => {
    const err = new Error(
      "HEURES_INVALIDES: heures_reelles doit être entre 0 et 24 (reçu 25.00)",
    );
    const parsed = parseBusinessError(err);
    expect(parsed.code).toBe("HEURES_INVALIDES");
    expect(parsed.message).toMatch(/Heures invalides/);
  });

  it("extrait DATES_CONTRAT_INVALIDES", () => {
    const parsed = parseBusinessError({
      message: "DATES_CONTRAT_INVALIDES: date_fin < date_debut",
    });
    expect(parsed.code).toBe("DATES_CONTRAT_INVALIDES");
  });

  it("extrait TAUX_INVALIDE", () => {
    const parsed = parseBusinessError("TAUX_INVALIDE: taux_horaire_brut doit être > 0");
    expect(parsed.code).toBe("TAUX_INVALIDE");
  });

  it("renvoie UNKNOWN pour une erreur générique", () => {
    const parsed = parseBusinessError(new Error("connection timeout"));
    expect(parsed.code).toBe("UNKNOWN");
    expect(parsed.message).toBe("connection timeout");
  });

  it("formatBusinessError produit un tuple [titre, options]", () => {
    const [title, opts] = formatBusinessError(
      new Error("HEURES_INVALIDES: foo"),
    );
    expect(title).toMatch(/Heures invalides/);
    expect(opts.description).toBe("Code : HEURES_INVALIDES");
  });

  it("formatBusinessError fallback UNKNOWN", () => {
    const [title, opts] = formatBusinessError(new Error("Timeout DB"));
    expect(title).toBe("Erreur");
    expect(opts.description).toBe("Timeout DB");
  });
});
