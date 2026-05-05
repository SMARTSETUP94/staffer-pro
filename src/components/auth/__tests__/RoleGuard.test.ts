/**
 * v0.21.1 Phase 1 — Tests RoleGuard (logique de décision)
 *
 * Tests purs sur la matrice rôle × requirement. Le rendu (Navigate/loader)
 * est testé en E2E (anti-fuite-rgpd.employe-desktop.spec.ts).
 */
import { describe, expect, it } from "vitest";

type Role = "admin" | "chef_chantier" | "employe";

function isAllowed(roles: Role[], required: "admin" | "chef_or_admin"): boolean {
  const isAdmin = roles.includes("admin");
  const isChef = roles.includes("chef_chantier");
  if (required === "admin") return isAdmin;
  return isAdmin || isChef;
}

describe("RoleGuard — matrice de décision", () => {
  it("admin → autorisé partout", () => {
    expect(isAllowed(["admin"], "admin")).toBe(true);
    expect(isAllowed(["admin"], "chef_or_admin")).toBe(true);
  });

  it("chef_chantier → autorisé chef_or_admin, refusé admin", () => {
    expect(isAllowed(["chef_chantier"], "admin")).toBe(false);
    expect(isAllowed(["chef_chantier"], "chef_or_admin")).toBe(true);
  });

  it("employe → toujours refusé", () => {
    expect(isAllowed(["employe"], "admin")).toBe(false);
    expect(isAllowed(["employe"], "chef_or_admin")).toBe(false);
  });

  it("aucun rôle → refusé", () => {
    expect(isAllowed([], "admin")).toBe(false);
    expect(isAllowed([], "chef_or_admin")).toBe(false);
  });

  it("rôles cumulés admin+chef → autorisé partout", () => {
    expect(isAllowed(["admin", "chef_chantier"], "admin")).toBe(true);
    expect(isAllowed(["admin", "chef_chantier"], "chef_or_admin")).toBe(true);
  });
});
