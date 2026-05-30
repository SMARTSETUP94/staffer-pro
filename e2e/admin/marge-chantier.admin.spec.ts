/**
 * Marge chantier (Option A standalone, 30 mai 2026).
 *
 * Test 1 — admin accède à /admin/marge-chantier et voit les 8 onglets.
 * Le test "commercial bloqué" vit dans `marge-chantier.commercial.spec.ts`
 * (project Playwright différent, storageState commercial).
 */
import { test, expect } from "@playwright/test";

test("Admin accède à /admin/marge-chantier et voit les 8 onglets", async ({ page }) => {
  await page.goto("/admin/marge-chantier");
  await expect(page).toHaveURL(/\/admin\/marge-chantier/);

  const tabs = [
    /Base RH/i,
    /Référentiels/i,
    /Registre devis/i,
    /^.*Devis$/i,
    /Heures/i,
    /Synthèse chantiers/i,
    /Marge par personne/i,
    /Performance/i,
  ];
  for (const name of tabs) {
    await expect(page.getByRole("tab", { name }).first()).toBeVisible();
  }
});
