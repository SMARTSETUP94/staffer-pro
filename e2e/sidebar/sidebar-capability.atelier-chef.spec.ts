/**
 * L4b — Sidebar unique capability-driven : rôle atelier_chef.
 * Atelier chef voit Fabrication, mais pas Pipeline opportunités ni Admin.
 */
import { test, expect } from "@playwright/test";

test("Atelier chef voit Fabrication, pas Pipeline ni Admin", async ({ page }) => {
  await page.goto("/aujourdhui");
  await expect(page.getByRole("link", { name: /Aujourd'hui/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Fabrication atelier/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Pipeline opportunités/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Feature flags/i })).toHaveCount(0);
});
