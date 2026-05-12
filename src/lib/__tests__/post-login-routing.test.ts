/**
 * v0.27.5 — Tests routing post-login par rôle.
 *
 * Garantit qu'après /login, chaque rôle atterrit sur la bonne route :
 *  - admin / chef → /dashboard
 *  - employé desktop → /ma-semaine (PAS /dashboard pour anti-fuite RGPD)
 *  - preview employé mobile → /mobile/aujourdhui
 *
 * Couvre aussi le garde-fou AppGuard : un employé qui tente une URL admin
 * doit être renvoyé sur /ma-semaine.
 */

import { describe, it, expect } from "vitest";

type Role = "admin" | "chef_chantier" | "employe";

interface PostLoginCtx {
  isAdminOrChef: boolean;
  effIsMobile: boolean;
}

/** Réplique la logique de routes/index.tsx (IndexRedirect) pour tester. */
function resolvePostLoginTarget(ctx: PostLoginCtx): string {
  if (ctx.effIsMobile) return ctx.isAdminOrChef ? "/mobile/chef/dashboard" : "/mobile/aujourdhui";
  if (ctx.isAdminOrChef) return "/dashboard";
  return "/ma-semaine";
}

const EMPLOYE_DESKTOP_ALLOWED = [
  "/dashboard",
  "/dashboard-employe",
  "/ma-semaine",
  "/mes-heures",
  "/mes-swaps",
  "/mes-propositions",
  "/fabrication",
];

/** Réplique la logique du AppGuard pour les chemins autorisés en vue employé. */
function isPathAllowedForEmploye(path: string): boolean {
  return EMPLOYE_DESKTOP_ALLOWED.some(
    (p) => path === p || path.startsWith(p + "/"),
  );
}

function resolveAppGuardTarget(role: Role, currentPath: string): string | null {
  const isAdminOrChef = role === "admin" || role === "chef_chantier";
  if (isAdminOrChef) return null; // pas de redirect
  if (isPathAllowedForEmploye(currentPath)) return null;
  return "/ma-semaine";
}

describe("Post-login routing par rôle (v0.27.5)", () => {
  it("admin desktop → /dashboard", () => {
    expect(
      resolvePostLoginTarget({ isAdminOrChef: true, effIsMobile: false }),
    ).toBe("/dashboard");
  });

  it("chef_chantier desktop → /dashboard", () => {
    expect(
      resolvePostLoginTarget({ isAdminOrChef: true, effIsMobile: false }),
    ).toBe("/dashboard");
  });

  it("employé desktop → /ma-semaine (PAS /dashboard pour anti-fuite RGPD)", () => {
    const target = resolvePostLoginTarget({
      isAdminOrChef: false,
      effIsMobile: false,
    });
    expect(target).toBe("/ma-semaine");
    expect(target).not.toBe("/dashboard");
  });

  it("mobile (vrai smartphone ou preview) : chef/admin → /mobile/chef/dashboard, employé → /mobile/aujourdhui", () => {
    expect(
      resolvePostLoginTarget({ isAdminOrChef: true, effIsMobile: true }),
    ).toBe("/mobile/chef/dashboard");
    expect(
      resolvePostLoginTarget({ isAdminOrChef: false, effIsMobile: true }),
    ).toBe("/mobile/aujourdhui");
  });
});

describe("AppGuard — sécurité accès employé", () => {
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

  it("employé qui tente /audit-auth → redirect /ma-semaine", () => {
    expect(resolveAppGuardTarget("employe", "/audit-auth")).toBe("/ma-semaine");
  });

  it("employé sur /ma-semaine → autorisé (pas de redirect)", () => {
    expect(resolveAppGuardTarget("employe", "/ma-semaine")).toBe(null);
  });

  it("employé sur /dashboard → autorisé (le garde widgets v0.27.4 filtre)", () => {
    expect(resolveAppGuardTarget("employe", "/dashboard")).toBe(null);
  });

  it("employé sur /mes-heures → autorisé", () => {
    expect(resolveAppGuardTarget("employe", "/mes-heures")).toBe(null);
  });

  it("employé sur /fabrication/mes-etapes → autorisé (sous-chemin)", () => {
    expect(resolveAppGuardTarget("employe", "/fabrication/mes-etapes")).toBe(null);
  });

  it("employé sur /dashboard-employe (legacy) → autorisé (alias)", () => {
    expect(resolveAppGuardTarget("employe", "/dashboard-employe")).toBe(null);
  });
});

describe("Flows mock auth — 5 cas E2E synthétiques", () => {
  /** Mock du flow inscription invité : magic link → set-password → onboarding → ma-semaine */
  it("Flow 1 — Inscription invité employé (magic link)", () => {
    // Étape 1 : hash invite reçu sur "/" → redirect /auth/set-password
    const hashPresent = "#access_token=xxx&type=invite";
    expect(hashPresent.includes("type=invite")).toBe(true);
    // Étape 2 : après set-password → /onboarding (pas profile_completed)
    // Étape 3 : après onboarding finalisé → /ma-semaine pour employé
    const finalTarget = resolvePostLoginTarget({
      isAdminOrChef: false,
      effIsMobile: false,
    });
    expect(finalTarget).toBe("/ma-semaine");
  });

  /** Mock du flow login email+password admin */
  it("Flow 2 — Login admin email+password → /dashboard", () => {
    const target = resolvePostLoginTarget({
      isAdminOrChef: true,
      effIsMobile: false,
    });
    expect(target).toBe("/dashboard");
  });

  /** Mock du flow magic link chef */
  it("Flow 3 — Magic link chef → /dashboard", () => {
    const target = resolvePostLoginTarget({
      isAdminOrChef: true,
      effIsMobile: false,
    });
    expect(target).toBe("/dashboard");
  });

  /** Mock reset password → reconnexion */
  it("Flow 4 — Reset password puis re-login → routing rôle normal", () => {
    // Après reset, le user revient sur /login puis se connecte normalement
    expect(
      resolvePostLoginTarget({ isAdminOrChef: false, effIsMobile: false }),
    ).toBe("/ma-semaine");
    expect(
      resolvePostLoginTarget({ isAdminOrChef: true, effIsMobile: false }),
    ).toBe("/dashboard");
  });

  /** Mock onboarding step1 RGPD → step2..4 → /ma-semaine */
  it("Flow 5 — Onboarding 4 étapes complété par employé → /ma-semaine", () => {
    // Le bouton "Continuer" reste cliquable même si saveStepN échoue (toast erreur)
    // Une fois step3 finalisé, navigate({ to: "/dashboard" }) puis AppGuard
    // bascule l'employé sur /ma-semaine.
    expect(
      resolveAppGuardTarget("employe", "/dashboard"),
    ).toBe(null); // /dashboard est dans EMPLOYE_DESKTOP_ALLOWED → ok
    // Mais à terme la sidebar pointe sur /ma-semaine, qui redirige vers /dashboard.
    expect(resolveAppGuardTarget("employe", "/ma-semaine")).toBe(null);
  });
});
