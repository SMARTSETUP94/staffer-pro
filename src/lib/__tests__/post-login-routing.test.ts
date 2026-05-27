/**
 * v0.49 (L4a) — Tests routing post-login adaptés au modèle "page d'accueil unique".
 *
 * Décision Gabin 26 mai 2026 : suppression de la dualité mobile/desktop.
 * Tous les rôles atterrissent désormais sur `/aujourdhui`. Les tests
 * v0.27.5 qui assumaient la dualité (dashboard / mobile/aujourdhui /
 * mobile/chef/dashboard / ma-semaine) sont marqués `.skip()` et seront
 * supprimés en L4d (cleanup final).
 *
 * Les tests AppGuard (sécurité accès employé) restent valides : la
 * whitelist a juste été étendue à `/aujourdhui` et `/inbox` (redirect).
 */

import { describe, it, expect } from "vitest";
import { resolvePostLoginTarget as resolveReal, type PostLoginCtx as RealCtx } from "@/lib/post-login-routing";

type Role = "admin" | "chef_chantier" | "employe";

interface PostLoginCtx {
  isAdmin: boolean;
  isAdminOrChef: boolean;
  effIsMobile: boolean;
  isPreviewing?: boolean;
}

/** Wrapper qui appelle le vrai module (effIsAdminOrChef = isAdminOrChef en l'absence de preview). */
function resolvePostLoginTarget(ctx: PostLoginCtx): string {
  const real: RealCtx = {
    isAdmin: ctx.isAdmin,
    isAdminOrChef: ctx.isAdminOrChef,
    effIsMobile: ctx.effIsMobile,
    effIsAdminOrChef: ctx.isAdminOrChef,
    isPreviewing: ctx.isPreviewing ?? false,
  };
  return resolveReal(real);
}

const EMPLOYE_DESKTOP_ALLOWED = [
  "/aujourdhui",
  "/dashboard",
  "/dashboard-employe",
  "/inbox",
  "/ma-semaine",
  "/mes-heures",
  "/mes-swaps",
  "/mes-propositions",
  "/fabrication",
];

function isPathAllowedForEmploye(path: string): boolean {
  return EMPLOYE_DESKTOP_ALLOWED.some(
    (p) => path === p || path.startsWith(p + "/"),
  );
}

function resolveAppGuardTarget(role: Role, currentPath: string): string | null {
  const isAdminOrChef = role === "admin" || role === "chef_chantier";
  if (isAdminOrChef) return null;
  if (isPathAllowedForEmploye(currentPath)) return null;
  return "/ma-semaine";
}

describe("Post-login routing v0.49 — page d'accueil unique", () => {
  it("admin desktop → /aujourdhui", () => {
    expect(
      resolvePostLoginTarget({ isAdmin: true, isAdminOrChef: true, effIsMobile: false }),
    ).toBe("/aujourdhui");
  });

  it("employé mobile → /aujourdhui (plus de dualité)", () => {
    expect(
      resolvePostLoginTarget({ isAdmin: false, isAdminOrChef: false, effIsMobile: true }),
    ).toBe("/aujourdhui");
  });

  it("chef desktop → /aujourdhui", () => {
    expect(
      resolvePostLoginTarget({ isAdmin: false, isAdminOrChef: true, effIsMobile: false }),
    ).toBe("/aujourdhui");
  });

  it("employé desktop → /aujourdhui", () => {
    expect(
      resolvePostLoginTarget({ isAdmin: false, isAdminOrChef: false, effIsMobile: false }),
    ).toBe("/aujourdhui");
  });
});

describe.skip("[L4d cleanup] Post-login routing par rôle (v0.27.5)", () => {
  it("admin desktop → /dashboard", () => {
    expect(
      resolvePostLoginTarget({ isAdmin: true, isAdminOrChef: true, effIsMobile: false }),
    ).toBe("/dashboard");
  });

  it("chef_chantier desktop → /dashboard", () => {
    expect(
      resolvePostLoginTarget({ isAdmin: false, isAdminOrChef: true, effIsMobile: false }),
    ).toBe("/dashboard");
  });

  it("employé desktop → /ma-semaine (PAS /dashboard pour anti-fuite RGPD)", () => {
    const target = resolvePostLoginTarget({
      isAdmin: false,
      isAdminOrChef: false,
      effIsMobile: false,
    });
    expect(target).toBe("/ma-semaine");
    expect(target).not.toBe("/dashboard");
  });

  it("admin réel sur mobile → /dashboard (pas de version mobile admin)", () => {
    expect(
      resolvePostLoginTarget({ isAdmin: true, isAdminOrChef: true, effIsMobile: true }),
    ).toBe("/dashboard");
  });

  it("mobile non-admin : chef → /mobile/chef/dashboard, employé → /mobile/aujourdhui", () => {
    expect(
      resolvePostLoginTarget({ isAdmin: false, isAdminOrChef: true, effIsMobile: true }),
    ).toBe("/mobile/chef/dashboard");
    expect(
      resolvePostLoginTarget({ isAdmin: false, isAdminOrChef: false, effIsMobile: true }),
    ).toBe("/mobile/aujourdhui");
  });

  it("admin en preview chef mobile → /mobile/chef/dashboard", () => {
    expect(
      resolvePostLoginTarget({ isAdmin: true, isAdminOrChef: true, effIsMobile: true, isPreviewing: true }),
    ).toBe("/mobile/chef/dashboard");
  });
});

describe("AppGuard — sécurité accès employé (toujours valide)", () => {
  it("admin a accès à toutes les routes (pas de redirect)", () => {
    expect(resolveAppGuardTarget("admin", "/affaires")).toBe(null);
    expect(resolveAppGuardTarget("admin", "/parametres/utilisateurs")).toBe(null);
    expect(resolveAppGuardTarget("admin", "/audit-auth")).toBe(null);
  });

  it("chef a accès à toutes les routes opérationnelles (pas de redirect)", () => {
    expect(resolveAppGuardTarget("chef_chantier", "/planning")).toBe(null);
    expect(resolveAppGuardTarget("chef_chantier", "/affaires")).toBe(null);
  });

  it("employé qui tente /affaires → redirect /ma-semaine", () => {
    expect(resolveAppGuardTarget("employe", "/affaires")).toBe("/ma-semaine");
  });

  it("employé qui tente /parametres/utilisateurs → redirect /ma-semaine", () => {
    expect(resolveAppGuardTarget("employe", "/parametres/utilisateurs")).toBe(
      "/ma-semaine",
    );
  });

  it("employé sur /aujourdhui → autorisé (page d'accueil unique v0.49)", () => {
    expect(resolveAppGuardTarget("employe", "/aujourdhui")).toBe(null);
  });

  it("employé sur /ma-semaine → autorisé", () => {
    expect(resolveAppGuardTarget("employe", "/ma-semaine")).toBe(null);
  });

  it("employé sur /dashboard → autorisé (devient redirect → /aujourdhui)", () => {
    expect(resolveAppGuardTarget("employe", "/dashboard")).toBe(null);
  });

  it("employé sur /inbox → autorisé (devient redirect → /aujourdhui)", () => {
    expect(resolveAppGuardTarget("employe", "/inbox")).toBe(null);
  });

  it("employé sur /mes-heures → autorisé", () => {
    expect(resolveAppGuardTarget("employe", "/mes-heures")).toBe(null);
  });

  it("employé sur /fabrication/mes-etapes → autorisé (sous-chemin)", () => {
    expect(resolveAppGuardTarget("employe", "/fabrication/mes-etapes")).toBe(null);
  });
});
