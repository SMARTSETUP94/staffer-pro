/**
 * Lot 7.0c — Capability gating : routes admin-only refusées au CHEF (cas échec).
 *
 * Vérifie pour /admin/permissions, /admin/feature-flags, /rh :
 *  - Accès route directe bloqué (requireCapability redirige vers /).
 *  - Pas d'entrée sidebar correspondante (anti-fuite UI).
 */
import { test, expect } from "@playwright/test";
import { assertForbiddenRoutes } from "../helpers/role-smoke";

const FORBIDDEN_FOR_CHEF = [
  "/admin/permissions",
  "/admin/feature-flags",
  "/rh",
] as const;

test.describe("Lot 7.0c — Capabilities admin-only (forbidden CHEF)", () => {
  test("chef ne peut pas accéder aux routes admin-only en direct", async ({ page }) => {
    await assertForbiddenRoutes(page, FORBIDDEN_FOR_CHEF);
  });

  test("chef ne voit pas les entrées sidebar admin-only", async ({ page }) => {
    await page.goto("/dashboard");
    const sidebar = page.getByRole("navigation").first();
    await expect(sidebar).toBeVisible();

    // Aucune entrée pour Permissions / Feature Flags / RH dans la nav du chef.
    await expect(
      page.getByRole("link", { name: /permissions/i }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: /feature.?flags/i }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: /^rh$|ressources humaines/i }),
    ).toHaveCount(0);
  });
});
