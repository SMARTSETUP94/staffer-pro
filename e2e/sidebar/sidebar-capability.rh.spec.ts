/**
 * L5-B clôture — Sidebar capability-driven : rôle rh.
 * RH voit Hub RH + Contrats CDDU + Employés, pas Devis/Opportunités/Fabrication/Admin.
 */
import { test, expect } from "@playwright/test";

test("RH voit Hub RH/Contrats CDDU/Employés, pas Devis/Opportunités/Fabrication/Admin", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Aujourd'hui/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Hub RH/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Contrats CDDU/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Employés/i }).first()).toBeVisible();
  // Anti-fuite
  await expect(page.getByRole("link", { name: /^Devis$/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Pipeline opportunités/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Fabrication atelier/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Feature flags/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Utilisateurs/i })).toHaveCount(0);
});
