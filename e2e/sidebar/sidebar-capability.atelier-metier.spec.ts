/**
 * L5-B clôture — Sidebar capability-driven : rôle atelier_metier.
 * Atelier métier voit Fabrication (scope métier), pas Pilotage/RH/Admin/Opportunités.
 */
import { test, expect } from "@playwright/test";

test("Atelier métier voit Fabrication, pas Pilotage/RH/Admin/Opportunités", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Aujourd'hui/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Fabrication atelier/i }).first()).toBeVisible();
  // Anti-fuite
  await expect(page.getByRole("link", { name: /Pipeline opportunités/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Devis$/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Hub RH/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Contrats CDDU/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Feature flags/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Utilisateurs/i })).toHaveCount(0);
});
