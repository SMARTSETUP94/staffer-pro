/**
 * L4b — Sidebar unique capability-driven : rôle commercial.
 * Commercial voit Devis + Pipeline opportunités, mais pas Fabrication atelier ni Admin.
 */
import { test, expect } from "@playwright/test";

test("Commercial voit Devis/Pipeline, pas Fabrication ni Admin", async ({ page }) => {
  await page.goto("/aujourdhui");
  await expect(page.getByRole("link", { name: /Aujourd'hui/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /^Devis$/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Pipeline opportunités/i }).first()).toBeVisible();
  // Anti-fuite
  await expect(page.getByRole("link", { name: /Fabrication atelier/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Feature flags/i })).toHaveCount(0);
});
