import { describe, it, expect } from "vitest";
import {
  computeProfileCompletion,
  isProfileComplete,
  stepIdentiteSchema,
  stepSecuriteSchema,
  stepRgpdSchema,
  telephoneSchema,
  codePostalSchema,
} from "@/lib/onboarding-schemas";

describe("onboarding-schemas", () => {
  describe("telephoneSchema", () => {
    it("accepte 06 12 34 56 78", () => {
      expect(telephoneSchema.safeParse("06 12 34 56 78").success).toBe(true);
    });
    it("accepte 0612345678", () => {
      expect(telephoneSchema.safeParse("0612345678").success).toBe(true);
    });
    it("accepte +33612345678", () => {
      expect(telephoneSchema.safeParse("+33612345678").success).toBe(true);
    });
    it("rejette vide", () => {
      expect(telephoneSchema.safeParse("").success).toBe(false);
    });
    it("rejette texte", () => {
      expect(telephoneSchema.safeParse("abc").success).toBe(false);
    });
  });

  describe("codePostalSchema", () => {
    it("accepte 75001", () => {
      expect(codePostalSchema.safeParse("75001").success).toBe(true);
    });
    it("rejette 4 chiffres", () => {
      expect(codePostalSchema.safeParse("7500").success).toBe(false);
    });
    it("rejette lettres", () => {
      expect(codePostalSchema.safeParse("75A01").success).toBe(false);
    });
  });

  describe("stepRgpdSchema", () => {
    it("rejette consent=false", () => {
      expect(stepRgpdSchema.safeParse({ rgpd_consent: false }).success).toBe(false);
    });
    it("accepte consent=true", () => {
      expect(stepRgpdSchema.safeParse({ rgpd_consent: true }).success).toBe(true);
    });
  });

  describe("stepIdentiteSchema", () => {
    it("accepte avec téléphone seul", () => {
      const r = stepIdentiteSchema.safeParse({ telephone: "0612345678" });
      expect(r.success).toBe(true);
    });
    it("rejette téléphone manquant", () => {
      const r = stepIdentiteSchema.safeParse({ telephone: "" });
      expect(r.success).toBe(false);
    });
    it("rejette bio > 200 chars", () => {
      const r = stepIdentiteSchema.safeParse({
        telephone: "0612345678",
        bio_courte: "x".repeat(201),
      });
      expect(r.success).toBe(false);
    });
    it("rejette date naissance invalide", () => {
      const r = stepIdentiteSchema.safeParse({
        telephone: "0612345678",
        date_naissance: "32-01-2024",
      });
      expect(r.success).toBe(false);
    });
  });

  describe("stepSecuriteSchema", () => {
    const valid = {
      adresse_rue: "12 rue de la Paix",
      adresse_code_postal: "75002",
      adresse_ville: "Paris",
      adresse_pays: "France",
      contact_urgence_nom: "Jean Dupont",
      contact_urgence_telephone: "0612345678",
    };
    it("accepte payload complet", () => {
      expect(stepSecuriteSchema.safeParse(valid).success).toBe(true);
    });
    it("rejette CP invalide", () => {
      expect(
        stepSecuriteSchema.safeParse({ ...valid, adresse_code_postal: "ABCDE" }).success,
      ).toBe(false);
    });
    it("rejette contact urgence sans tel", () => {
      expect(
        stepSecuriteSchema.safeParse({ ...valid, contact_urgence_telephone: "" }).success,
      ).toBe(false);
    });
  });

  describe("isProfileComplete / computeProfileCompletion", () => {
    const fullProfile = {
      telephone: "0612345678",
      adresse_rue: "12 rue X",
      adresse_code_postal: "75001",
      adresse_ville: "Paris",
      contact_urgence_nom: "Jean",
      contact_urgence_telephone: "0612345678",
      rgpd_consent_at: "2026-04-29T00:00:00Z",
    };

    it("isProfileComplete=true sur profil complet", () => {
      expect(isProfileComplete(fullProfile)).toBe(true);
    });
    it("isProfileComplete=false si tel manquant", () => {
      expect(isProfileComplete({ ...fullProfile, telephone: "" })).toBe(false);
    });
    it("isProfileComplete=false sur null", () => {
      expect(isProfileComplete(null)).toBe(false);
    });
    it("computeProfileCompletion=100 sur profil complet", () => {
      expect(computeProfileCompletion(fullProfile)).toBe(100);
    });
    it("computeProfileCompletion=0 sur null", () => {
      expect(computeProfileCompletion(null)).toBe(0);
    });
    it("computeProfileCompletion partiel", () => {
      const partial = {
        telephone: "0612345678",
        adresse_rue: "rue",
        adresse_code_postal: "75001",
      };
      // 3 sur 7 = 43%
      expect(computeProfileCompletion(partial)).toBe(43);
    });
    it("ignore rgpd absent", () => {
      const noRgpd = { ...fullProfile, rgpd_consent_at: null };
      expect(isProfileComplete(noRgpd)).toBe(false);
    });
  });
});
