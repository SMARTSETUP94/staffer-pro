/**
 * Lot 7.0c — Capability gating : routes admin-only refusées à l'EMPLOYÉ (cas échec).
 */
import { test, expect } from "@playwright/test";
import { assertForbiddenRoutes } from "../helpers/role-smoke";

const FORBIDDEN_FOR_EMPLOYE = [
  "/admin/permissions",
  "/admin/feature-flags",
  "/rh",
] as const;

test.describe("Lot 7.0c — Capabilities admin-only (forbidden EMPLOYÉ)", () => {
  test("employé ne peut pas accéder aux routes admin-only en direct", async ({ page }) => {
    await assertForbiddenRoutes(page, FORBIDDEN_FOR_EMPLOYE);
  });

  test("employé ne voit pas les entrées sidebar admin-only", async ({ page }) => {
    await page.goto("/ma-semaine");
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
