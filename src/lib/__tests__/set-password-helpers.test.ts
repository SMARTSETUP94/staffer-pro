import { describe, it, expect } from "vitest";
import { validateSetPassword, parseHashTokens } from "@/lib/set-password-helpers";

describe("validateSetPassword", () => {
  it("password < 8 chars → erreur sous champ password", () => {
    const r = validateSetPassword("abc", "abc");
    expect(r.ok).toBe(false);
    expect(r.pwdError).toBe("8 caractères minimum.");
  });

  it("password ≠ confirm → erreur sous champ confirm", () => {
    const r = validateSetPassword("password123", "password124");
    expect(r.ok).toBe(false);
    expect(r.confirmError).toBe("Les mots de passe ne correspondent pas.");
    expect(r.pwdError).toBeNull();
  });

  it("password valide + match → ok", () => {
    const r = validateSetPassword("monMotDePasse123", "monMotDePasse123");
    expect(r.ok).toBe(true);
    expect(r.pwdError).toBeNull();
    expect(r.confirmError).toBeNull();
  });

  it("cumule les 2 erreurs si password court ET ≠ confirm", () => {
    const r = validateSetPassword("abc", "xyz");
    expect(r.ok).toBe(false);
    expect(r.pwdError).toBeTruthy();
    expect(r.confirmError).toBeTruthy();
  });

  it("password vide → erreur", () => {
    expect(validateSetPassword("", "").ok).toBe(false);
  });
});

describe("parseHashTokens", () => {
  it("parse un hash invitation Supabase complet", () => {
    const hash =
      "#access_token=eyJabc&expires_in=3600&refresh_token=rtoken123&token_type=bearer&type=invite";
    const r = parseHashTokens(hash);
    expect(r).toEqual({ access_token: "eyJabc", refresh_token: "rtoken123" });
  });

  it("hash sans access_token → null", () => {
    expect(parseHashTokens("#error=invalid")).toBeNull();
    expect(parseHashTokens("")).toBeNull();
  });

  it("hash avec access_token mais sans refresh_token → null", () => {
    expect(parseHashTokens("#access_token=abc")).toBeNull();
  });

  it("accepte hash sans le # initial", () => {
    const r = parseHashTokens("access_token=a&refresh_token=b");
    expect(r).toEqual({ access_token: "a", refresh_token: "b" });
  });
});
