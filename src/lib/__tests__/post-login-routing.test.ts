/**
 * v0.50 (L4d) — Test minimal post-login.
 * Tous les rôles → `/aujourdhui` (page d'accueil unique capability-driven).
 */
import { describe, it, expect } from "vitest";
import { resolvePostLoginTarget } from "@/lib/post-login-routing";

describe("Post-login routing v0.50 — page d'accueil unique", () => {
  it("retourne toujours /aujourdhui", () => {
    expect(resolvePostLoginTarget()).toBe("/aujourdhui");
  });
});
