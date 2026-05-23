/**
 * Lot 8.2b — Fiche Objet : matrice atelier_chef.
 *
 * Attendu :
 *   - Voit la fiche.
 *   - Bouton Éditer visible.
 *   - nom + respo + commentaire activables ; quantité + heures DISABLED.
 */
import { test, expect } from "@playwright/test";

test.describe("fiche-objet :: atelier_chef (nom + respo + commentaire)", () => {
  test("heures disabled, nom + commentaire éditables", async ({ page }) => {
    await page.goto("/affaires?typologie=fabrication");
    const firstAffaire = page.locator('a[href*="/affaires/"][href*="-"]').first();
    if ((await firstAffaire.count()) === 0) {
      test.skip(true, "Aucune affaire fab seedée");
      return;
    }
    await firstAffaire.click();
    await page.getByRole("link", { name: /fabrication/i }).first().click();
    await page.waitForURL(/\/fabrication$/);

    const ficheLink = page.getByTestId("objet-fiche-link").first();
    if ((await ficheLink.count()) === 0) {
      test.skip(true, "Lien Fiche absent — flag OFF");
      return;
    }
    await ficheLink.click();
    await page.waitForURL(/\/objets\//);

    await expect(page.getByTestId("fiche-objet-title")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("btn-editer-objet")).toBeVisible();

    await page.getByTestId("btn-editer-objet").click();
    await expect(page.locator("#fo-nom")).toBeEnabled();
    await expect(page.locator("#fo-comm")).toBeEnabled();
    await expect(page.locator("#fo-qte")).toBeDisabled();
    // Heures prévues : tous les champs heures sont disabled pour atelier_chef.
    await expect(page.locator("#fo-h-bois")).toBeDisabled();
  });
});
