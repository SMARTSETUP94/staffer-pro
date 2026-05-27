/**
 * L4b — Sidebar unique capability-driven : rôle chef_chantier.
 * Chef voit Production + Équipes + Planning, mais PAS Admin.
 */
import { test, expect } from "@playwright/test";

test("Chef voit Production + Équipes, pas Admin", async ({ page }) => {
  await page.goto("/aujourdhui");
  await expect(page.getByRole("link", { name: /Aujourd'hui/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Chantiers/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Employés/i }).first()).toBeVisible();
  // Admin items invisibles
  await expect(page.getByRole("link", { name: /Feature flags/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Permissions/i })).toHaveCount(0);
});
