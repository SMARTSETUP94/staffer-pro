/**
 * Marge chantier — anti-fuite RGPD : commercial bloqué.
 * Cap requise = `section.admin`, donc redirect propre attendu.
 */
import { test, expect } from "@playwright/test";

test("Commercial bloqué sur /admin/marge-chantier (redirect)", async ({ page }) => {
  await page.goto("/admin/marge-chantier");
  // Attendu : redirect hors de /admin/marge-chantier (cap section.admin manquante)
  await page.waitForURL((url) => !/\/admin\/marge-chantier/.test(url.pathname), {
    timeout: 10_000,
  });
  expect(page.url()).not.toMatch(/\/admin\/marge-chantier/);
  // Pas de tab "Base RH" dans le DOM (page jamais rendue)
  await expect(page.getByRole("tab", { name: /Base RH/i })).toHaveCount(0);
});
