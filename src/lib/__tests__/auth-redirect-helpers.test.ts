import { describe, it, expect } from "vitest";
import {
  shouldForceSetPassword,
  isAuthHashPresent,
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

  it("siteUrl http (preview) → conservé", () => {
    expect(resolveSetPasswordRedirect("http://localhost:5173")).toBe(
      "http://localhost:5173/auth/set-password",
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

  it("preview Lovable → respecté", () => {
    const url = "https://id-preview--646285ee-aca4-406c-aa78-a85235d7e6e0.lovable.app";
    expect(resolveSetPasswordRedirect(url)).toBe(`${url}/auth/set-password`);
  });
});
