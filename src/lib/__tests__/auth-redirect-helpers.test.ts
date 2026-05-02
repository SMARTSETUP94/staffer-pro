// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  shouldForceSetPassword,
  isAuthHashPresent,
  isOnboardingPath,
  shouldIgnoreTokenRefreshForSameUser,
  shouldRedirectToOnboarding,
  isOnboardingSkipped,
  markOnboardingSkipped,
  clearOnboardingSkipped,
  ONBOARDING_SKIPPED_KEY,
} from "@/lib/auth-redirect-helpers";
import { resolveSetPasswordRedirect } from "@/lib/admin-actions";

describe("shouldForceSetPassword", () => {
  it("legacy: chef sans password → force set-password", () => {
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

  it("legacy: admin sans password → force set-password", () => {
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

  it("v0.26.1: invité employé status=invite sans password → force set-password", () => {
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

  it("v0.26.1: invité passwordSetDone=null sans password_set_at → force set-password", () => {
    expect(
      shouldForceSetPassword({
        isChefOrAdmin: false,
        passwordSetDone: null,
        passwordSetAt: null,
        isInviteStatus: true,
        profileCompleted: false,
      }),
    ).toBe(true);
  });

  it("invité ayant déjà skip set-password (passwordSetDone=true) → NE force PAS", () => {
    expect(
      shouldForceSetPassword({
        isChefOrAdmin: false,
        passwordSetDone: true,
        passwordSetAt: null,
        isInviteStatus: true,
        profileCompleted: false,
      }),
    ).toBe(false);
  });

  it("invité ayant déjà set un password (passwordSetAt!=null) → NE force PAS", () => {
    expect(
      shouldForceSetPassword({
        isChefOrAdmin: false,
        passwordSetDone: true,
        passwordSetAt: "2026-04-21T08:32:51Z",
        isInviteStatus: true,
        profileCompleted: false,
      }),
    ).toBe(false);
  });

  it("employé status=actif sans password (legacy) → NE force PAS", () => {
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

  it("chef avec password OK → NE force PAS", () => {
    expect(
      shouldForceSetPassword({
        isChefOrAdmin: true,
        passwordSetDone: true,
        passwordSetAt: "2026-04-21T08:32:51Z",
        isInviteStatus: false,
        profileCompleted: true,
      }),
    ).toBe(false);
  });
});

describe("onboarding guard idempotence", () => {
  it("profil incomplet hors onboarding → redirect onboarding", () => {
    expect(shouldRedirectToOnboarding({ profileCompleted: false, currentPath: "/dashboard" })).toBe(true);
  });

  it("profil incomplet déjà sur /onboarding → pas de redirect en boucle", () => {
    expect(shouldRedirectToOnboarding({ profileCompleted: false, currentPath: "/onboarding" })).toBe(false);
    expect(shouldRedirectToOnboarding({ profileCompleted: false, currentPath: "/onboarding/step" })).toBe(false);
  });

  it("profil complet → jamais de redirect onboarding", () => {
    expect(shouldRedirectToOnboarding({ profileCompleted: true, currentPath: "/dashboard" })).toBe(false);
  });

  it("v0.31.4 : skipped=true (Compléter plus tard) → pas de redirect même profil incomplet", () => {
    expect(
      shouldRedirectToOnboarding({ profileCompleted: false, currentPath: "/dashboard", skipped: true }),
    ).toBe(false);
  });

  it("v0.31.4 : skipped=true ne force pas si profil complet (no-op)", () => {
    expect(
      shouldRedirectToOnboarding({ profileCompleted: true, currentPath: "/dashboard", skipped: true }),
    ).toBe(false);
  });

  it("détecte seulement les chemins onboarding exacts", () => {
    expect(isOnboardingPath("/onboarding")).toBe(true);
    expect(isOnboardingPath("/onboarding/step")).toBe(true);
    expect(isOnboardingPath("/onboarding-old")).toBe(false);
  });
});

describe("auth TOKEN_REFRESHED same user", () => {
  it("ignore TOKEN_REFRESHED sans changement d'utilisateur", () => {
    expect(
      shouldIgnoreTokenRefreshForSameUser({ event: "TOKEN_REFRESHED", newUserId: "u1", lastUserId: "u1" }),
    ).toBe(true);
  });

  it("ne bloque pas SIGNED_IN ni changement d'utilisateur", () => {
    expect(
      shouldIgnoreTokenRefreshForSameUser({ event: "SIGNED_IN", newUserId: "u1", lastUserId: "u1" }),
    ).toBe(false);
    expect(
      shouldIgnoreTokenRefreshForSameUser({ event: "TOKEN_REFRESHED", newUserId: "u2", lastUserId: "u1" }),
    ).toBe(false);
  });
});

describe("isAuthHashPresent", () => {
  it("hash vide → false", () => {
    expect(isAuthHashPresent("")).toBe(false);
    expect(isAuthHashPresent(null)).toBe(false);
    expect(isAuthHashPresent(undefined)).toBe(false);
    expect(isAuthHashPresent("#")).toBe(false);
  });

  it("hash avec access_token → true", () => {
    expect(isAuthHashPresent("#access_token=xyz&refresh_token=abc&type=invite")).toBe(true);
  });

  it("hash type=invite seul → true", () => {
    expect(isAuthHashPresent("#type=invite")).toBe(true);
  });

  it("hash type=recovery → true", () => {
    expect(isAuthHashPresent("#type=recovery&token=x")).toBe(true);
  });

  it("hash type=magiclink → true", () => {
    expect(isAuthHashPresent("#type=magiclink")).toBe(true);
  });

  it("hash sans préfixe # mais avec access_token → true", () => {
    expect(isAuthHashPresent("access_token=xyz")).toBe(true);
  });

  it("hash anchor classique (#section) → false", () => {
    expect(isAuthHashPresent("#dashboard")).toBe(false);
    expect(isAuthHashPresent("#some-section")).toBe(false);
  });

  it("hash random sans token ni type pertinent → false", () => {
    expect(isAuthHashPresent("#foo=bar")).toBe(false);
  });
});

describe("resolveSetPasswordRedirect", () => {
  it("avec siteUrl explicite valide → /auth/set-password collé", () => {
    expect(resolveSetPasswordRedirect("https://staffing.setup.paris")).toBe(
      "https://staffing.setup.paris/auth/set-password",
    );
  });

  it("avec trailing slash → ne double pas", () => {
    expect(resolveSetPasswordRedirect("https://staffing.setup.paris/")).toBe(
      "https://staffing.setup.paris/auth/set-password",
    );
  });

  it("siteUrl http localhost (preview dev) → IGNORÉ, fallback prod (hotfix anti-preview)", () => {
    expect(resolveSetPasswordRedirect("http://localhost:5173")).toBe(
      "https://staffing.setup.paris/auth/set-password",
    );
  });

  it("siteUrl invalide (pas de scheme) → fallback prod", () => {
    expect(resolveSetPasswordRedirect("staffing.setup.paris")).toBe(
      "https://staffing.setup.paris/auth/set-password",
    );
  });

  it("siteUrl undefined → fallback prod", () => {
    expect(resolveSetPasswordRedirect(undefined)).toBe(
      "https://staffing.setup.paris/auth/set-password",
    );
  });

  it("siteUrl chaîne vide → fallback prod", () => {
    expect(resolveSetPasswordRedirect("")).toBe(
      "https://staffing.setup.paris/auth/set-password",
    );
  });

  it("preview Lovable id-preview → IGNORÉ, fallback prod (hotfix anti-preview)", () => {
    const url = "https://id-preview--646285ee-aca4-406c-aa78-a85235d7e6e0.lovable.app";
    expect(resolveSetPasswordRedirect(url)).toBe(
      "https://staffing.setup.paris/auth/set-password",
    );
  });

  it("domaine prod publié staffer-pro.lovable.app → respecté", () => {
    expect(resolveSetPasswordRedirect("https://staffer-pro.lovable.app")).toBe(
      "https://staffer-pro.lovable.app/auth/set-password",
    );
  });
});

describe("v0.31.4 onboarding skip flag (sessionStorage)", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("isOnboardingSkipped : false par défaut", () => {
    expect(isOnboardingSkipped()).toBe(false);
  });

  it("markOnboardingSkipped → isOnboardingSkipped=true", () => {
    markOnboardingSkipped();
    expect(isOnboardingSkipped()).toBe(true);
    expect(window.sessionStorage.getItem(ONBOARDING_SKIPPED_KEY)).toBe("1");
  });

  it("clearOnboardingSkipped purge le flag", () => {
    markOnboardingSkipped();
    clearOnboardingSkipped();
    expect(isOnboardingSkipped()).toBe(false);
  });
});
