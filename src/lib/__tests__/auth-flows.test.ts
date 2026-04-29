/**
 * Tests des helpers liés aux 5 flows auth (v0.26.3 hotfix).
 * Le but n'est pas de mocker Supabase entier mais de figer les invariants
 * critiques qui ont été cassés/réparés.
 */
import { describe, it, expect } from "vitest";
import { validateSetPassword, parseHashTokens } from "@/lib/set-password-helpers";
import { shouldForceSetPassword, isAuthHashPresent } from "@/lib/auth-redirect-helpers";

describe("auth-flows v0.26.3 — invariants", () => {
  describe("Flow A — Inscription invité (set-password)", () => {
    it("validateSetPassword accepte 8 caractères matchés", () => {
      const r = validateSetPassword("12345678", "12345678");
      expect(r.ok).toBe(true);
      expect(r.pwdError).toBeNull();
      expect(r.confirmError).toBeNull();
    });

    it("validateSetPassword rejette < 8 caractères", () => {
      const r = validateSetPassword("123", "123");
      expect(r.ok).toBe(false);
      expect(r.pwdError).toContain("8");
    });

    it("validateSetPassword rejette mismatch", () => {
      const r = validateSetPassword("12345678", "87654321");
      expect(r.ok).toBe(false);
      expect(r.confirmError).toContain("ne correspondent pas");
    });

    it("parseHashTokens extrait access_token et refresh_token", () => {
      const t = parseHashTokens("#access_token=AAA&refresh_token=BBB&type=invite");
      expect(t).toEqual({ access_token: "AAA", refresh_token: "BBB" });
    });

    it("parseHashTokens retourne null si hash vide ou sans access_token", () => {
      expect(parseHashTokens("")).toBeNull();
      expect(parseHashTokens("#type=invite")).toBeNull();
      expect(parseHashTokens("#refresh_token=B")).toBeNull();
    });

    it("parseHashTokens accepte hash sans #", () => {
      const t = parseHashTokens("access_token=X&refresh_token=Y");
      expect(t).toEqual({ access_token: "X", refresh_token: "Y" });
    });
  });

  describe("Flow B/C/D — Détection hash auth pour redirect", () => {
    it("isAuthHashPresent détecte invite", () => {
      expect(isAuthHashPresent("#access_token=X&type=invite")).toBe(true);
    });

    it("isAuthHashPresent détecte recovery", () => {
      expect(isAuthHashPresent("#type=recovery&access_token=X")).toBe(true);
    });

    it("isAuthHashPresent détecte magiclink", () => {
      expect(isAuthHashPresent("#type=magiclink&access_token=X")).toBe(true);
    });

    it("isAuthHashPresent détecte signup", () => {
      expect(isAuthHashPresent("#type=signup&access_token=X")).toBe(true);
    });

    it("isAuthHashPresent ignore hash sans access_token ni type", () => {
      expect(isAuthHashPresent("#scrollto=section")).toBe(false);
      expect(isAuthHashPresent("")).toBe(false);
      expect(isAuthHashPresent(null)).toBe(false);
      expect(isAuthHashPresent(undefined)).toBe(false);
    });
  });

  describe("Flow E — AppGuard mustSetPassword", () => {
    it("force chef sans password sur set-password", () => {
      expect(
        shouldForceSetPassword({
          isChefOrAdmin: true,
          passwordSetDone: false,
          passwordSetAt: null,
          isInviteStatus: false,
          profileCompleted: false,
        }),
      ).toBe(true);
    });

    it("force admin sans password sur set-password", () => {
      expect(
        shouldForceSetPassword({
          isChefOrAdmin: true,
          passwordSetDone: false,
          passwordSetAt: null,
          isInviteStatus: true,
          profileCompleted: false,
        }),
      ).toBe(true);
    });

    it("force employé invité jamais activé sur set-password", () => {
      expect(
        shouldForceSetPassword({
          isChefOrAdmin: false,
          passwordSetDone: false,
          passwordSetAt: null,
          isInviteStatus: true,
          profileCompleted: false,
        }),
      ).toBe(true);
    });

    it("ne force PAS si user a déjà un password (évite boucle infinie)", () => {
      expect(
        shouldForceSetPassword({
          isChefOrAdmin: true,
          passwordSetDone: true,
          passwordSetAt: "2026-04-21T10:00:00Z",
          isInviteStatus: true,
          profileCompleted: false,
        }),
      ).toBe(false);
    });

    it("ne force PAS si invité a passwordSetAt même sans flag done (rattrapage)", () => {
      expect(
        shouldForceSetPassword({
          isChefOrAdmin: false,
          passwordSetDone: false,
          passwordSetAt: "2026-04-21T10:00:00Z",
          isInviteStatus: true,
          profileCompleted: false,
        }),
      ).toBe(false);
    });

    it("ne force PAS un employé non invité sans password", () => {
      expect(
        shouldForceSetPassword({
          isChefOrAdmin: false,
          passwordSetDone: false,
          passwordSetAt: null,
          isInviteStatus: false,
          profileCompleted: false,
        }),
      ).toBe(false);
    });

    it("ne force PAS si passwordSetDone null (loading initial)", () => {
      expect(
        shouldForceSetPassword({
          isChefOrAdmin: true,
          passwordSetDone: null,
          passwordSetAt: null,
          isInviteStatus: false,
          profileCompleted: false,
        }),
      ).toBe(false);
    });
  });

  describe("Edge cases régression v0.26.3", () => {
    it("hash auth doit déclencher redirect même si autre param présent", () => {
      expect(isAuthHashPresent("#error=expired&type=recovery")).toBe(true);
    });

    it("hash sans préfixe # est pris en compte", () => {
      expect(isAuthHashPresent("access_token=X&type=invite")).toBe(true);
    });

    it("validate ne crashe pas sur strings vides", () => {
      const r = validateSetPassword("", "");
      expect(r.ok).toBe(false);
      expect(r.pwdError).not.toBeNull();
    });

    it("parseHashTokens robuste à URL malformée", () => {
      expect(parseHashTokens("#%%%bad%%")).toBeNull();
    });
  });
});
