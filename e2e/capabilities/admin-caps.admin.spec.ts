/**
 * Lot 7.0c — Capability gating : routes admin-only vues par ADMIN (cas succès).
 *
 * Routes couvertes :
 *  - /admin/permissions       (cap admin.permissions.manage)
 *  - /admin/feature-flags     (cap admin.feature_flags.manage)
 *  - /rh                      (cap rh.hub.view)
 *
 * Cas testés :
 *  1. L'admin accède directement aux 3 routes sans redirect ni error-boundary.
 *  2. L'admin voit les entrées correspondantes dans la sidebar.
 */
import { test, expect } from "@playwright/test";
import { visitAllowedRoutes } from "../helpers/role-smoke";

const ADMIN_ONLY_ROUTES = [
  "/admin/permissions",
  "/admin/feature-flags",
  "/rh",
] as const;

test.describe("Lot 7.0c — Capabilities admin-only (succès ADMIN)", () => {
  test("admin accède aux 3 routes admin-only sans error", async ({ page }) => {
    const errors = await visitAllowedRoutes(page, ADMIN_ONLY_ROUTES);
    expect(
      errors,
      `Erreurs console détectées :\n${errors.join("\n")}`,
    ).toEqual([]);
  });

  test("admin voit les entrées sidebar correspondantes", async ({ page }) => {
    await page.goto("/dashboard");
    // Les libellés peuvent évoluer — on cible large via regex tolérante.
    // (Si les libellés bougent, ajuster ici sans casser la logique cap.)
    const sidebar = page.getByRole("navigation").first();
    await expect(sidebar).toBeVisible();
    // Permissions
    await expect(
      page.getByRole("link", { name: /permissions/i }).first(),
    ).toBeVisible({ timeout: 3_000 });
    // Feature flags
    await expect(
      page.getByRole("link", { name: /(feature.?flags|fonctionnalit)/i }).first(),
    ).toBeVisible({ timeout: 3_000 });
    // RH
    await expect(
      page.getByRole("link", { name: /\brh\b|ressources humaines/i }).first(),
    ).toBeVisible({ timeout: 3_000 });
  });
});
