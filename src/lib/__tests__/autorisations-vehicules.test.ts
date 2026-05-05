import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  statutFromExpiration,
  joursAvantExpiration,
  autorisationToPermisLegacy,
  autorisationsCompatiblesVehicule,
  type AutorisationVehicule,
} from "../autorisations-vehicules";

describe("autorisations-vehicules helpers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("statutFromExpiration", () => {
    it("returns 'valide' when no expiration date", () => {
      expect(statutFromExpiration(null)).toBe("valide");
      expect(statutFromExpiration(undefined)).toBe("valide");
    });

    it("returns 'expire' for past date", () => {
      expect(statutFromExpiration("2026-04-01")).toBe("expire");
    });

    it("returns 'expiration_proche' within 30 days", () => {
      expect(statutFromExpiration("2026-05-20")).toBe("expiration_proche");
      expect(statutFromExpiration("2026-06-04")).toBe("expiration_proche");
    });

    it("returns 'valide' for date >30 days away", () => {
      expect(statutFromExpiration("2026-07-01")).toBe("valide");
    });

    it("treats today as expiration_proche (0 days)", () => {
      expect(statutFromExpiration("2026-05-05")).toBe("expiration_proche");
    });
  });

  describe("joursAvantExpiration", () => {
    it("returns null without expiration", () => {
      expect(joursAvantExpiration(null)).toBeNull();
    });

    it("returns positive count for future date", () => {
      expect(joursAvantExpiration("2026-05-10")).toBe(5);
    });

    it("returns negative count for past date", () => {
      expect(joursAvantExpiration("2026-05-01")).toBe(-4);
    });
  });

  describe("autorisationToPermisLegacy", () => {
    it("maps PERMIS_X to legacy code", () => {
      expect(autorisationToPermisLegacy("PERMIS_B")).toBe("B");
      expect(autorisationToPermisLegacy("PERMIS_C")).toBe("C");
      expect(autorisationToPermisLegacy("PERMIS_CE")).toBe("CE");
      expect(autorisationToPermisLegacy("PERMIS_D")).toBe("D");
    });

    it("returns null for CACES types", () => {
      expect(autorisationToPermisLegacy("CACES_R489")).toBeNull();
      expect(autorisationToPermisLegacy("CACES_R486")).toBeNull();
      expect(autorisationToPermisLegacy("CACES_R484")).toBeNull();
    });
  });

  describe("autorisationsCompatiblesVehicule", () => {
    const mk = (
      type: AutorisationVehicule["type_autorisation"],
      exp: string | null,
    ): AutorisationVehicule => ({
      id: type,
      employe_id: "e1",
      type_autorisation: type,
      numero: null,
      date_obtention: null,
      date_expiration: exp,
      fichier_url: null,
      notes: null,
      created_at: "",
      updated_at: "",
    });

    it("only returns valid (non-expired) permits compatible with VL", () => {
      const list = [
        mk("PERMIS_B", "2026-12-01"),
        mk("PERMIS_C", "2026-04-01"), // expired
        mk("CACES_R489", "2027-01-01"), // CACES not a permit
      ];
      const r = autorisationsCompatiblesVehicule(list, "VL");
      expect(r.map((a) => a.type_autorisation)).toEqual(["PERMIS_B"]);
    });

    it("requires C or CE for poids_lourd, ignores B", () => {
      const list = [
        mk("PERMIS_B", "2027-01-01"),
        mk("PERMIS_CE", "2027-01-01"),
      ];
      const r = autorisationsCompatiblesVehicule(list, "poids_lourd");
      expect(r.map((a) => a.type_autorisation)).toEqual(["PERMIS_CE"]);
    });

    it("excludes expired permits even if type matches", () => {
      const list = [mk("PERMIS_C", "2026-04-01")];
      const r = autorisationsCompatiblesVehicule(list, "poids_lourd");
      expect(r).toHaveLength(0);
    });
  });
});
