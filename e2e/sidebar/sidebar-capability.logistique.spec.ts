/**
 * L5-B clôture — Sidebar capability-driven : rôle logistique.
 * Logistique voit Véhicules + Planning véhicules + Demandes transport,
 * pas Devis/RH/Admin.
 */
import { test, expect } from "@playwright/test";

test("Logistique voit Flotte/Planning véhicules/Transport, pas Devis/RH/Admin", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Aujourd'hui/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Véhicules/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Planning véhicules/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Demandes transport/i }).first()).toBeVisible();
  // Anti-fuite
  await expect(page.getByRole("link", { name: /^Devis$/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Hub RH/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Contrats CDDU/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Feature flags/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Utilisateurs/i })).toHaveCount(0);
});
