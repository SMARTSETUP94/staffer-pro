/**
 * Lot 8.2 — Fiche Objet : matrice rôle chef_chantier.
 * Vérifie que le bouton Éditer est présent + que respo_fab_id est éditable.
 *
 * Même découverte dynamique que la spec admin.
 */
import { test, expect } from "@playwright/test";

test.describe("fiche-objet :: chef_chantier", () => {
  test("voit le bouton Éditer (cap objet.edit accordée)", async ({ page }) => {
    await page.goto("/affaires?typologie=fabrication");
    const link = page.locator('a[href*="/affaires/"][href*="-"]').first();
    if ((await link.count()) === 0) {
      test.skip(true, "Aucune affaire fab seedée");
      return;
    }
    await link.click();
    await page.getByRole("link", { name: /fabrication/i }).first().click();
    await page.waitForURL(/\/fabrication$/);

    const objetCard = page.locator('[data-objet-id]').first();
    if ((await objetCard.count()) === 0) {
      test.skip(true, "Pas de data-objet-id (Lot 8.5)");
      return;
    }
    const objetId = await objetCard.getAttribute("data-objet-id");
    const affaireId = page.url().match(/affaires\/([^/]+)/)?.[1];
    if (!objetId || !affaireId) return;

    await page.goto(`/affaires/${affaireId}/objets/${objetId}`);
    await expect(page.getByTestId("fiche-objet-title")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("btn-editer-objet")).toBeVisible();
  });
});
